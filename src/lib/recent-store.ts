// The recently opened files, kept in IndexedDB with their handles so they can
// be opened again after a reload.

import { listStore, STORES } from './database';

export interface RecentFile {
  name: string;
  handle: FileSystemFileHandle;
}

const recentFiles = listStore<RecentFile>(STORES.recentFiles);

/** The recent files, newest first. */
export const readRecentFiles = recentFiles.read;

/** Best effort: the list is a convenience. */
export const writeRecentFiles = recentFiles.write;
