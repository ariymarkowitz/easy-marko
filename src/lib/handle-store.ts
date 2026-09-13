// File handles kept in IndexedDB, keyed by document id, so saves can go back
// to the same file after a reload. Handles can't go in localStorage, but
// IndexedDB can store them. Every access is best effort: reads give undefined
// and writes are dropped.

import { STORES, transaction } from './database';

/** Every stored handle by document id, or undefined if IndexedDB can't be read. */
export async function readHandles(): Promise<Map<string, FileSystemFileHandle> | undefined> {
  try {
    const handles = new Map<string, FileSystemFileHandle>();
    await transaction(STORES.fileHandles, 'readonly', (store) => {
      const cursor = store.openCursor();
      cursor.onsuccess = () => {
        const current = cursor.result;
        if (!current) return;
        handles.set(String(current.key), current.value as FileSystemFileHandle);
        current.continue();
      };
    });
    return handles;
  } catch {
    return undefined;
  }
}

export async function storeHandle(id: string, handle: FileSystemFileHandle): Promise<void> {
  try {
    await transaction(STORES.fileHandles, 'readwrite', (store) => store.put(handle, id));
  } catch {
    // Best effort: without the handle, the next save after a reload asks where to save.
  }
}

export async function deleteHandles(ids: Iterable<string>): Promise<void> {
  try {
    await transaction(STORES.fileHandles, 'readwrite', (store) => {
      for (const id of ids) store.delete(id);
    });
  } catch {
    // Ignore: a leftover entry is removed the next time the app starts.
  }
}
