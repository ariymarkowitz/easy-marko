import { withoutEntry } from '../lib/file-access';
import { readFolders, writeFolders } from '../lib/folder-store';
import { createStoredList } from './stored-list';

/**
 * The folders the user has granted for reading local images. Refresh it to
 * pick up folders other tabs granted.
 */
const [grantedFolders, updateGrantedFolders] = createStoredList(readFolders, writeFolders);

export { grantedFolders };

/** Adds `folder` to the granted folders, replacing any copy of it. */
export const addGrantedFolder = (folder: FileSystemDirectoryHandle): Promise<void> =>
  updateGrantedFolders(async (list) => [...(await withoutEntry(list, folder, (entry) => entry)), folder]);
