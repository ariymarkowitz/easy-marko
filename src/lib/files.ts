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

/** Reads `file` as text. Rejects if it isn't a text file. */
async function readText(file: Pick<File, 'name' | 'text'>): Promise<string> {
  const content = await file.text();
  // Runs of control characters mean binary data (the same test CodeMirror uses for drops).
  // eslint-disable-next-line no-control-regex -- matching control characters is the point
  if (/[\0-\x08\x0e-\x1f]{2}/.test(content)) throw new Error(`${file.name} isn't a text file.`);
  return content;
}

/** Reads the file behind `handle`. Rejects if it isn't a text file. */
export async function readFileHandle(handle: FileSystemFileHandle): Promise<OpenedFile> {
  const file = await handle.getFile();
  return { name: file.name, content: await readText(file), handle };
}

/** Whether a drag carries files, rather than text or a link. */
export function carriesFiles(data: DataTransfer | null): boolean {
  return data?.types.includes('Files') ?? false;
}

/**
 * Starts reading the files dropped with `data`, with their handles where the
 * browser gives them. Call during the drop event: `data` is emptied after it.
 * Each result rejects if its item is a folder or isn't a text file.
 */
export function readDroppedFiles(data: DataTransfer): Promise<OpenedFile>[] {
  return Array.from(data.items)
    .filter((item) => item.kind === 'file')
    .map((item) => readDroppedFile(item.getAsFile(), item.getAsFileSystemHandle?.()));
}

async function readDroppedFile(
  file: File | null,
  handle: Promise<FileSystemHandle | null> | undefined,
): Promise<OpenedFile> {
  const entry = await handle?.catch(() => null);
  if (entry?.kind === 'directory') throw new Error(`${entry.name} is a folder.`);
  if (entry) return readFileHandle(entry as FileSystemFileHandle);
  if (!file) throw new Error("The dropped item isn't a file.");
  return { name: file.name, content: await readText(file) };
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

/** A kind of file to save: what the save dialog offers, and the download's MIME type. */
export interface FileType {
  description: string;
  mimeType: string;
  extensions: string[];
}

const markdownFile: FileType = { description: 'Markdown', mimeType: 'text/markdown', extensions };

export const htmlFile: FileType = { description: 'HTML', mimeType: 'text/html', extensions: ['.html'] };

/**
 * Saves to `handle` if given, otherwise asks where to save. Also asks if the
 * user doesn't allow writing to `handle`. `content` can be a function, called
 * once there's somewhere to save to, so slow content doesn't delay the dialog.
 * Resolves undefined if cancelled.
 */
export async function saveFile(
  name: string,
  content: string | (() => Promise<string>),
  handle?: FileSystemFileHandle,
  type: FileType = markdownFile,
): Promise<SavedFile | undefined> {
  try {
    const permitted = handle && (await canWrite(handle)) ? handle : undefined;
    const target =
      permitted ??
      (await window.showSaveFilePicker?.({
        suggestedName: name,
        types: [{ description: type.description, accept: { [type.mimeType]: type.extensions } }],
      }));
    const text = typeof content === 'string' ? content : await content();
    if (!target) {
      download(name, text, type.mimeType);
      return { name };
    }
    const writable = await target.createWritable();
    await writable.write(text);
    await writable.close();
    return { name: target.name, handle: target };
  } catch (error) {
    if (isAbort(error)) return undefined;
    throw error;
  }
}

function download(name: string, content: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
