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
import { initMcpValidationBridge } from "./platform/mcp-validation";
import { initMcp } from "./features/mcp";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { debounce } from "./core/util";
import { showToast } from "./features/toast";

interface WorkspaceDocument {
  id: string;
  name: string;
  code: string;
  protected: boolean;
  revision: number;
}

interface Workspace {
  id: string;
  name: string;
  description: string;
  documents: WorkspaceDocument[];
}

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
  if (isDesktop()) void initMcpValidationBridge();
  else {
    required<HTMLButtonElement>("mcp-toggle").hidden = true;
    required<HTMLButtonElement>("workspace-picker-trigger").hidden = true;
  }
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
  if (isDesktop()) void initMcp().catch((error: unknown) => console.error("Could not initialize MCP controls.", error));

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
  let workspaceList: Workspace[] = [];
  let activeWorkspace: Workspace | null = null;
  let activeWorkspaceDocument: WorkspaceDocument | null = null;
  let suppressEditorChange = false;
  let writingWorkspaceDocuments = new Set<string>();
  const OPEN_WORKSPACES_KEY = "mermagram:open-workspaces";
  const OPEN_WORKSPACE_DOCUMENTS_KEY = "mermagram:open-workspace-documents";
  const savedOpenWorkspaceIds = loadOpenWorkspaceIds();
  const openWorkspaceIds = new Set<string>(savedOpenWorkspaceIds ?? []);
  const workspaceDocumentTabState = loadWorkspaceDocumentTabState();
  let openWorkspaceDocumentIds = new Set<string>();
  const persistWorkspaceSource = debounce((workspaceId: string, documentId: string, code: string) => {
    void invoke("update_workspace_document_source", { workspaceId, documentId, code }).catch((error) => {
      showToast(String(error), "error");
    });
  }, 240);

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
      if (!suppressEditorChange) {
        if (activeWorkspace && activeWorkspaceDocument) {
          activeWorkspaceDocument.code = code;
          persistWorkspaceSource(activeWorkspace.id, activeWorkspaceDocument.id, code);
          required("document-status-text").textContent = t("workspaceStored");
        } else {
          store.setCode(code);
        }
      }
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
    if (activeWorkspace) {
      const name = `${t("unnamedFile")} ${activeWorkspace.documents.length + 1}`;
      void invoke<WorkspaceDocument>("create_workspace_document", {
        workspaceId: activeWorkspace.id,
        name,
        code: "",
      }).then((document) => {
        activeWorkspace!.documents.push(document);
        openWorkspaceDocumentIds.add(document.id);
        selectWorkspaceDocument(document);
      }).catch((error) => showToast(String(error), "error"));
      return;
    }
    const name = `${t("unnamedFile")} ${store.documents.length + 1}`;
    store.createDocument("", null, name);
  });

  const saveOpenWorkspaceIds = (): void => {
    try { window.localStorage.setItem(OPEN_WORKSPACES_KEY, JSON.stringify([...openWorkspaceIds])); } catch { /* optional UI preference */ }
  };
  const saveWorkspaceDocumentTabState = (): void => {
    if (!activeWorkspace) return;
    workspaceDocumentTabState[activeWorkspace.id] = {
      openDocumentIds: [...openWorkspaceDocumentIds],
      activeDocumentId: activeWorkspaceDocument?.id ?? null,
    };
    persistWorkspaceDocumentTabState();
  };
  const persistWorkspaceDocumentTabState = (): void => {
    try {
      window.localStorage.setItem(OPEN_WORKSPACE_DOCUMENTS_KEY, JSON.stringify(workspaceDocumentTabState));
    } catch { /* optional UI preference */ }
  };
  const renderWorkspaceProtection = (document: WorkspaceDocument | null): void => {
    const button = required<HTMLButtonElement>("workspace-protect");
    const divider = required("workspace-protect-divider");
    const available = document !== null;
    button.hidden = !available;
    divider.hidden = !available;
    if (!document) return;
    button.dataset.protected = String(document.protected);
    button.setAttribute("aria-pressed", String(document.protected));
    button.title = document.protected ? t("workspaceUnprotect") : t("workspaceProtect");
    button.setAttribute("aria-label", button.title);
    button.replaceChildren();
    const icon = window.document.createElement("span");
    icon.className = "workspace-protect-button__icon";
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = document.protected
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="10" width="15" height="11" rx="2"/><path d="M8 10V7a4 4 0 1 1 8 0v3"/><path d="M12 14v3"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="10" width="15" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 7.5-2"/><path d="M12 14v3"/></svg>';
    const label = window.document.createElement("span");
    label.textContent = document.protected ? t("workspaceProtectedState") : t("workspaceProtectShort");
    button.append(icon, label);
  };
  const renderWorkspaceDocumentName = (document: WorkspaceDocument | null): void => {
    const slot = required("document-name-slot");
    if (!document) {
      slot.textContent = activeWorkspace?.name ?? "";
      return;
    }
    const edit = window.document.createElement("button");
    edit.className = "global-toolbar__document-name document-name-edit";
    edit.type = "button";
    edit.textContent = document.name;
    edit.title = t("editDocumentNameTitle");
    edit.setAttribute("aria-label", t("editDocumentName", { name: document.name }));
    edit.addEventListener("click", () => {
      if (activeWorkspaceDocument?.id !== document.id) return;
      const input = window.document.createElement("input");
      input.className = "global-toolbar__document-name document-name-input";
      input.type = "text";
      input.value = document.name;
      input.maxLength = 160;
      input.autocomplete = "off";
      input.spellcheck = false;
      input.setAttribute("aria-label", t("editDocumentName", { name: document.name }));
      slot.replaceChildren(input);
      let finished = false;
      const finish = (commit: boolean): void => {
        if (finished) return;
        finished = true;
        if (!commit) {
          renderWorkspaceDocumentName(activeWorkspaceDocument);
          return;
        }
        const name = input.value.trim();
        if (!name || name === document.name) {
          renderWorkspaceDocumentName(activeWorkspaceDocument);
          return;
        }
        void invoke<WorkspaceDocument>("rename_workspace_document", {
          workspaceId: activeWorkspace!.id,
          documentId: document.id,
          name,
        }).then((renamed) => {
          const workspace = activeWorkspace;
          if (!workspace || workspace.documents.find((item) => item.id === document.id) === undefined) return;
          const index = workspace.documents.findIndex((item) => item.id === document.id);
          workspace.documents[index] = renamed;
          const cached = workspaceList.find((item) => item.id === workspace.id);
          if (cached) cached.documents = [...workspace.documents];
          if (activeWorkspaceDocument?.id === renamed.id) activeWorkspaceDocument = renamed;
          renderWorkspaceDocumentName(activeWorkspaceDocument);
          renderTabs();
        }).catch((error) => {
          showToast(String(error), "error");
          renderWorkspaceDocumentName(activeWorkspaceDocument);
        });
      };
      input.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          finish(false);
        } else if (event.key === "Enter") {
          event.preventDefault();
          finish(true);
        }
      });
      input.addEventListener("blur", () => finish(true));
      input.focus();
      input.select();
    });
    slot.replaceChildren(edit);
  };
  const showEmptyWorkspaceDocument = (): void => {
    if (!activeWorkspace) return;
    activeWorkspaceDocument = null;
    suppressEditorChange = true;
    editor.replaceDocument("", false);
    suppressEditorChange = false;
    editor.setReadOnly(false);
    renderWorkspaceProtection(null);
    renderWorkspaceDocumentName(null);
    required("document-path").textContent = activeWorkspace.description;
    required("document-status-text").textContent = t("workspaceStored");
    required<HTMLButtonElement>("save-file").disabled = true;
    required<HTMLButtonElement>("save-as-file").disabled = true;
    required<HTMLButtonElement>("open-file").disabled = true;
    required<HTMLButtonElement>("recent-files-trigger").disabled = true;
    saveWorkspaceDocumentTabState();
    syncEditorHistory();
    renderTabs();
  };
  const selectWorkspaceDocument = (document: WorkspaceDocument): void => {
    if (!activeWorkspace) return;
    openWorkspaceDocumentIds.add(document.id);
    activeWorkspaceDocument = document;
    suppressEditorChange = true;
    editor.replaceDocument(document.code, false);
    suppressEditorChange = false;
    editor.setReadOnly(writingWorkspaceDocuments.has(document.id));
    renderWorkspaceProtection(document);
    renderWorkspaceDocumentName(document);
    required("document-path").textContent = activeWorkspace.name;
    required("document-status-text").textContent = t("workspaceStored");
    required<HTMLButtonElement>("save-file").disabled = false;
    required<HTMLButtonElement>("save-as-file").disabled = false;
    required<HTMLButtonElement>("open-file").disabled = true;
    required<HTMLButtonElement>("recent-files-trigger").disabled = true;
    saveWorkspaceDocumentTabState();
    syncEditorHistory();
    renderTabs();
  };
  const enterWorkspace = async (workspaceId: string): Promise<void> => {
    try {
      activeWorkspace = await invoke<Workspace>("get_workspace", { workspaceId });
      required("file-toolbar").classList.add("file-toolbar--workspace");
      openWorkspaceIds.add(workspaceId);
      saveOpenWorkspaceIds();
      const savedState = workspaceDocumentTabState[workspaceId];
      const validIds = new Set(activeWorkspace.documents.map((document) => document.id));
      openWorkspaceDocumentIds = new Set(
        savedState
          ? savedState.openDocumentIds.filter((id) => validIds.has(id))
          : activeWorkspace.documents.map((document) => document.id),
      );
      const preferredId = savedState?.activeDocumentId;
      const selectedDocument = activeWorkspace.documents.find((document) =>
        document.id === preferredId && openWorkspaceDocumentIds.has(document.id),
      ) ?? activeWorkspace.documents.find((document) => openWorkspaceDocumentIds.has(document.id));
      required<HTMLButtonElement>("workspace-picker-trigger").hidden = true;
      if (selectedDocument) selectWorkspaceDocument(selectedDocument);
      else showEmptyWorkspaceDocument();
    } catch (error) {
      showToast(String(error), "error");
    }
  };
  const leaveWorkspace = (): void => {
    saveWorkspaceDocumentTabState();
    activeWorkspace = null;
    required("file-toolbar").classList.remove("file-toolbar--workspace");
    activeWorkspaceDocument = null;
    editor.setReadOnly(false);
    required<HTMLButtonElement>("workspace-picker-trigger").hidden = false;
    required<HTMLButtonElement>("workspace-protect").hidden = true;
    required("workspace-protect-divider").hidden = true;
    required<HTMLButtonElement>("save-file").disabled = false;
    required<HTMLButtonElement>("save-as-file").disabled = false;
    required<HTMLButtonElement>("open-file").disabled = false;
    required<HTMLButtonElement>("recent-files-trigger").disabled = false;
    suppressEditorChange = true;
    editor.replaceDocument(store.code, false);
    suppressEditorChange = false;
    const physicalDocument = store.activeDocument;
    required("document-name-slot").textContent = physicalDocument.name || t("unnamedFile");
    required("document-path").textContent = physicalDocument.path ?? t("newDocument");
    const isSaved = physicalDocument.savedCode !== null && physicalDocument.code === physicalDocument.savedCode;
    required("document-status-text").textContent = t(isSaved ? "saved" : "unsaved");
    renderTabs();
  };
  const renderWorkspacePicker = (): void => {
    const list = required("workspace-picker-list");
    if (workspaceList.length === 0) {
      const empty = document.createElement("p");
      empty.className = "workspace-picker-empty";
      empty.textContent = t("workspaceEmpty");
      list.replaceChildren(empty);
      return;
    }
    list.replaceChildren(...workspaceList.map((workspace) => {
      const row = document.createElement("div");
      row.className = "workspace-picker-row";
      row.setAttribute("role", "listitem");
      const copy = document.createElement("div");
      copy.className = "workspace-picker-row__copy";
      const name = document.createElement("strong");
      name.className = "workspace-picker-row__name";
      name.textContent = workspace.name;
      const description = document.createElement("span");
      description.className = "workspace-picker-row__description";
      description.textContent = workspace.description || "—";
      copy.append(name, description);
      const actions = document.createElement("div");
      actions.className = "workspace-picker-row__actions";
      const open = document.createElement("button");
      open.className = "btn btn--subtle";
      open.type = "button";
      open.textContent = t("workspaceOpen");
      open.addEventListener("click", () => {
        openWorkspaceIds.add(workspace.id);
        saveOpenWorkspaceIds();
        required<HTMLDialogElement>("workspace-picker-dialog").close();
        renderTabs();
        void enterWorkspace(workspace.id);
      });
      const remove = document.createElement("button");
      remove.className = "btn btn--subtle";
      remove.type = "button";
      remove.textContent = t("workspaceDelete");
      remove.addEventListener("click", () => {
        if (!window.confirm(t("workspaceDeleteConfirm"))) return;
        void invoke("delete_workspace", { workspaceId: workspace.id }).then(async () => {
          openWorkspaceIds.delete(workspace.id);
          if (activeWorkspace?.id === workspace.id) leaveWorkspace();
          workspaceList = await invoke<Workspace[]>("list_workspaces");
          saveOpenWorkspaceIds();
          renderWorkspacePicker();
          renderTabs();
        }).catch((error) => showToast(String(error), "error"));
      });
      actions.append(open, remove);
      row.append(copy, actions);
      return row;
    }));
  };

  const renderWorkspaceDocumentsPicker = (): void => {
    const list = required("workspace-documents-list");
    if (!activeWorkspace) {
      list.replaceChildren();
      return;
    }
    if (activeWorkspace.documents.length === 0) {
      const empty = window.document.createElement("p");
      empty.className = "workspace-picker-empty";
      empty.textContent = t("workspaceNoDocuments");
      list.replaceChildren(empty);
      return;
    }
    list.replaceChildren(...activeWorkspace.documents.map((workspaceDocument) => {
      const row = window.document.createElement("div");
      row.className = "workspace-picker-row";
      row.setAttribute("role", "listitem");
      const copy = window.document.createElement("div");
      copy.className = "workspace-picker-row__copy";
      const name = window.document.createElement("strong");
      name.className = "workspace-picker-row__name";
      name.textContent = workspaceDocument.name;
      const details = window.document.createElement("span");
      details.className = "workspace-picker-row__description";
      details.textContent = workspaceDocument.protected ? t("workspaceProtectedState") : t("workspaceStored");
      copy.append(name, details);

      const actions = window.document.createElement("div");
      actions.className = "workspace-picker-row__actions";
      const isOpen = openWorkspaceDocumentIds.has(workspaceDocument.id);
      const open = window.document.createElement("button");
      open.className = "btn btn--subtle";
      open.type = "button";
      open.textContent = isOpen ? t("workspaceFocusDocument") : t("workspaceOpenDocument");
      open.addEventListener("click", () => {
        if (isOpen && activeWorkspaceDocument?.id === workspaceDocument.id) {
          required<HTMLDialogElement>("workspace-documents-dialog").close();
          return;
        }
        openWorkspaceDocumentIds.add(workspaceDocument.id);
        selectWorkspaceDocument(workspaceDocument);
        required<HTMLDialogElement>("workspace-documents-dialog").close();
      });
      const remove = window.document.createElement("button");
      remove.className = "btn btn--subtle workspace-document-delete";
      remove.type = "button";
      remove.textContent = t("workspaceDeleteDocument");
      remove.addEventListener("click", () => void deleteWorkspaceDocument(workspaceDocument.id));
      actions.append(open, remove);
      row.append(copy, actions);
      return row;
    }));
  };

  const closeWorkspaceDocument = (documentId: string): void => {
    if (!activeWorkspace) return;
    const documents = activeWorkspace.documents;
    const closingIndex = documents.findIndex((document) => document.id === documentId);
    if (closingIndex < 0 || !openWorkspaceDocumentIds.has(documentId)) return;
    const wasActive = activeWorkspaceDocument?.id === documentId;
    openWorkspaceDocumentIds.delete(documentId);
    if (wasActive) {
      const nextDocument = documents.slice(closingIndex + 1).find((document) => openWorkspaceDocumentIds.has(document.id))
        ?? documents.slice(0, closingIndex).reverse().find((document) => openWorkspaceDocumentIds.has(document.id));
      if (nextDocument) {
        selectWorkspaceDocument(nextDocument);
        return;
      }
      showEmptyWorkspaceDocument();
    } else {
      saveWorkspaceDocumentTabState();
      renderTabs();
    }
  };

  const deleteWorkspaceDocument = async (documentId: string): Promise<void> => {
    if (!activeWorkspace) return;
    const workspaceId = activeWorkspace.id;
    const documents = activeWorkspace.documents;
    const deletingIndex = documents.findIndex((document) => document.id === documentId);
    if (deletingIndex < 0) return;
    const target = documents[deletingIndex];
    if (!window.confirm(t("workspaceDeleteDocumentConfirm", { name: target.name }))) return;
    try {
      await invoke("delete_workspace_document", {
        workspaceId,
        documentId,
      });
      const wasActive = activeWorkspace?.id === workspaceId && activeWorkspaceDocument?.id === documentId;
      documents.splice(deletingIndex, 1);
      openWorkspaceDocumentIds.delete(documentId);
      const cachedWorkspace = workspaceList.find((workspace) => workspace.id === workspaceId);
      if (cachedWorkspace) cachedWorkspace.documents = [...documents];
      if (activeWorkspace?.id !== workspaceId) {
        renderWorkspacePicker();
        return;
      }
      if (wasActive) {
        const nextDocument = documents.slice(deletingIndex).find((document) => openWorkspaceDocumentIds.has(document.id))
          ?? documents.slice(0, deletingIndex).reverse().find((document) => openWorkspaceDocumentIds.has(document.id));
        if (nextDocument) selectWorkspaceDocument(nextDocument);
        else showEmptyWorkspaceDocument();
      } else {
        saveWorkspaceDocumentTabState();
        renderTabs();
      }
      renderWorkspaceDocumentsPicker();
      renderWorkspacePicker();
    } catch (error) {
      showToast(String(error), "error");
    }
  };

  const renderTabs = (): void => {
    if (activeWorkspace) {
      const back = document.createElement("button");
      back.className = "workspace-back";
      back.type = "button";
      back.textContent = `← ${t("workspaceBack")}`;
      back.title = activeWorkspace.name;
      back.addEventListener("click", leaveWorkspace);
      const workspaceName = document.createElement("div");
      workspaceName.className = "workspace-view-name";
      const workspacePrefix = document.createElement("span");
      workspacePrefix.className = "workspace-view-name__label";
      workspacePrefix.textContent = t("workspaceLabel");
      const workspaceTitle = document.createElement("span");
      workspaceTitle.className = "workspace-view-name__title";
      workspaceTitle.textContent = activeWorkspace.name;
      workspaceTitle.title = activeWorkspace.name;
      const workspaceCount = document.createElement("span");
      workspaceCount.className = "workspace-view-name__count";
      workspaceCount.textContent = t("workspaceDocumentCount", { count: activeWorkspace.documents.length });
      const workspaceTitleRow = document.createElement("div");
      workspaceTitleRow.className = "workspace-view-name__title-row";
      workspaceTitleRow.append(workspacePrefix, workspaceTitle);
      workspaceName.append(workspaceTitleRow, workspaceCount);

      const workspaceGroup = document.createElement("div");
      workspaceGroup.className = "workspace-view-group";
      workspaceGroup.append(workspaceName, back);

      const openDocument = document.createElement("button");
      openDocument.className = "workspace-open-document";
      openDocument.type = "button";
      openDocument.textContent = t("workspaceOpenDocument");
      openDocument.addEventListener("click", () => {
        renderWorkspaceDocumentsPicker();
        required<HTMLDialogElement>("workspace-documents-dialog").showModal();
      });

      const documentTabs = activeWorkspace.documents
        .filter((doc) => openWorkspaceDocumentIds.has(doc.id))
        .map((doc) => {
        const shell = document.createElement("div");
        shell.className = "document-tab-shell workspace-document-tab-shell";
        shell.setAttribute("role", "presentation");
        const tab = document.createElement("button");
        tab.className = "document-tab workspace-document-tab";
        tab.type = "button";
        tab.role = "tab";
        tab.setAttribute("aria-selected", String(doc.id === activeWorkspaceDocument?.id));
        tab.title = doc.name;
        const label = document.createElement("span");
        label.className = "document-tab__name";
        label.textContent = doc.name;
        tab.append(label);
        tab.addEventListener("click", () => selectWorkspaceDocument(doc));
        const close = document.createElement("button");
        close.className = "document-tab__close";
        close.type = "button";
        close.setAttribute("aria-label", `${t("workspaceCloseDocument")}: ${doc.name}`);
        close.title = t("workspaceCloseDocument");
        close.textContent = "×";
        close.addEventListener("click", (event) => {
          event.stopPropagation();
          closeWorkspaceDocument(doc.id);
        });
        shell.append(tab, close);
        return shell;
      });
      tabs.replaceChildren(workspaceGroup, openDocument, ...documentTabs);
      return;
    }
    const regularTabs = store.documents.map((doc) => {
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
    });
    const workspaceTabs = workspaceList.filter((workspace) => openWorkspaceIds.has(workspace.id)).map((workspace) => {
      const shell = document.createElement("div");
      shell.className = "document-tab-shell workspace-tab-shell";
      shell.setAttribute("role", "presentation");
      const tab = document.createElement("button");
      tab.className = "document-tab workspace-tab";
      tab.type = "button";
      tab.role = "tab";
      tab.setAttribute("aria-selected", "false");
      tab.title = workspace.description || workspace.name;
      const label = document.createElement("span");
      label.className = "document-tab__name workspace-tab__name";
      label.textContent = workspace.name;
      label.title = workspace.name;
      tab.append(label);
      tab.addEventListener("click", () => void enterWorkspace(workspace.id));
      const close = document.createElement("button");
      close.className = "document-tab__close";
      close.type = "button";
      close.setAttribute("aria-label", `${t("workspaceClose")}: ${workspace.name}`);
      close.title = t("workspaceClose");
      close.textContent = "×";
      close.addEventListener("click", (event) => {
        event.stopPropagation();
        openWorkspaceIds.delete(workspace.id);
        if (activeWorkspace?.id === workspace.id) leaveWorkspace();
        saveOpenWorkspaceIds();
        renderTabs();
      });
      shell.append(tab, close);
      return shell;
    });
    tabs.replaceChildren(...regularTabs, ...workspaceTabs);
  };
  renderTabs();
  required<HTMLButtonElement>("workspace-picker-trigger").addEventListener("click", () => {
    renderWorkspacePicker();
    required<HTMLDialogElement>("workspace-picker-dialog").showModal();
  });
  required<HTMLButtonElement>("workspace-picker-close").addEventListener("click", () => {
    required<HTMLDialogElement>("workspace-picker-dialog").close();
  });
  required<HTMLDialogElement>("workspace-picker-dialog").addEventListener("click", (event) => {
    if (event.target === event.currentTarget) required<HTMLDialogElement>("workspace-picker-dialog").close();
  });
  required<HTMLButtonElement>("workspace-documents-close").addEventListener("click", () => {
    required<HTMLDialogElement>("workspace-documents-dialog").close();
  });
  required<HTMLDialogElement>("workspace-documents-dialog").addEventListener("click", (event) => {
    if (event.target === event.currentTarget) required<HTMLDialogElement>("workspace-documents-dialog").close();
  });
  void invoke<Workspace[]>("list_workspaces").then((items) => {
    workspaceList = items;
    if (savedOpenWorkspaceIds === null) {
      workspaceList.forEach((workspace) => openWorkspaceIds.add(workspace.id));
    } else {
      for (const id of [...openWorkspaceIds]) {
        if (!workspaceList.some((workspace) => workspace.id === id)) openWorkspaceIds.delete(id);
      }
    }
    saveOpenWorkspaceIds();
    renderWorkspacePicker();
    renderTabs();
  }).catch((error) => console.error("Could not load workspaces.", error));
  window.addEventListener("mermagram:workspaces-changed", () => {
    void invoke<Workspace[]>("list_workspaces").then((items) => {
      workspaceList = items;
      for (const workspace of items) openWorkspaceIds.add(workspace.id);
      saveOpenWorkspaceIds();
      renderWorkspacePicker();
      renderTabs();
    });
  });
  void listen<{ workspaceId: string; document: WorkspaceDocument }>("mcp:workspace-document-changed", ({ payload }) => {
    const index = activeWorkspace?.id === payload.workspaceId
      ? activeWorkspace.documents.findIndex((doc) => doc.id === payload.document.id)
      : -1;
    if (activeWorkspace?.id === payload.workspaceId) {
      if (index >= 0) activeWorkspace.documents[index] = payload.document;
      else activeWorkspace.documents.push(payload.document);
      const cached = workspaceList.find((workspace) => workspace.id === payload.workspaceId);
      if (cached) cached.documents = [...activeWorkspace.documents];
      // MCP creates and edits should become visible as an open tab immediately.
      openWorkspaceDocumentIds.add(payload.document.id);
      selectWorkspaceDocument(payload.document);
      if (required<HTMLDialogElement>("workspace-documents-dialog").open) renderWorkspaceDocumentsPicker();
    } else {
      void invoke<Workspace>("get_workspace", { workspaceId: payload.workspaceId }).then((workspace) => {
        const cached = workspaceList.findIndex((item) => item.id === workspace.id);
        if (cached >= 0) workspaceList[cached] = workspace;
        // Remember the MCP-touched document so it opens when this workspace is entered.
        const state = workspaceDocumentTabState[workspace.id] ?? {
          openDocumentIds: workspace.documents.map((document) => document.id),
          activeDocumentId: null,
        };
        if (!state.openDocumentIds.includes(payload.document.id)) state.openDocumentIds.push(payload.document.id);
        state.activeDocumentId = payload.document.id;
        workspaceDocumentTabState[workspace.id] = state;
        persistWorkspaceDocumentTabState();
        renderWorkspacePicker();
      }).catch((error) => console.error("Could not refresh workspace metadata.", error));
    }
    if (activeWorkspace?.id !== payload.workspaceId) return;
    if (activeWorkspaceDocument?.id === payload.document.id && editor.view.state.doc.toString() !== payload.document.code) {
      activeWorkspaceDocument = payload.document;
      suppressEditorChange = true;
      editor.replaceDocument(payload.document.code, false);
      suppressEditorChange = false;
      editor.setReadOnly(writingWorkspaceDocuments.has(payload.document.id));
    }
    renderTabs();
  });
  void listen<{ workspaceId: string; documentId: string; writing: boolean }>("mcp:write-state", ({ payload }) => {
    if (payload.writing) writingWorkspaceDocuments.add(payload.documentId);
    else writingWorkspaceDocuments.delete(payload.documentId);
    if (activeWorkspace?.id === payload.workspaceId && activeWorkspaceDocument?.id === payload.documentId) {
      editor.setReadOnly(payload.writing);
      required("document-status-text").textContent = payload.writing ? t("workspaceAgentWriting") : t("workspaceStored");
    }
  });
  required<HTMLButtonElement>("workspace-protect").addEventListener("click", () => {
    if (!activeWorkspace || !activeWorkspaceDocument) return;
    const workspaceId = activeWorkspace.id;
    const documentId = activeWorkspaceDocument.id;
    const protectedValue = !activeWorkspaceDocument.protected;
    void invoke<WorkspaceDocument>("set_workspace_document_protected", {
      workspaceId,
      documentId,
      protected: protectedValue,
    }).then((document) => {
      const workspace = workspaceList.find((item) => item.id === workspaceId);
      const index = workspace?.documents.findIndex((item) => item.id === document.id) ?? -1;
      if (workspace && index >= 0) workspace.documents[index] = document;
      if (activeWorkspace?.id === workspaceId) {
        const activeIndex = activeWorkspace.documents.findIndex((item) => item.id === document.id);
        if (activeIndex >= 0) activeWorkspace.documents[activeIndex] = document;
        if (activeWorkspaceDocument?.id === documentId) selectWorkspaceDocument(document);
        renderWorkspaceDocumentsPicker();
      }
    }).catch((error) => showToast(String(error), "error"));
  });
  store.on("documents", renderTabs);
  store.on("code", () => {
    if (editor.view.state.doc.toString() !== store.code) editor.replaceDocument(store.code);
    renderTabs();
  });
  onLanguageChange(() => {
    renderTabs();
    renderWorkspaceDocumentsPicker();
    if (activeWorkspaceDocument) renderWorkspaceProtection(activeWorkspaceDocument);
  });
  focusEditor = editor.focus;
  const clearCode = required<HTMLButtonElement>("editor-clear");
  const undoCode = required<HTMLButtonElement>("editor-undo");
  const redoCode = required<HTMLButtonElement>("editor-redo");
  syncEditorHistory = () => {
    undoCode.disabled = !editor.canUndo();
    redoCode.disabled = !editor.canRedo();
  };
  clearCode.addEventListener("click", () => {
    if (editor.view.state.doc.length > 0) editor.replaceDocument("");
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
    isWorkspaceMode: () => activeWorkspace !== null,
    onWorkspaceSave: () => {
      if (!activeWorkspace || !activeWorkspaceDocument) return;
      const workspaceId = activeWorkspace.id;
      const documentId = activeWorkspaceDocument.id;
      const code = editor.view.state.doc.toString();
      void invoke<WorkspaceDocument>("update_workspace_document_source", {
        workspaceId,
        documentId,
        code,
      }).then((saved) => {
        const workspace = activeWorkspace?.id === workspaceId ? activeWorkspace : workspaceList.find((item) => item.id === workspaceId);
        const index = workspace?.documents.findIndex((item) => item.id === documentId) ?? -1;
        if (workspace && index >= 0) workspace.documents[index] = saved;
        if (activeWorkspace?.id === workspaceId && activeWorkspaceDocument?.id === documentId) {
          activeWorkspaceDocument = saved;
          required("document-status-text").textContent = t("workspaceStored");
          renderWorkspaceDocumentName(saved);
        }
        showToast(t("workspaceSaved"), "success");
      }).catch((error) => showToast(String(error), "error"));
    },
    onWorkspaceSaveAs: () => {
      if (!activeWorkspace || !activeWorkspaceDocument) return;
      const workspaceId = activeWorkspace.id;
      const code = editor.view.state.doc.toString();
      const dialog = required<HTMLDialogElement>("workspace-save-as-dialog");
      const form = required<HTMLFormElement>("workspace-save-as-form");
      const nameInput = required<HTMLInputElement>("workspace-save-as-name");
      nameInput.value = activeWorkspaceDocument.name;
      form.onsubmit = (event) => {
        event.preventDefault();
        const name = nameInput.value.trim();
        if (name) dialog.close(name);
        else nameInput.focus();
      };
      required<HTMLButtonElement>("workspace-save-as-close").onclick = () => dialog.close("");
      required<HTMLButtonElement>("workspace-save-as-cancel").onclick = () => dialog.close("");
      dialog.onclick = (event) => {
        if (event.target === dialog) dialog.close("");
      };
      const resolveName = new Promise<string>((resolve) => {
        dialog.addEventListener("close", () => resolve(dialog.returnValue), { once: true });
      });
      dialog.showModal();
      nameInput.focus();
      nameInput.select();
      void resolveName.then((name) => {
        if (!name.trim()) return;
        return invoke<WorkspaceDocument>("create_workspace_document", {
          workspaceId,
          name: name.trim(),
          code,
        }).then((created) => {
          if (activeWorkspace?.id !== workspaceId) return;
          activeWorkspace.documents.push(created);
          const cached = workspaceList.find((item) => item.id === workspaceId);
          if (cached) cached.documents = [...activeWorkspace.documents];
          openWorkspaceDocumentIds.add(created.id);
          selectWorkspaceDocument(created);
          showToast(t("workspaceSavedAs"), "success");
        });
      }).catch((error) => showToast(String(error), "error"));
    },
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

function loadOpenWorkspaceIds(): string[] | null {
  try {
    const raw = window.localStorage.getItem("mermagram:open-workspaces");
    if (raw === null) return null;
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) && value.every((id) => typeof id === "string") ? value : null;
  } catch {
    return null;
  }
}

function loadWorkspaceDocumentTabState(): Record<string, { openDocumentIds: string[]; activeDocumentId: string | null }> {
  try {
    const raw = window.localStorage.getItem("mermagram:open-workspace-documents");
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const result: Record<string, { openDocumentIds: string[]; activeDocumentId: string | null }> = {};
    for (const [workspaceId, value] of Object.entries(parsed)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const state = value as { openDocumentIds?: unknown; activeDocumentId?: unknown };
      if (!Array.isArray(state.openDocumentIds) || !state.openDocumentIds.every((id) => typeof id === "string")) continue;
      result[workspaceId] = {
        openDocumentIds: state.openDocumentIds,
        activeDocumentId: typeof state.activeDocumentId === "string" ? state.activeDocumentId : null,
      };
    }
    return result;
  } catch {
    return {};
  }
}

boot();
