/** Local persistence for the draft diagram and editor preferences. */

const NS = "mermagram";
const LEGACY_NS = "mermaid-studio";
const KEY_CODE = `${NS}:code`;
const KEY_PREFS = `${NS}:prefs`;

export interface PersistedPrefs {
  collapsed?: boolean;
  width?: number;
  visualTheme?: string;
  layout?: string;
}

function read(key: string): string | null {
  try {
    const currentValue = window.localStorage.getItem(key);
    if (currentValue !== null) return currentValue;

    const legacyKey = `${LEGACY_NS}${key.slice(NS.length)}`;
    const legacyValue = window.localStorage.getItem(legacyKey);
    if (legacyValue !== null) {
      window.localStorage.setItem(key, legacyValue);
      window.localStorage.removeItem(legacyKey);
    }
    return legacyValue;
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable — the app keeps working in memory */
  }
}

export function loadCode(): string | null {
  return read(KEY_CODE);
}

export function saveCode(code: string): void {
  write(KEY_CODE, code);
}

export function loadPrefs(): PersistedPrefs {
  const raw = read(KEY_PREFS);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as PersistedPrefs;
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export function savePrefs(prefs: PersistedPrefs): void {
  write(KEY_PREFS, JSON.stringify(prefs));
}
