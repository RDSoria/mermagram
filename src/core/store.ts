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

type Event = "code" | "prefs";
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
  private prefsValue: Prefs;
  private handlers: Record<Event, Set<Handler>> = {
    code: new Set(),
    prefs: new Set(),
  };
  private persistCode = debounce((value: string) => saveCode(value), 400);

  constructor() {
    this.codeValue = loadCode() ?? "";
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
    this.persistCode(value);
    this.emit("code");
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
