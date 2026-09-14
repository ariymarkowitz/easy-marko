// File handles by document id, so saves go back to the same file after a
// reload. Every access is best effort: reads give undefined and writes are
// dropped.

import { STORES, transaction } from './database';

/** Every stored handle by document id, or undefined if IndexedDB can't be read. */
export function readHandles(): Promise<Map<string, FileSystemFileHandle> | undefined> {
  const handles = new Map<string, FileSystemFileHandle>();
  return transaction(STORES.fileHandles, 'readonly', (store) => {
    const cursor = store.openCursor();
    cursor.onsuccess = () => {
      const current = cursor.result;
      if (!current) return;
      handles.set(String(current.key), current.value as FileSystemFileHandle);
      current.continue();
    };
  }).then(
    () => handles,
    () => undefined,
  );
}

export async function storeHandle(id: string, handle: FileSystemFileHandle): Promise<void> {
  // Best effort: without the handle, the next save after a reload asks where to save.
  await transaction(STORES.fileHandles, 'readwrite', (store) => store.put(handle, id)).catch(() => {});
}

export async function deleteHandles(ids: Iterable<string>): Promise<void> {
  // Ignore failures: a leftover entry is removed the next time the app starts.
  await transaction(STORES.fileHandles, 'readwrite', (store) => {
    for (const id of ids) store.delete(id);
  }).catch(() => {});
}
