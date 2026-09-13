import { createSignal } from 'solid-js';
import { type RecentFile, readRecentFiles, writeRecentFiles } from '../lib/recent-store';
import { useListeners } from '../reactive';

export type { RecentFile };

/** How many files the list keeps. */
export const RECENT_FILES_LIMIT = 10;

const [recentFiles, setRecentFiles] = createSignal<readonly RecentFile[]>([]);

/** The files opened or saved most recently, newest first. Only files with handles are listed. */
export { recentFiles };

/** The stored list, or this tab's copy if it can't be read. */
async function currentList(): Promise<readonly RecentFile[]> {
  return (await readRecentFiles()) ?? recentFiles();
}

async function update(list: readonly RecentFile[]): Promise<void> {
  setRecentFiles(list);
  await writeRecentFiles(list);
}

/** Puts the file behind `handle` at the top of the recent files. */
export async function rememberFile(handle: FileSystemFileHandle): Promise<void> {
  const list = await currentList();
  const others: RecentFile[] = [];
  for (const entry of list) {
    if (!(await entry.handle.isSameEntry(handle))) others.push(entry);
  }
  await update([{ name: handle.name, handle }, ...others].slice(0, RECENT_FILES_LIMIT));
}

/** Removes the file behind `handle` from the recent files. */
export async function forgetFile(handle: FileSystemFileHandle): Promise<void> {
  const list = await currentList();
  const kept: RecentFile[] = [];
  for (const entry of list) {
    if (!(await entry.handle.isSameEntry(handle))) kept.push(entry);
  }
  if (kept.length !== list.length) await update(kept);
}

/** Loads the recent files, and reloads them whenever the page is shown, to pick up other tabs' changes. Call once from the app root. */
export function useRecentFiles(): void {
  const load = async () => {
    const list = await readRecentFiles();
    if (list) setRecentFiles(list);
  };
  void load();
  useListeners(window, { focus: () => void load() });
  useListeners(document, {
    visibilitychange: () => {
      if (document.visibilityState === 'visible') void load();
    },
  });
}
