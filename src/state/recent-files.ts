import { createSignal } from 'solid-js';
import { withoutEntry } from '../lib/file-access';
import { type RecentFile, readRecentFiles, writeRecentFiles } from '../lib/recent-store';
import { useListeners } from '../reactive';

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

/** The last queued change to the list, settled or not. */
let queue: Promise<unknown> = Promise.resolve();

/**
 * Runs `change(...args)` after the changes queued before it. Each change reads the list
 * and writes it back, so changes that overlap, like remembering several
 * dropped files, would otherwise drop each other's files. Takes `args` rather
 * than a closure, which the Solid lint rule reads as a reactive scope.
 */
function enqueue<A extends unknown[]>(change: (...args: A) => Promise<void>, ...args: A): Promise<void> {
  const result = queue.then(() => change(...args));
  queue = result.catch(() => {});
  return result;
}

async function addFile(handle: FileSystemFileHandle): Promise<void> {
  const others = await withoutEntry(await currentList(), handle, (file) => file.handle);
  await update([{ name: handle.name, handle }, ...others].slice(0, RECENT_FILES_LIMIT));
}

async function removeFile(handle: FileSystemFileHandle): Promise<void> {
  const list = await currentList();
  const kept = await withoutEntry(list, handle, (file) => file.handle);
  if (kept.length !== list.length) await update(kept);
}

/** Puts the file behind `handle` at the top of the recent files. */
export const rememberFile = (handle: FileSystemFileHandle): Promise<void> => enqueue(addFile, handle);

/** Removes the file behind `handle` from the recent files. */
export const forgetFile = (handle: FileSystemFileHandle): Promise<void> => enqueue(removeFile, handle);

async function loadStored(): Promise<void> {
  const list = await readRecentFiles();
  if (list) setRecentFiles(list);
}

/** Loads the recent files, and reloads them whenever the page is shown, to pick up other tabs' changes. Call once from the app root. */
export function useRecentFiles(): void {
  // Queued, so a read from before a change can't replace the list after it.
  const load = () => enqueue(loadStored);
  void load();
  useListeners(window, { focus: () => void load() });
  useListeners(document, {
    visibilitychange: () => {
      if (document.visibilityState === 'visible') void load();
    },
  });
}
