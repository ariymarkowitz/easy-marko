// localStorage helpers. Storage can be unavailable (private mode, blocked site
// data) or full, and saved values can be corrupt, so every access is guarded.

export const STORAGE_KEYS = {
  theme: 'marko-down:theme',
  settings: 'marko-down:settings',
  documents: 'marko-down:documents',
} as const;

export function readText(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeText(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Best effort: the backup is a convenience, not the source of truth.
  }
}

export function removeKey(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore: see writeText.
  }
}

export function readJSON<T>(key: string, fallback: T): T {
  const raw = readText(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
