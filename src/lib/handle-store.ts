// File handles by document id, so saves go back to the same file after a
// reload. Every access is best effort: failed writes are dropped, and failed
// reads give the handles as this tab last read or wrote them.

import { STORES, transaction } from './database';

/** This tab's copy of the stored handles, for when IndexedDB can't be read. */
let copy = new Map<string, FileSystemFileHandle>();

/** Every stored handle by document id. */
export function readHandles(): Promise<Map<string, FileSystemFileHandle>> {
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
    () => {
      copy = new Map(handles);
      return handles;
    },
    () => new Map(copy),
  );
}

export async function storeHandle(id: string, handle: FileSystemFileHandle): Promise<void> {
  copy.set(id, handle);
  // Best effort: without the handle, the next save after a reload asks where to save.
  await transaction(STORES.fileHandles, 'readwrite', (store) => store.put(handle, id)).catch(() => {});
}

export async function deleteHandles(ids: readonly string[]): Promise<void> {
  for (const id of ids) copy.delete(id);
  // Ignore failures: a leftover entry is removed the next time the app starts.
  await transaction(STORES.fileHandles, 'readwrite', (store) => {
    for (const id of ids) store.delete(id);
  }).catch(() => {});
}
