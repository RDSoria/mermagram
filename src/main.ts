import "./styles/index.css";
import { SAMPLE_DIAGRAM } from "./core/sample";
import { initMermaid, renderMermaid, setMermaidTheme, type MermaidIssue } from "./core/mermaid";
import { store } from "./core/store";
import { createEditor } from "./features/editor";
import { Viewer } from "./features/viewer";
import { initLayout } from "./features/layout";
import { initExport } from "./features/export";
import { initFileMenu } from "./features/file-menu";
import { initPreferences } from "./features/preferences";
import { initI18n, onLanguageChange, t } from "./core/i18n";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isDesktop } from "./platform/save";

function required<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Faltó el elemento #${id} en el DOM.`);
  return element as T;
}

/**
 * Dev helper: `?reset=1` forgets the local draft so the app starts fresh.
 * Useful after experimenting with broken diagrams.
 */
const params = new URLSearchParams(window.location.search);
if (params.has("reset")) {
  try {
    window.localStorage.removeItem("mermagram:code");
    window.localStorage.removeItem("mermagram:prefs");
    window.localStorage.removeItem("mermaid-studio:code");
    window.localStorage.removeItem("mermaid-studio:prefs");
  } catch {
    /* ignore */
  }
  const url = new URL(window.location.href);
  url.searchParams.delete("reset");
  window.location.replace(url.toString());
}

function boot(): void {
  initI18n();
  const applyAppearance = (): void => {
    document.documentElement.dataset.theme = store.prefs.visualTheme;
    document.documentElement.dataset.layout = store.prefs.layout;
  };
  applyAppearance();
  store.on("prefs", applyAppearance);
  if (isDesktop()) void getCurrentWindow().setTitle(t("windowTitle"));
  onLanguageChange(() => {
    if (isDesktop()) void getCurrentWindow().setTitle(t("windowTitle"));
  });
  initMermaid(store.prefs.visualTheme);
  if (!store.code) store.setCode(SAMPLE_DIAGRAM);

  const statusEl = required<HTMLButtonElement>("syntax-status");
  const statusText = required("syntax-text");
  const metaEl = required("editor-meta");
  const errorsDialog = required<HTMLDialogElement>("syntax-errors-dialog");
  const errorsList = required<HTMLUListElement>("syntax-errors-list");
  const closeErrors = required<HTMLButtonElement>("syntax-errors-close");
  let focusEditor = (): void => {};
  let syncEditorHistory = (): void => {};
  let lastIssues: MermaidIssue[] = [];
  let lastCode = store.code;

  const renderErrorDetails = (issues: MermaidIssue[]): void => {
    errorsList.replaceChildren(...issues.map((issue) => {
      const item = document.createElement("li");
      if (issue.line) {
        const line = document.createElement("strong");
        line.textContent = t("syntaxErrorAtLine", { line: issue.line });
        item.append(line, document.createTextNode(" "));
      }
      item.append(document.createTextNode(issue.message));
      return item;
    }));
  };

  statusEl.addEventListener("click", () => {
    if (lastIssues.length === 0 || statusEl.disabled || errorsDialog.open) return;
    renderErrorDetails(lastIssues);
    errorsDialog.showModal();
    statusEl.setAttribute("aria-expanded", "true");
  });
  closeErrors.addEventListener("click", () => errorsDialog.close());
  errorsDialog.addEventListener("close", () => {
    statusEl.setAttribute("aria-expanded", "false");
    if (statusEl.disabled) focusEditor();
  });

  const viewer = new Viewer(required("viewer"), required("stage"), required("zoom-readout"));

  const exports = initExport({
    viewer,
    menu: required("export-menu"),
    trigger: required("export-trigger"),
    items: Array.from(document.querySelectorAll<HTMLElement>("[data-format]")),
  });
  exports.setEnabled(false);

  initLayout();
  initPreferences();

  const aboutTrigger = required<HTMLButtonElement>("about-trigger");
  const aboutDialog = required<HTMLDialogElement>("about-dialog");
  required("app-version").textContent = __APP_VERSION__;
  aboutTrigger.addEventListener("click", () => aboutDialog.showModal());
  required<HTMLButtonElement>("about-close").addEventListener("click", () => aboutDialog.close());
  aboutDialog.addEventListener("click", (event) => {
    if (event.target === aboutDialog) aboutDialog.close();
  });

  let renderToken = 0;
  let activeTheme = store.prefs.visualTheme;
  let latestValidCode: string | null = null;
  let lastRenderedCode: string | null = null;

  const updateStatus = (issues: MermaidIssue[], code: string): void => {
    lastIssues = issues;
    lastCode = code;
    if (issues.length === 0) {
      statusEl.dataset.state = "ok";
      statusText.textContent = t("syntaxValid");
      statusText.removeAttribute("title");
      statusEl.disabled = true;
      if (errorsDialog.open) errorsDialog.close();
      errorsList.replaceChildren();
    } else {
      statusEl.dataset.state = "error";
      statusEl.disabled = false;
      statusText.textContent = issues[0].line
        ? t("syntaxLine", { line: issues[0].line, message: issues[0].message })
        : issues[0].message;
      statusText.removeAttribute("title");
      if (errorsDialog.open) renderErrorDetails(issues);
    }
    metaEl.textContent = t("editorMeta", { lines: code.split("\n").length, characters: code.length });
  };
  onLanguageChange(() => updateStatus(lastIssues, lastCode));

  const setPending = (): void => {
    statusEl.dataset.state = "pending";
    statusEl.disabled = true;
    statusText.textContent = t("syntaxChecking");
    statusText.removeAttribute("title");
    if (errorsDialog.open) errorsDialog.close();
    errorsList.replaceChildren();
  };

  const onValidated = async (code: string, issues: MermaidIssue[]): Promise<void> => {
    if (code.trim().length === 0) {
      updateStatus([], code);
      ++renderToken;
      viewer.clear();
      exports.setEnabled(false);
      latestValidCode = null;
      lastRenderedCode = null;
      return;
    }

    updateStatus(issues, code);
    if (issues.length > 0) return;
    latestValidCode = code;

    const token = ++renderToken;
    try {
      const svg = await renderMermaid(code);
      if (token !== renderToken) return;
      viewer.setDiagram(svg);
      lastRenderedCode = code;
      exports.setEnabled(true);
    } catch (error) {
      exports.setEnabled(false);
      statusEl.dataset.state = "error";
      statusEl.disabled = true;
      statusText.textContent =
        error instanceof Error ? error.message : t("syntaxError");
    }
  };

  const editor = createEditor({
    parent: required("editor-host"),
    initialDoc: store.code,
    visualTheme: store.prefs.visualTheme,
    onDocChanged: (code) => {
      store.setCode(code);
      setPending();
      syncEditorHistory();
      if (code.trim().length === 0) {
        ++renderToken;
        viewer.clear();
        exports.setEnabled(false);
        latestValidCode = null;
        lastRenderedCode = null;
      }
    },
    onValidated,
  });
  const tabs = required("document-tabs");
  let saveDocument = async (_id: string): Promise<boolean> => false;
  const closeDialog = required<HTMLDialogElement>("close-tab-dialog");
  closeDialog.querySelectorAll<HTMLButtonElement>("[data-close-choice]").forEach((button) => {
    button.addEventListener("click", () => closeDialog.close(button.dataset.closeChoice));
  });
  const askCloseChoice = (): Promise<string> => new Promise((resolve) => {
    closeDialog.addEventListener("close", () => resolve(closeDialog.returnValue), { once: true });
    closeDialog.showModal();
  });
  const closeDocumentTab = async (id: string): Promise<void> => {
    const target = store.documents.find((document) => document.id === id);
    if (!target) return;
    if (target.savedCode === null || target.code !== target.savedCode) {
      const choice = await askCloseChoice();
      if (choice === "cancel" || choice === "") return;
      if (choice === "save" && !(await saveDocument(id))) return;
    }
    store.removeDocument(id);
  };
  required<HTMLButtonElement>("new-document").addEventListener("click", () => {
    const name = `${t("unnamedFile")} ${store.documents.length + 1}`;
    store.createDocument("", null, name);
  });
  const renderTabs = (): void => {
    tabs.replaceChildren(...store.documents.map((doc) => {
      const shell = window.document.createElement("div");
      shell.className = "document-tab-shell";
      shell.setAttribute("role", "presentation");
      const tab = window.document.createElement("button");
      tab.className = "document-tab";
      tab.type = "button";
      tab.role = "tab";
      tab.setAttribute("aria-selected", String(doc.id === store.activeDocument.id));
      tab.title = doc.path ?? doc.name;
      const copy = window.document.createElement("span");
      copy.className = "document-tab__copy";
      const label = window.document.createElement("span");
      label.className = "document-tab__name";
      label.textContent = doc.name || t("unnamedFile");
      copy.append(label);
      const marker = window.document.createElement("span");
      marker.className = "document-tab__status";
      marker.dataset.state = doc.savedCode !== null && doc.code === doc.savedCode ? "saved" : "unsaved";
      marker.setAttribute("aria-label", doc.savedCode !== null && doc.code === doc.savedCode ? t("saved") : t("unsaved"));
      marker.title = doc.savedCode !== null && doc.code === doc.savedCode ? t("saved") : t("unsaved");
      const close = window.document.createElement("button");
      close.className = "document-tab__close";
      close.type = "button";
      close.setAttribute("aria-label", `${t("closeTab")}: ${doc.name || t("unnamedFile")}`);
      close.title = t("closeTab");
      close.textContent = "×";
      close.addEventListener("click", (event) => {
        event.stopPropagation();
        void closeDocumentTab(doc.id);
      });
      tab.append(copy, marker);
      shell.append(tab, close);
      tab.addEventListener("click", () => {
        store.activateDocument(doc.id);
        editor.replaceDocument(doc.code);
        syncEditorHistory();
      });
      return shell;
    }));
  };
  renderTabs();
  store.on("documents", renderTabs);
  store.on("code", () => {
    if (editor.view.state.doc.toString() !== store.code) editor.replaceDocument(store.code);
    renderTabs();
  });
  onLanguageChange(renderTabs);
  focusEditor = editor.focus;
  const clearCode = required<HTMLButtonElement>("editor-clear");
  const undoCode = required<HTMLButtonElement>("editor-undo");
  const redoCode = required<HTMLButtonElement>("editor-redo");
  syncEditorHistory = () => {
    undoCode.disabled = !editor.canUndo();
    redoCode.disabled = !editor.canRedo();
  };
  clearCode.addEventListener("click", () => {
    if (store.code.length > 0) editor.replaceDocument("");
    syncEditorHistory();
  });
  undoCode.addEventListener("click", () => { editor.undo(); syncEditorHistory(); });
  redoCode.addEventListener("click", () => { editor.redo(); syncEditorHistory(); });
  syncEditorHistory();

  store.on("prefs", () => {
    const nextTheme = store.prefs.visualTheme;
    if (nextTheme === activeTheme) return;
    activeTheme = nextTheme;
    editor.setVisualTheme(nextTheme);
    setMermaidTheme(nextTheme);

    const code = latestValidCode ?? lastRenderedCode;
    if (!code) return;
    const token = ++renderToken;
    exports.setEnabled(false);
    void renderMermaid(code).then((svg) => {
      if (token !== renderToken) return;
      viewer.setDiagram(svg);
      lastRenderedCode = code;
      exports.setEnabled(true);
    }).catch((error: unknown) => {
      // Keep the last successfully rendered SVG and its export capability.
      console.error("Could not re-render diagram for the selected theme.", error);
    });
  });

  const fileMenu = initFileMenu({
    openButton: required<HTMLButtonElement>("open-file"),
    saveButton: required<HTMLButtonElement>("save-file"),
    saveAsButton: required<HTMLButtonElement>("save-as-file"),
    recentButton: required<HTMLButtonElement>("recent-files-trigger"),
    recentDialog: required<HTMLDialogElement>("recent-files-dialog"),
    recentCloseButton: required<HTMLButtonElement>("recent-files-close"),
    recentPanel: required("recent-files-panel"),
    status: required("document-status"),
    statusText: required("document-status-text"),
    fileNameSlot: required("document-name-slot"),
    filePath: required("document-path"),
  });
  saveDocument = fileMenu.saveDocument;

  /* ---------------- viewer toolbar ---------------- */

  required("zoom-in").addEventListener("click", () => viewer.zoomIn());
  required("zoom-out").addEventListener("click", () => viewer.zoomOut());
  required("fit").addEventListener("click", () => viewer.fit());
  required("reset").addEventListener("click", () => viewer.reset());

  window.addEventListener("keydown", (event) => {
    const mod = event.metaKey || event.ctrlKey;
    if (mod && event.key === "+") {
      event.preventDefault();
      viewer.zoomIn();
    } else if (mod && (event.key === "-" || event.key === "_")) {
      event.preventDefault();
      viewer.zoomOut();
    } else if (mod && event.key === "0") {
      event.preventDefault();
      viewer.reset();
    } else if (mod && event.shiftKey && (event.key === "f" || event.key === "F")) {
      event.preventDefault();
      viewer.fit();
    }
  });
}

boot();
