// Permissions and identity for File System Access API handles.

type AccessMode = 'read' | 'readwrite';

/** Whether the page may use `handle` in `mode` without asking. Asking needs a user gesture; this doesn't. */
export async function hasAccess(handle: FileSystemHandle, mode: AccessMode = 'read'): Promise<boolean> {
  if (!handle.queryPermission) return true;
  return (await handle.queryPermission({ mode }).catch(() => 'denied')) === 'granted';
}

/**
 * Whether the page may use `handle` in `mode`, asking the user if needed.
 * Handles restored from IndexedDB start without permission. Asking needs a
 * user gesture, so call this straight from one.
 */
export async function requestAccess(handle: FileSystemHandle, mode: AccessMode): Promise<boolean> {
  const descriptor = { mode };
  // Browsers without the permission methods grant access with the handle.
  if (!handle.queryPermission || !handle.requestPermission) return true;
  if ((await handle.queryPermission(descriptor)) === 'granted') return true;
  return (await handle.requestPermission(descriptor)) === 'granted';
}

/** `list` without the items whose handle is the same file or folder as `handle`. */
export async function withoutEntry<T>(
  list: readonly T[],
  handle: FileSystemHandle,
  handleOf: (item: T) => FileSystemHandle,
): Promise<T[]> {
  const same = await Promise.all(list.map((item) => handleOf(item).isSameEntry(handle)));
  return list.filter((_, i) => !same[i]);
}

/** Whether `error` is a DOMException named `name`, such as a cancelled picker's AbortError. */
export function isDomError(error: unknown, name: string): boolean {
  return error instanceof DOMException && error.name === name;
}

/** `promise`, resolving undefined instead of rejecting when a picker is cancelled (an AbortError). */
export function unlessAborted<T>(promise: Promise<T>): Promise<T | undefined> {
  return promise.catch((error: unknown) => {
    if (isDomError(error, 'AbortError')) return undefined;
    throw error;
  });
}
