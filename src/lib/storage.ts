// localStorage helpers. Storage can be unavailable (private mode, blocked site
// data) or full, and saved values can be corrupt, so every access is guarded.

export const STORAGE_KEYS = {
  theme: 'easy-marko:theme',
  settings: 'easy-marko:settings',
  documents: 'easy-marko:documents',
} as const;

export function readText(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Returns whether the value was saved. */
export function writeText(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    // Best effort: the backup is a convenience, not the source of truth.
    return false;
  }
}

export function removeKey(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore: see writeText.
  }
}

export function parseJSON<T>(raw: string | null, fallback: T): T {
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function readJSON<T>(key: string, fallback: T): T {
  return parseJSON(readText(key), fallback);
}
