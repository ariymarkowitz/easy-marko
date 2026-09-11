// Opening and saving files. Uses the File System Access API where available
// (so saves go back to the same file) and falls back to a file input and a
// download link elsewhere.

export interface OpenedFile {
  name: string;
  content: string;
  handle?: FileSystemFileHandle;
}

export interface SavedFile {
  name: string;
  handle?: FileSystemFileHandle;
}

const pickerTypes = [
  {
    description: 'Markdown',
    accept: { 'text/markdown': ['.md', '.markdown', '.mdown', '.txt'] },
  },
];

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
    input.accept = '.md,.markdown,.mdown,.txt,text/markdown,text/plain';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      resolve(file ? { name: file.name, content: await file.text() } : undefined);
    });
    input.addEventListener('cancel', () => resolve(undefined));
    input.click();
  });
}

/** Saves to `handle` if given, otherwise asks where to save. Resolves undefined if cancelled. */
export async function saveFile(
  name: string,
  content: string,
  handle?: FileSystemFileHandle,
): Promise<SavedFile | undefined> {
  try {
    const target =
      handle ?? (await window.showSaveFilePicker?.({ suggestedName: name, types: pickerTypes }));
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
