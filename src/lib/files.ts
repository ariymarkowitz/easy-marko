// Opening and saving files. Uses the File System Access API where available
// (so saves go back to the same file) and falls back to a file input and a
// download link elsewhere.

// With its extension, because vite.config.ts loads this file through Node, which needs one.
import { requestAccess, unlessAborted } from './file-access.ts';

export interface SavedFile {
  name: string;
  handle?: FileSystemFileHandle;
}

export interface OpenedFile extends SavedFile {
  content: string;
}

/** A kind of file: what file dialogs offer, and a download's MIME type. */
export interface FileType {
  description: string;
  mimeType: string;
  extensions: string[];
}

const markdownFile: FileType = {
  description: 'Markdown',
  mimeType: 'text/markdown',
  extensions: ['.md', '.markdown', '.mdown', '.txt'],
};

export const htmlFile: FileType = { description: 'HTML', mimeType: 'text/html', extensions: ['.html'] };

const accept = (type: FileType) => ({ [type.mimeType]: type.extensions });

const pickerTypes = (type: FileType) => [{ description: type.description, accept: accept(type) }];

/** The files the app opens, as a manifest `accept` value. */
export const fileTypes = accept(markdownFile);

/** Reads `file` as text. Rejects if it isn't a text file. */
async function readTextFile(file: Pick<File, 'name' | 'text'>): Promise<string> {
  const content = await file.text();
  // Runs of control characters mean binary data (the same test CodeMirror uses for drops).
  // eslint-disable-next-line no-control-regex -- matching control characters is the point
  if (/[\0-\x08\x0e-\x1f]{2}/.test(content)) throw new Error(`${file.name} isn't a text file.`);
  return content;
}

/** Reads the file behind `handle`. Rejects if it isn't a text file. */
export async function readFileHandle(handle: FileSystemFileHandle): Promise<OpenedFile> {
  const file = await handle.getFile();
  return { name: file.name, content: await readTextFile(file), handle };
}

/** Whether a drag carries files, rather than text or a link. */
export function carriesFiles(data: DataTransfer | null): data is DataTransfer {
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
  return { name: file.name, content: await readTextFile(file) };
}

/** Asks for a file to open. Resolves undefined if cancelled; rejects if it isn't a text file. */
export async function openFile(): Promise<OpenedFile | undefined> {
  if (typeof window.showOpenFilePicker !== 'function') return openWithInput();
  const [handle] = (await unlessAborted(window.showOpenFilePicker({ types: pickerTypes(markdownFile) }))) ?? [];
  return handle && readFileHandle(handle);
}

function openWithInput(): Promise<OpenedFile | undefined> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = [...markdownFile.extensions, markdownFile.mimeType, 'text/plain'].join(',');
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (file) readTextFile(file).then((content) => resolve({ name: file.name, content }), reject);
      else resolve(undefined);
    });
    input.addEventListener('cancel', () => resolve(undefined));
    input.click();
  });
}

/** Where to save: `handle` if writing to it is allowed, else a picked file, else null to download. Undefined if cancelled. */
async function saveTarget(
  name: string,
  type: FileType,
  handle: FileSystemFileHandle | undefined,
): Promise<FileSystemFileHandle | null | undefined> {
  if (handle && (await requestAccess(handle, 'readwrite'))) return handle;
  if (typeof window.showSaveFilePicker !== 'function') return null;
  return unlessAborted(window.showSaveFilePicker({ suggestedName: name, types: pickerTypes(type) }));
}

/**
 * Saves to `handle` if given, otherwise asks where to save. Also asks if the
 * user doesn't allow writing to `handle`. `content` can be a function, called
 * once there's somewhere to save to, so slow content doesn't delay the dialog.
 * `type` defaults to Markdown. Resolves undefined if cancelled.
 */
export async function saveFile(
  name: string,
  content: string | (() => Promise<string>),
  { handle, type = markdownFile }: { handle?: FileSystemFileHandle; type?: FileType } = {},
): Promise<SavedFile | undefined> {
  const target = await saveTarget(name, type, handle);
  if (target === undefined) return undefined;
  const text = typeof content === 'string' ? content : await content();
  if (!target) {
    download(name, text, type.mimeType);
    return { name };
  }
  const writable = await target.createWritable();
  await writable.write(text);
  await writable.close();
  return { name: target.name, handle: target };
}

function download(name: string, content: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
