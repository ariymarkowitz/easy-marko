import { afterEach, describe, expect, test, vi } from 'vitest';
import { readDroppedFiles, saveFile } from './files';

afterEach(() => {
  delete window.showSaveFilePicker;
  vi.restoreAllMocks();
});

/** A stand-in for a file handle whose readwrite permission starts as `permission`. */
function fakeHandle(name: string, permission: PermissionState, answer: PermissionState = permission) {
  const written: string[] = [];
  const handle = {
    name,
    written,
    queryPermission: vi.fn(async () => permission),
    requestPermission: vi.fn(async () => answer),
    createWritable: async () => ({
      write: async (content: string) => void written.push(content),
      close: async () => {},
    }),
  };
  return handle as typeof handle & FileSystemFileHandle;
}

describe('saveFile', () => {
  test('writes to a handle it has permission for without asking', async () => {
    const handle = fakeHandle('Notes.md', 'granted');
    expect(await saveFile('Notes.md', 'Hello', { handle })).toEqual({ name: 'Notes.md', handle });
    expect(handle.requestPermission).not.toHaveBeenCalled();
    expect(handle.written).toEqual(['Hello']);
  });

  test('asks for permission to write to a restored handle', async () => {
    const handle = fakeHandle('Notes.md', 'prompt', 'granted');
    expect(await saveFile('Notes.md', 'Hello', { handle })).toEqual({ name: 'Notes.md', handle });
    expect(handle.requestPermission).toHaveBeenCalledWith({ mode: 'readwrite' });
    expect(handle.written).toEqual(['Hello']);
  });

  test('asks where to save when permission is denied', async () => {
    const handle = fakeHandle('Notes.md', 'prompt', 'denied');
    const picked = fakeHandle('Copy.md', 'granted');
    window.showSaveFilePicker = vi.fn(async () => picked);
    expect(await saveFile('Notes.md', 'Hello', { handle })).toEqual({ name: 'Copy.md', handle: picked });
    expect(window.showSaveFilePicker).toHaveBeenCalledWith(
      expect.objectContaining({ suggestedName: 'Notes.md' }),
    );
    expect(handle.written).toEqual([]);
    expect(picked.written).toEqual(['Hello']);
  });

  test('downloads when showSaveFilePicker is an element that markdown put on window', async () => {
    // Browsers without the API expose an element with id="showSaveFilePicker" as window.showSaveFilePicker.
    window.showSaveFilePicker = document.createElement('div') as unknown as typeof window.showSaveFilePicker;
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    expect(await saveFile('Notes.md', 'Hello')).toEqual({ name: 'Notes.md' });
    expect(click).toHaveBeenCalled();
  });
});

describe('readDroppedFiles', () => {
  const dropped = (...items: object[]) => ({ items }) as unknown as DataTransfer;
  const file = (name: string, content: string) => ({ name, text: async () => content });

  test('reads the dropped files, with handles where the browser gives them', async () => {
    const handle = { kind: 'file', name: 'Notes.md', getFile: async () => file('Notes.md', '# Notes') };
    const results = readDroppedFiles(
      dropped(
        { kind: 'file', getAsFile: () => file('Notes.md', ''), getAsFileSystemHandle: async () => handle },
        { kind: 'file', getAsFile: () => file('Plain.md', '# Plain') },
        { kind: 'string', getAsFile: () => null },
      ),
    );
    expect(results).toHaveLength(2);
    expect(await results[0]).toEqual({ name: 'Notes.md', content: '# Notes', handle });
    expect(await results[1]).toEqual({ name: 'Plain.md', content: '# Plain' });
  });

  test('rejects folders and files that are not text', async () => {
    const folder = { kind: 'directory', name: 'Folder' };
    const [folderResult, imageResult] = readDroppedFiles(
      dropped(
        { kind: 'file', getAsFile: () => file('Folder', ''), getAsFileSystemHandle: async () => folder },
        { kind: 'file', getAsFile: () => file('Image.png', '\x89PNG\r\n\x1a\n\0\0\0\r') },
      ),
    );
    await expect(folderResult).rejects.toThrow('Folder');
    await expect(imageResult).rejects.toThrow('Image.png');
  });
});
