import { onSettled, refresh } from 'solid-js';
import { listenPageShown } from '../lib/events';
import { withoutEntry } from '../lib/file-access';
import { readRecentFiles, writeRecentFiles } from '../lib/recent-store';
import { createStoredList } from './stored-list';

/** How many files the list keeps. */
export const RECENT_FILES_LIMIT = 10;

const [recentFiles, updateRecentFiles] = createStoredList(readRecentFiles, writeRecentFiles);

/** The files opened or saved most recently, newest first. Only files with handles are listed. */
export { recentFiles };

/** Puts the file behind `handle` at the top of the recent files. */
export const rememberFile = (handle: FileSystemFileHandle): Promise<void> =>
  updateRecentFiles(async (list) => {
    const others = await withoutEntry(list, handle, (file) => file.handle);
    return [{ name: handle.name, handle }, ...others].slice(0, RECENT_FILES_LIMIT);
  });

/** Removes the file behind `handle` from the recent files. */
export const forgetFile = (handle: FileSystemFileHandle): Promise<void> =>
  updateRecentFiles((list) => withoutEntry(list, handle, (file) => file.handle));

/** Reloads the recent files whenever the page is shown, to pick up other tabs' changes. Call once from the app root. */
export function useRecentFiles(): void {
  onSettled(() => listenPageShown(() => void refresh(recentFiles)));
}
