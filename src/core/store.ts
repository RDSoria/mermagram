import { clamp, debounce } from "./util";
import {
  DEFAULT_LAYOUT,
  DEFAULT_VISUAL_THEME,
  isAppLayout,
  isVisualTheme,
  type AppLayout,
  type VisualTheme,
} from "./appearance";
import {
  loadCode,
  loadPrefs,
  saveCode,
  savePrefs,
  type PersistedPrefs,
} from "./persistence";

export interface Prefs {
  collapsed: boolean;
  width: number;
  visualTheme: VisualTheme;
  layout: AppLayout;
}

export interface MermaidDocument {
  id: string;
  code: string;
  path: string | null;
  name: string;
  savedCode: string | null;
}

type Event = "code" | "prefs" | "documents";
type Handler = () => void;

const DEFAULT_PREFS: Prefs = {
  collapsed: false,
  width: 420,
  visualTheme: DEFAULT_VISUAL_THEME,
  layout: DEFAULT_LAYOUT,
};
const MIN_WIDTH = 260;
const MAX_WIDTH = 760;

/**
 * Tiny observable store. Holds the diagram source and editor preferences,
 * persisting both to localStorage.
 */
class Store {
  private codeValue: string;
  private documentsValue: MermaidDocument[];
  private activeDocumentId: string;
  private prefsValue: Prefs;
  private handlers: Record<Event, Set<Handler>> = {
    code: new Set(),
    prefs: new Set(),
    documents: new Set(),
  };
  private persistCode = debounce((value: string) => saveCode(value), 400);

  constructor() {
    this.codeValue = loadCode() ?? "";
    const initial = this.createDocumentRecord(this.codeValue, null, "", this.codeValue);
    this.documentsValue = [initial];
    this.activeDocumentId = initial.id;
    const stored = loadPrefs();
    this.prefsValue = {
      collapsed: typeof stored.collapsed === "boolean" ? stored.collapsed : DEFAULT_PREFS.collapsed,
      width: typeof stored.width === "number" && Number.isFinite(stored.width)
        ? clamp(stored.width, MIN_WIDTH, MAX_WIDTH)
        : DEFAULT_PREFS.width,
      visualTheme: isVisualTheme(stored.visualTheme) ? stored.visualTheme : DEFAULT_VISUAL_THEME,
      layout: isAppLayout(stored.layout) ? stored.layout : DEFAULT_LAYOUT,
    };
  }

  get code(): string {
    return this.codeValue;
  }

  setCode(value: string): void {
    if (value === this.codeValue) return;
    this.codeValue = value;
    const active = this.activeDocument;
    active.code = value;
    this.persistCode(value);
    this.emit("code");
    this.emit("documents");
  }

  get documents(): readonly MermaidDocument[] { return this.documentsValue; }

  get activeDocument(): MermaidDocument {
    return this.documentsValue.find((document) => document.id === this.activeDocumentId)!;
  }

  renameActiveDocument(name: string): boolean {
    const active = this.activeDocument;
    const normalizedName = name.trim();
    if (active.path !== null || normalizedName.length === 0) return false;
    if (active.name === normalizedName) return true;
    active.name = normalizedName;
    this.emit("documents");
    return true;
  }

  createDocument(code: string, path: string | null = null, name?: string, saved = path !== null): MermaidDocument {
    const document = this.createDocumentRecord(code, path, name ?? (path?.split(/[\\/]/).pop() || `Diagrama ${this.documentsValue.length + 1}`), saved ? code : null);
    const existing = path ? this.documentsValue.find((item) => item.path === path) : undefined;
    if (existing) {
      this.activateDocument(existing.id);
      return existing;
    }
    this.documentsValue = [...this.documentsValue, document];
    this.activateDocument(document.id);
    return document;
  }

  activateDocument(id: string): void {
    const document = this.documentsValue.find((item) => item.id === id);
    if (!document || id === this.activeDocumentId) return;
    this.activeDocumentId = id;
    this.codeValue = document.code;
    this.emit("code");
    this.emit("documents");
  }

  markActiveDocumentSaved(code: string, path: string | null, name: string): void {
    const active = this.activeDocument;
    active.code = code;
    active.savedCode = code;
    active.path = path;
    active.name = name;
    this.emit("documents");
  }

  removeDocument(id: string): void {
    const index = this.documentsValue.findIndex((document) => document.id === id);
    if (index < 0) return;
    const wasActive = this.activeDocumentId === id;
    this.documentsValue = this.documentsValue.filter((document) => document.id !== id);
    if (this.documentsValue.length === 0) {
      const blank = this.createDocumentRecord("", null, "", null);
      this.documentsValue = [blank];
      this.activeDocumentId = blank.id;
      this.codeValue = "";
    } else if (wasActive) {
      const next = this.documentsValue[Math.min(index, this.documentsValue.length - 1)];
      this.activeDocumentId = next.id;
      this.codeValue = next.code;
    }
    this.emit("code");
    this.emit("documents");
  }

  private createDocumentRecord(code: string, path: string | null, name: string, savedCode: string | null): MermaidDocument {
    return { id: crypto.randomUUID(), code, path, name, savedCode };
  }

  get prefs(): Prefs {
    return this.prefsValue;
  }

  setPrefs(patch: Partial<Prefs>): void {
    const next: Prefs = {
      ...this.prefsValue,
      ...patch,
      visualTheme: isVisualTheme(patch.visualTheme) ? patch.visualTheme : this.prefsValue.visualTheme,
      layout: isAppLayout(patch.layout) ? patch.layout : this.prefsValue.layout,
    };
    next.width = clamp(next.width, MIN_WIDTH, MAX_WIDTH);
    this.prefsValue = next;
    const persisted: PersistedPrefs = {
      collapsed: next.collapsed,
      width: next.width,
      visualTheme: next.visualTheme,
      layout: next.layout,
    };
    savePrefs(persisted);
    this.emit("prefs");
  }

  on(event: Event, handler: Handler): void {
    this.handlers[event].add(handler);
  }

  private emit(event: Event): void {
    this.handlers[event].forEach((handler) => handler());
  }
}

export const store = new Store();
export const WIDTH_LIMITS = { min: MIN_WIDTH, max: MAX_WIDTH };
