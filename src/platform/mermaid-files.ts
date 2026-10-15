import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeFile } from "@tauri-apps/plugin-fs";
import { isDesktop, saveBytes, type SaveResult } from "./save";
import { t } from "../core/i18n";

function mermaidFilter(): { name: string; extensions: string[] } {
  return { name: t("mermaidDiagram").replace(/…$/, ""), extensions: ["mmd", "mermaid"] };
}

export type OpenMermaidResult =
  | { status: "opened"; path: string | null; name: string; content: string }
  | { status: "cancelled" };

function browserOpen(): Promise<OpenMermaidResult> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".mmd,.mermaid,text/plain";

    input.addEventListener(
      "change",
      async () => {
        const file = input.files?.[0];
        input.remove();
        if (!file) {
          resolve({ status: "cancelled" });
          return;
        }
        try {
          resolve({ status: "opened", path: null, name: file.name, content: await file.text() });
        } catch (error) {
          reject(error);
        }
      },
      { once: true },
    );
    input.addEventListener(
      "cancel",
      () => {
        input.remove();
        resolve({ status: "cancelled" });
      },
      { once: true },
    );
    input.click();
  });
}

export async function openMermaidFile(): Promise<OpenMermaidResult> {
  if (!isDesktop()) return browserOpen();

  const selected = await open({ multiple: false, filters: [mermaidFilter()] });
  if (!selected || Array.isArray(selected)) return { status: "cancelled" };

  const content = await readTextFile(selected);
  const name = selected.split(/[\\/]/).pop() || selected;
  return { status: "opened", path: selected, name, content };
}

export async function readMermaidFile(path: string): Promise<string> {
  if (!isDesktop()) throw new Error(t("desktopRecentOnly"));
  return readTextFile(path);
}

export async function writeMermaidFile(path: string, content: string): Promise<void> {
  if (!isDesktop()) throw new Error(t("desktopSaveOnly"));
  await writeFile(path, new TextEncoder().encode(content));
}

export function saveMermaidFile(content: string, defaultName = "diagrama.mmd"): Promise<SaveResult> {
  return saveBytes({
    defaultName,
    data: new TextEncoder().encode(content),
    mime: "text/plain;charset=utf-8",
    filters: [mermaidFilter()],
  });
}
