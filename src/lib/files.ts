// Opening and saving files. Uses the File System Access API where available
// (so saves go back to the same file) and falls back to a file input and a
// download link elsewhere.

export interface SavedFile {
  name: string;
  handle?: FileSystemFileHandle;
}

export interface OpenedFile extends SavedFile {
  content: string;
}

const extensions = ['.md', '.markdown', '.mdown', '.txt'];

/** The files the app opens, as a picker or manifest `accept` value. */
export const fileTypes = { 'text/markdown': extensions };

const pickerTypes = [{ description: 'Markdown', accept: fileTypes }];

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/** Reads the file behind `handle`. */
export async function readFileHandle(handle: FileSystemFileHandle): Promise<OpenedFile> {
  const file = await handle.getFile();
  return { name: file.name, content: await file.text(), handle };
}

export async function openFile(): Promise<OpenedFile | undefined> {
  if (!window.showOpenFilePicker) return openWithInput();
  try {
    const [handle] = await window.showOpenFilePicker({ types: pickerTypes });
    return await readFileHandle(handle);
  } catch (error) {
    if (isAbort(error)) return undefined;
    throw error;
  }
}

function openWithInput(): Promise<OpenedFile | undefined> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = [...extensions, 'text/markdown', 'text/plain'].join(',');
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      resolve(file ? { name: file.name, content: await file.text() } : undefined);
    });
    input.addEventListener('cancel', () => resolve(undefined));
    input.click();
  });
}

/**
 * Whether the page may write to `handle`, asking the user if needed. Handles
 * restored from IndexedDB start without permission. Asking needs a user
 * gesture, so call this straight from one.
 */
async function canWrite(handle: FileSystemFileHandle): Promise<boolean> {
  const descriptor = { mode: 'readwrite' } as const;
  // Browsers without the permission methods grant access with the handle.
  if (!handle.queryPermission || !handle.requestPermission) return true;
  if ((await handle.queryPermission(descriptor)) === 'granted') return true;
  return (await handle.requestPermission(descriptor)) === 'granted';
}

/**
 * Saves to `handle` if given, otherwise asks where to save. Also asks if the
 * user doesn't allow writing to `handle`. Resolves undefined if cancelled.
 */
export async function saveFile(
  name: string,
  content: string,
  handle?: FileSystemFileHandle,
): Promise<SavedFile | undefined> {
  try {
    const permitted = handle && (await canWrite(handle)) ? handle : undefined;
    const target =
      permitted ?? (await window.showSaveFilePicker?.({ suggestedName: name, types: pickerTypes }));
    if (!target) {
      download(name, content);
      return { name };
    }
    const writable = await target.createWritable();
    await writable.write(content);
    await writable.close();
    return { name: target.name, handle: target };
  } catch (error) {
    if (isAbort(error)) return undefined;
    throw error;
  }
}

function download(name: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/markdown' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
