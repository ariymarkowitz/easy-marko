// The folders the user has granted for showing local images, kept in IndexedDB
// so later files inside them show their images straight away. Every access is
// best effort.

import { STORES, transaction } from './database';

const KEY = 'list';

/** The granted folders, or undefined if IndexedDB can't be read. */
export async function readFolders(): Promise<FileSystemDirectoryHandle[] | undefined> {
  try {
    return (
      (await transaction<FileSystemDirectoryHandle[] | undefined>(STORES.folders, 'readonly', (store) =>
        store.get(KEY),
      )) ?? []
    );
  } catch {
    return undefined;
  }
}

export async function writeFolders(folders: readonly FileSystemDirectoryHandle[]): Promise<void> {
  try {
    await transaction(STORES.folders, 'readwrite', (store) => store.put(folders, KEY));
  } catch {
    // Best effort: without it, images need access granting again after a reload.
  }
}
