import { withoutEntry } from '../lib/file-access';
import { readFolders, writeFolders } from '../lib/folder-store';

/** The granted folders, loaded from IndexedDB when first needed. */
let cache: Promise<FileSystemDirectoryHandle[]> | undefined;

/** The folders the user has granted for reading local images. Read from IndexedDB once, then cached. */
export function grantedFolders(): Promise<FileSystemDirectoryHandle[]> {
  return (cache ??= readFolders().then((list) => list ?? []));
}

/** Drops the cached folders, so the next read picks up folders other tabs granted. */
export function reloadGrantedFolders(): void {
  cache = undefined;
}

/** Adds `folder` to the granted folders, replacing any copy of it, and keeps folders other tabs granted. */
export async function addGrantedFolder(folder: FileSystemDirectoryHandle): Promise<void> {
  const stored = (await readFolders()) ?? (await grantedFolders());
  const list = [...(await withoutEntry(stored, folder, (entry) => entry)), folder];
  cache = Promise.resolve(list);
  await writeFolders(list);
}
