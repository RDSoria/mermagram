import { getCurrentWindow } from "@tauri-apps/api/window";
import { message } from "@tauri-apps/plugin-dialog";
import { addRecentFile, fileNameFromPath, loadRecentFiles } from "../core/recent-files";
import { store } from "../core/store";
import type { EditorHandle } from "./editor";
import { showToast } from "./toast";
import { isDesktop } from "../platform/save";
import {
  openMermaidFile,
  readMermaidFile,
  saveMermaidFile,
  writeMermaidFile,
} from "../platform/mermaid-files";
import { onLanguageChange, t } from "../core/i18n";

interface FileMenuOptions {
  menu: HTMLElement;
  trigger: HTMLButtonElement;
  openButton: HTMLButtonElement;
  saveButton: HTMLButtonElement;
  saveAsButton: HTMLButtonElement;
  recentButton: HTMLButtonElement;
  recentPanel: HTMLElement;
  status: HTMLElement;
  statusText: HTMLElement;
  fileName: HTMLElement;
  filePath: HTMLElement;
  editor: EditorHandle;
  getCode: () => string;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function initFileMenu(options: FileMenuOptions): void {
  const {
    menu, trigger, openButton, saveButton, saveAsButton, recentButton, recentPanel,
    status, statusText, fileName, filePath, editor, getCode,
  } = options;
  let busy = false;
  let currentPath: string | null = null;
  let currentName: string | null = null;
  let savedCode = getCode();
  let closeInProgress = false;
  let allowClose = false;

  const updateDocumentStatus = (): void => {
    const dirty = getCode() !== savedCode;
    status.dataset.state = dirty ? "unsaved" : "saved";
    statusText.textContent = dirty ? t("unsaved") : t("saved");
    fileName.textContent = currentName ?? t("unnamedFile");
    filePath.textContent = currentPath ?? (currentName === null ? t("newDocument") : t("locationUnavailable"));
    status.title = currentPath ? `${currentName}\n${currentPath}` : fileName.textContent;
  };
  updateDocumentStatus();
  store.on("code", updateDocumentStatus);

  const markSaved = (code: string, path: string | null, name?: string): void => {
    savedCode = code;
    currentPath = path;
    currentName = path ? fileNameFromPath(path) : name ?? null;
    updateDocumentStatus();
  };

  const setRecentOpen = (open: boolean): void => {
    recentPanel.hidden = !open;
    recentButton.setAttribute("aria-expanded", String(open));
  };

  const setMenuOpen = (open: boolean): void => {
    menu.dataset.open = String(open);
    trigger.setAttribute("aria-expanded", String(open));
    if (!open) setRecentOpen(false);
    else renderRecentFiles();
  };

  const renderRecentFiles = (): void => {
    recentPanel.replaceChildren();
    const files = isDesktop() ? loadRecentFiles() : [];
    if (files.length === 0) {
      const empty = document.createElement("span");
      empty.className = "menu__empty";
      empty.textContent = t("noRecent");
      recentPanel.append(empty);
      return;
    }
    for (const file of files) {
      const item = document.createElement("button");
      item.className = "menu__recent-item";
      item.type = "button";
      item.role = "menuitem";
      item.textContent = fileNameFromPath(file.path);
      item.title = file.path;
      item.setAttribute("aria-label", t("openFileLabel", { name: fileNameFromPath(file.path) }));
      item.addEventListener("click", () => {
        setMenuOpen(false);
        void openRecent(file.path);
      });
      recentPanel.append(item);
    }
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
    recentPanel.querySelectorAll<HTMLButtonElement>("button").forEach((item) => {
      item.disabled = value;
    });
  };

  const saveAs = async (): Promise<boolean> => {
    const code = getCode();
    const result = await saveMermaidFile(code, currentPath ? fileNameFromPath(currentPath) : "diagrama.mmd");
    if (result.status === "cancelled") return false;
    const path = isDesktop() ? result.path : null;
    if (path) addRecentFile(path);
    markSaved(code, path, fileNameFromPath(result.path));
    showToast(t("savedDiagram"), "success");
    return true;
  };

  const saveCurrent = async (): Promise<boolean> => {
    const code = getCode();
    if (!currentPath) return saveAs();
    await writeMermaidFile(currentPath, code);
    addRecentFile(currentPath);
    markSaved(code, currentPath);
    showToast(t("savedChanges", { name: fileNameFromPath(currentPath) }), "success");
    return true;
  };

  const openRecent = async (path: string): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      const content = await readMermaidFile(path);
      editor.replaceDocument(content);
      addRecentFile(path);
      markSaved(content, path, fileNameFromPath(path));
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
    setMenuOpen(false);
    setBusy(true);
    try {
      const result = await openMermaidFile();
      if (result.status === "cancelled") return;
      editor.replaceDocument(result.content);
      if (result.path) addRecentFile(result.path);
      markSaved(result.content, result.path, result.name);
      showToast(t("openedDiagram", { name: result.name }), "success");
    } catch (error) {
      showToast(errorMessage(error, t("openDiagramError")), "error");
    } finally {
      setBusy(false);
    }
  };

  const saveFromMenu = async (save: () => Promise<boolean>): Promise<void> => {
    if (busy) return;
    setMenuOpen(false);
    setBusy(true);
    try {
      await save();
    } catch (error) {
      showToast(errorMessage(error, t("saveDiagramError")), "error");
    } finally {
      setBusy(false);
    }
  };

  trigger.addEventListener("click", (event) => {
    event.stopPropagation();
    if (busy) return;
    setMenuOpen(menu.dataset.open !== "true");
  });
  openButton.addEventListener("click", () => void openFile());
  saveButton.addEventListener("click", () => void saveFromMenu(saveCurrent));
  saveAsButton.addEventListener("click", () => void saveFromMenu(saveAs));
  recentButton.addEventListener("click", () => {
    if (busy) return;
    renderRecentFiles();
    setRecentOpen(recentPanel.hidden === true);
  });

  window.addEventListener("pointerdown", (event) => {
    if (menu.dataset.open === "true" && !menu.contains(event.target as Node)) setMenuOpen(false);
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menu.dataset.open === "true") {
      setMenuOpen(false);
      trigger.focus();
    }
  });

  if (isDesktop()) {
    const appWindow = getCurrentWindow();
    void appWindow.onCloseRequested(async (event) => {
      if (allowClose) return;
      event.preventDefault();
      if (closeInProgress) return;
      if (getCode() === savedCode) {
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
          const saved = await saveCurrent();
          if (!saved) return;
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
      if (getCode() !== savedCode) {
        event.preventDefault();
        event.returnValue = "";
      }
    });
  }
}
