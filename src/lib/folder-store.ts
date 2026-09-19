// The folders the user has granted for showing local images, kept in IndexedDB
// so later files inside them show their images straight away.

import { listStore, STORES } from './database';

const folders = listStore<FileSystemDirectoryHandle>(STORES.folders);

/** The granted folders. */
export const readFolders = folders.read;

/** Best effort: without it, images need access granting again after a reload. */
export const writeFolders = folders.write;
