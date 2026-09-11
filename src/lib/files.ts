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

const pickerTypes = [{ description: 'Markdown', accept: { 'text/markdown': extensions } }];

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export async function openFile(): Promise<OpenedFile | undefined> {
  if (!window.showOpenFilePicker) return openWithInput();
  try {
    const [handle] = await window.showOpenFilePicker({ types: pickerTypes });
    const file = await handle.getFile();
    return { name: file.name, content: await file.text(), handle };
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

/** A kind of file to save: what the save dialog offers, and the download's MIME type. */
export interface FileType {
  description: string;
  mimeType: string;
  extensions: string[];
}

const markdownFile: FileType = { description: 'Markdown', mimeType: 'text/markdown', extensions };

export const htmlFile: FileType = { description: 'HTML', mimeType: 'text/html', extensions: ['.html'] };

/**
 * Saves to `handle` if given, otherwise asks where to save. `content` can be a
 * function, called once there's somewhere to save to, so slow content doesn't
 * delay the dialog. Resolves undefined if cancelled.
 */
export async function saveFile(
  name: string,
  content: string | (() => Promise<string>),
  handle?: FileSystemFileHandle,
  type: FileType = markdownFile,
): Promise<SavedFile | undefined> {
  try {
    const target =
      handle ??
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
