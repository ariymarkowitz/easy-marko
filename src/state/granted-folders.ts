import { action, createSignal } from 'solid-js';
import { withoutEntry } from '../lib/file-access';
import { readFolders, writeFolders } from '../lib/folder-store';

/**
 * The folders the user has granted for reading local images, read from
 * IndexedDB when first needed. Refresh it to pick up folders other tabs
 * granted.
 */
const [grantedFolders, setGrantedFolders] = createSignal(async () => (await readFolders()) ?? [], { lazy: true });

export { grantedFolders };

/** Adds `folder` to the granted folders, replacing any copy of it, and keeps folders other tabs granted. */
export const addGrantedFolder = action(async function* (folder: FileSystemDirectoryHandle) {
  const stored = (await readFolders()) ?? grantedFolders();
  const list = [...(await withoutEntry(stored, folder, (entry) => entry)), folder];
  await writeFolders(list);
  yield;
  setGrantedFolders(list);
});
