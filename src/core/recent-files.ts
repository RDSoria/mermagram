const RECENTS_KEY = "mermagram:recent-files:v1";
export const MAX_RECENT_FILES = 10;

export interface RecentFile {
  path: string;
}

export function loadRecentFiles(): RecentFile[] {
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item): item is RecentFile =>
        typeof item === "object" &&
        item !== null &&
        "path" in item &&
        typeof item.path === "string" &&
        item.path.length > 0,
      )
      .slice(0, MAX_RECENT_FILES);
  } catch {
    return [];
  }
}

export function addRecentFile(path: string): RecentFile[] {
  const recent = [{ path }, ...loadRecentFiles().filter((item) => item.path !== path)].slice(
    0,
    MAX_RECENT_FILES,
  );
  try {
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(recent));
  } catch {
    /* Recents are best-effort; file operations must still succeed. */
  }
  return recent;
}

export function fileNameFromPath(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() || path;
}
