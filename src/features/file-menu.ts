import { getCurrentWindow } from "@tauri-apps/api/window";
import { message } from "@tauri-apps/plugin-dialog";
import { stat } from "@tauri-apps/plugin-fs";
import { addRecentFile, fileNameFromPath, loadRecentFiles } from "../core/recent-files";
import { store } from "../core/store";
import { showToast } from "./toast";
import { isDesktop } from "../platform/save";
import {
  openMermaidFile,
  readMermaidFile,
  saveMermaidFile,
  writeMermaidFile,
} from "../platform/mermaid-files";
import { getLanguage, onLanguageChange, t } from "../core/i18n";

interface FileMenuOptions {
  openButton: HTMLButtonElement;
  saveButton: HTMLButtonElement;
  saveAsButton: HTMLButtonElement;
  recentButton: HTMLButtonElement;
  recentDialog: HTMLDialogElement;
  recentCloseButton: HTMLButtonElement;
  recentPanel: HTMLElement;
  status: HTMLElement;
  statusText: HTMLElement;
  fileNameSlot: HTMLElement;
  filePath: HTMLElement;
  isWorkspaceMode?: () => boolean;
  onWorkspaceSave?: () => void;
  onWorkspaceSaveAs?: () => void;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function mermaidFileName(name: string): string {
  const baseName = name.trim() || "diagrama";
  return /\.(mmd|mermaid)$/i.test(baseName) ? baseName : `${baseName}.mmd`;
}

export function initFileMenu(options: FileMenuOptions): { saveDocument: (id: string) => Promise<boolean> } {
  const {
    openButton, saveButton, saveAsButton, recentButton, recentDialog, recentCloseButton, recentPanel,
    status, statusText, fileNameSlot, filePath,
  } = options;
  let busy = false;
  let closeInProgress = false;
  let allowClose = false;
  let editingDocumentId: string | null = null;
  let recentRenderToken = 0;

  const renderDocumentName = (active = store.activeDocument): void => {
    if (editingDocumentId === active.id && !active.path) return;
    fileNameSlot.replaceChildren();
    const label = active.name || t("unnamedFile");
    if (active.path) {
      const name = document.createElement("span");
      name.className = "global-toolbar__document-name";
      name.textContent = label;
      fileNameSlot.append(name);
      return;
    }

    const editButton = document.createElement("button");
    editButton.className = "global-toolbar__document-name document-name-edit";
    editButton.type = "button";
    editButton.textContent = label;
    editButton.setAttribute("aria-label", t("editDocumentName", { name: label }));
    editButton.title = t("editDocumentNameTitle");
    editButton.addEventListener("click", () => {
      if (store.activeDocument.id !== active.id || store.activeDocument.path) return;
      editingDocumentId = active.id;
      const input = document.createElement("input");
      input.className = "global-toolbar__document-name document-name-input";
      input.type = "text";
      input.value = active.name;
      input.maxLength = 160;
      input.setAttribute("aria-label", t("editDocumentName", { name: label }));
      input.autocomplete = "off";
      input.spellcheck = false;
      fileNameSlot.replaceChildren(input);
      input.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          editingDocumentId = null;
          renderDocumentName();
          fileNameSlot.querySelector<HTMLButtonElement>(".document-name-edit")?.focus();
        } else if (event.key === "Enter") {
          event.preventDefault();
          if (store.renameActiveDocument(input.value)) {
            editingDocumentId = null;
            updateDocumentStatus();
            fileNameSlot.querySelector<HTMLButtonElement>(".document-name-edit")?.focus();
          } else {
            input.setAttribute("aria-invalid", "true");
          }
        }
      });
      input.addEventListener("input", () => {
        input.removeAttribute("aria-invalid");
        input.removeAttribute("title");
      });
      input.focus();
      input.select();
    });
    fileNameSlot.append(editButton);
  };

  const updateDocumentStatus = (): void => {
    const active = store.activeDocument;
    if (editingDocumentId && (editingDocumentId !== active.id || active.path)) editingDocumentId = null;
    const dirty = active.code !== active.savedCode;
    status.dataset.state = dirty ? "unsaved" : "saved";
    statusText.textContent = dirty ? t("unsaved") : t("saved");
    renderDocumentName(active);
    filePath.textContent = active.path ?? t("newDocument");
    filePath.hidden = !active.path;
    status.title = active.path ? `${active.name}\n${active.path}` : active.name;
  };
  updateDocumentStatus();
  store.on("code", updateDocumentStatus);
  store.on("documents", updateDocumentStatus);

  const setRecentOpen = (open: boolean): void => {
    if (open && !recentDialog.open) recentDialog.showModal();
    if (!open && recentDialog.open) recentDialog.close();
    recentButton.setAttribute("aria-expanded", String(open));
  };

  const renderRecentFiles = (): void => {
    const renderToken = ++recentRenderToken;
    recentPanel.replaceChildren();
    const files = isDesktop() ? loadRecentFiles() : [];
    if (files.length === 0) {
      const empty = document.createElement("span");
      empty.className = "recent-files__empty";
      empty.textContent = t("noRecent");
      recentPanel.append(empty);
      return;
    }
    void Promise.all(files.map(async (file, index) => {
      let modifiedAt: Date | null = null;
      try {
        const details = await stat(file.path);
        if (details.mtime instanceof Date && Number.isFinite(details.mtime.getTime())) {
          modifiedAt = details.mtime;
        }
      } catch {
        // Keep inaccessible or removed files in the recent list without a date.
      }
      return { file, index, modifiedAt };
    })).then((entries) => {
      if (renderToken !== recentRenderToken) return;
      entries.sort((a, b) => {
        if (a.modifiedAt && b.modifiedAt) return b.modifiedAt.getTime() - a.modifiedAt.getTime() || a.index - b.index;
        if (a.modifiedAt) return -1;
        if (b.modifiedAt) return 1;
        return a.index - b.index;
      });
      recentPanel.replaceChildren(...entries.map(({ file, modifiedAt }) => {
        const row = document.createElement("div");
        row.className = "recent-files__item";
        row.role = "listitem";
        const item = document.createElement("button");
        item.className = "menu__recent-item";
        item.type = "button";
        const name = document.createElement("span");
        name.className = "recent-file__name";
        name.textContent = fileNameFromPath(file.path);
        const path = document.createElement("span");
        path.className = "recent-file__path";
        path.textContent = file.path;
        item.append(name, path);
        if (modifiedAt) {
          const date = document.createElement("span");
          date.className = "recent-file__date";
          date.textContent = t("lastEdited", {
            date: new Intl.DateTimeFormat(getLanguage(), { dateStyle: "medium", timeStyle: "short" }).format(modifiedAt),
          });
          item.append(date);
        }
        item.title = file.path;
        item.setAttribute("aria-label", t("openFileLabel", { name: fileNameFromPath(file.path) }));
        item.addEventListener("click", () => {
          setRecentOpen(false);
          void openRecent(file.path);
        });
        row.append(item);
        return row;
      }));
    });
  };

  onLanguageChange(() => {
    updateDocumentStatus();
    renderRecentFiles();
  });

  const setBusy = (value: boolean): void => {
    busy = value;
    openButton.disabled = value;
    saveButton.disabled = value;
    saveAsButton.disabled = value;
    recentButton.disabled = value;
    recentCloseButton.disabled = value;
    recentPanel.querySelectorAll<HTMLButtonElement>("button").forEach((item) => {
      item.disabled = value;
    });
  };

  const saveAs = async (): Promise<boolean> => {
    const code = store.code;
    const active = store.activeDocument;
    const defaultName = active.path ? fileNameFromPath(active.path) : mermaidFileName(active.name);
    const result = await saveMermaidFile(code, defaultName);
    if (result.status === "cancelled") return false;
    const path = isDesktop() ? result.path : null;
    if (path) addRecentFile(path);
    store.markActiveDocumentSaved(code, path, fileNameFromPath(result.path));
    showToast(t("savedDiagram"), "success");
    return true;
  };

  const saveCurrent = async (): Promise<boolean> => {
    const code = store.code;
    const active = store.activeDocument;
    if (!active.path) return saveAs();
    await writeMermaidFile(active.path, code);
    addRecentFile(active.path);
    store.markActiveDocumentSaved(code, active.path, active.name);
    showToast(t("savedChanges", { name: fileNameFromPath(active.path) }), "success");
    return true;
  };

  const openRecent = async (path: string): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      const content = await readMermaidFile(path);
      const existing = store.documents.find((item) => item.path === path);
      if (existing) store.activateDocument(existing.id);
      else store.createDocument(content, path, fileNameFromPath(path), true);
      addRecentFile(path);
      showToast(t("openedDiagram", { name: fileNameFromPath(path) }), "success");
    } catch (error) {
      showToast(errorMessage(error, t("openRecentError")), "error");
    } finally {
      setBusy(false);
      renderRecentFiles();
    }
  };

  const openFile = async (): Promise<void> => {
    if (busy) return;
    setRecentOpen(false);
    setBusy(true);
    try {
      const result = await openMermaidFile();
      if (result.status === "cancelled") return;
      const existing = result.path ? store.documents.find((item) => item.path === result.path) : undefined;
      if (existing) store.activateDocument(existing.id);
      else store.createDocument(result.content, result.path, result.name, true);
      if (result.path) addRecentFile(result.path);
      showToast(t("openedDiagram", { name: result.name }), "success");
    } catch (error) {
      showToast(errorMessage(error, t("openDiagramError")), "error");
    } finally {
      setBusy(false);
    }
  };

  const saveFromToolbar = async (save: () => Promise<boolean>): Promise<void> => {
    if (busy) return;
    setRecentOpen(false);
    setBusy(true);
    try {
      await save();
    } catch (error) {
      showToast(errorMessage(error, t("saveDiagramError")), "error");
    } finally {
      setBusy(false);
    }
  };

  const saveDocument = async (id: string): Promise<boolean> => {
    if (busy) return false;
    const previousId = store.activeDocument.id;
    setBusy(true);
    try {
      store.activateDocument(id);
      return await saveCurrent();
    } catch (error) {
      showToast(errorMessage(error, t("saveDiagramError")), "error");
      return false;
    } finally {
      if (store.documents.some((document) => document.id === previousId)) store.activateDocument(previousId);
      setBusy(false);
    }
  };

  openButton.addEventListener("click", () => void openFile());
  saveButton.addEventListener("click", () => {
    if (options.isWorkspaceMode?.()) {
      options.onWorkspaceSave?.();
      return;
    }
    void saveFromToolbar(saveCurrent);
  });
  saveAsButton.addEventListener("click", () => {
    if (options.isWorkspaceMode?.()) {
      options.onWorkspaceSaveAs?.();
      return;
    }
    void saveFromToolbar(saveAs);
  });
  recentButton.addEventListener("click", () => {
    if (busy) return;
    renderRecentFiles();
    setRecentOpen(!recentDialog.open);
  });
  recentCloseButton.addEventListener("click", () => setRecentOpen(false));
  recentDialog.addEventListener("click", (event) => {
    if (event.target === recentDialog) setRecentOpen(false);
  });
  recentDialog.addEventListener("close", () => recentButton.setAttribute("aria-expanded", "false"));

  if (isDesktop()) {
    const appWindow = getCurrentWindow();
    void appWindow.onCloseRequested(async (event) => {
      if (allowClose) return;
      event.preventDefault();
      if (closeInProgress) return;
      if (!store.documents.some((document) => document.savedCode === null || document.code !== document.savedCode)) {
        allowClose = true;
        await appWindow.destroy();
        return;
      }

      closeInProgress = true;
      try {
        const saveLabel = t("save");
        const noSaveLabel = t("doNotSave");
        const cancelLabel = t("cancel");
        const choice = await message(t("unsavedClosePrompt"), {
          title: t("saveBeforeClose"),
          kind: "warning",
          buttons: { yes: saveLabel, no: noSaveLabel, cancel: cancelLabel },
        });
        if (choice === cancelLabel || choice === "Cancel") return;
        if (choice === saveLabel || choice === "Yes") {
          const activeId = store.activeDocument.id;
          for (const document of store.documents) {
            if (document.savedCode !== null && document.code === document.savedCode) continue;
            store.activateDocument(document.id);
            const saved = await saveCurrent();
            if (!saved) {
              store.activateDocument(activeId);
              return;
            }
          }
          store.activateDocument(activeId);
        } else if (choice !== noSaveLabel && choice !== "No") return;
        allowClose = true;
        await appWindow.destroy();
      } catch (error) {
        showToast(errorMessage(error, t("closeWindowError")), "error");
      } finally {
        closeInProgress = false;
      }
    });
  } else {
    window.addEventListener("beforeunload", (event) => {
      if (store.documents.some((document) => document.savedCode === null || document.code !== document.savedCode)) {
        event.preventDefault();
        event.returnValue = "";
      }
    });
  }

  return { saveDocument };
}
