import { afterEach, describe, expect, test, vi } from 'vitest';
import { saveFile } from './files';

afterEach(() => {
  delete window.showSaveFilePicker;
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
    expect(await saveFile('Notes.md', 'Hello', handle)).toEqual({ name: 'Notes.md', handle });
    expect(handle.requestPermission).not.toHaveBeenCalled();
    expect(handle.written).toEqual(['Hello']);
  });

  test('asks for permission to write to a restored handle', async () => {
    const handle = fakeHandle('Notes.md', 'prompt', 'granted');
    expect(await saveFile('Notes.md', 'Hello', handle)).toEqual({ name: 'Notes.md', handle });
    expect(handle.requestPermission).toHaveBeenCalledWith({ mode: 'readwrite' });
    expect(handle.written).toEqual(['Hello']);
  });

  test('asks where to save when permission is denied', async () => {
    const handle = fakeHandle('Notes.md', 'prompt', 'denied');
    const picked = fakeHandle('Copy.md', 'granted');
    window.showSaveFilePicker = vi.fn(async () => picked);
    expect(await saveFile('Notes.md', 'Hello', handle)).toEqual({ name: 'Copy.md', handle: picked });
    expect(window.showSaveFilePicker).toHaveBeenCalledWith(
      expect.objectContaining({ suggestedName: 'Notes.md' }),
    );
    expect(handle.written).toEqual([]);
    expect(picked.written).toEqual(['Hello']);
  });
});
