import { isTauri } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";

export interface SaveFilter {
  name: string;
  extensions: string[];
}

export interface SaveOptions {
  defaultName: string;
  data: Uint8Array;
  mime: string;
  filters: SaveFilter[];
}

export type SaveResult =
  | { status: "saved"; path: string }
  | { status: "cancelled" };

/** True when running inside the Tauri shell (vs. a plain browser tab). */
export function isDesktop(): boolean {
  try {
    return isTauri();
  } catch {
    return false;
  }
}

/**
 * Persists bytes to disk. Uses the native save dialog + Rust filesystem
 * access under Tauri; falls back to a browser download during development.
 */
export async function saveBytes(options: SaveOptions): Promise<SaveResult> {
  if (isDesktop()) {
    const path = await save({
      defaultPath: options.defaultName,
      filters: options.filters,
    });

    if (!path) return { status: "cancelled" };

    await writeFile(path, options.data);
    return { status: "saved", path };
  }

  const blob = new Blob([options.data as BlobPart], { type: options.mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = options.defaultName;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);

  return { status: "saved", path: options.defaultName };
}
