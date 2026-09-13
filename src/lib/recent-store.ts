// The recently opened files, kept in IndexedDB with their handles so they can
// be opened again after a reload. Every access is best effort.

import { STORES, transaction } from './database';

export interface RecentFile {
  name: string;
  handle: FileSystemFileHandle;
}

const KEY = 'list';

/** The recent files, newest first, or undefined if IndexedDB can't be read. */
export async function readRecentFiles(): Promise<RecentFile[] | undefined> {
  try {
    const list = await transaction<RecentFile[] | undefined>(STORES.recentFiles, 'readonly', (store) =>
      store.get(KEY),
    );
    return list ?? [];
  } catch {
    return undefined;
  }
}

export async function writeRecentFiles(list: readonly RecentFile[]): Promise<void> {
  try {
    await transaction(STORES.recentFiles, 'readwrite', (store) => store.put(list, KEY));
  } catch {
    // Best effort: the list is a convenience.
  }
}
