import { createRoot, flush } from 'solid-js';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { openFile, saveFile } from '../lib/files';
import { STORAGE_KEYS } from '../lib/storage';
import {
  activeDocument,
  closeDocument,
  documentsState,
  hasUnsavedChanges,
  newDocument,
  openDocument,
  saveActiveDocument,
  updateContent,
  useDocumentsBackup,
} from './documents';

vi.mock('../lib/files', () => ({ openFile: vi.fn(), saveFile: vi.fn() }));

afterEach(() => {
  vi.restoreAllMocks();
});

function addDocument() {
  newDocument();
  flush();
  return activeDocument()!;
}

function edit(id: string, content: string) {
  updateContent(id, content);
  flush();
}

const isOpen = (id: string) => documentsState.documents.some((doc) => doc.id === id);

/** A stand-in for a file handle; handles with the same path are the same file. */
function fakeHandle(path: string): FileSystemFileHandle {
  return {
    name: path,
    path,
    isSameEntry: async (other: { path?: string }) => other.path === path,
  } as unknown as FileSystemFileHandle;
}

describe('unsaved changes', () => {
  test('follow edits away from and back to the saved content', () => {
    const doc = addDocument();
    expect(hasUnsavedChanges(doc)).toBe(false);
    edit(doc.id, 'Draft');
    expect(hasUnsavedChanges(doc)).toBe(true);
    edit(doc.id, '');
    expect(hasUnsavedChanges(doc)).toBe(false);
  });

  test('are cleared by saving', async () => {
    const doc = addDocument();
    edit(doc.id, 'Draft');
    vi.mocked(saveFile).mockResolvedValueOnce({ name: 'Draft.md' });
    await saveActiveDocument();
    flush();
    expect(saveFile).toHaveBeenLastCalledWith('Untitled.md', 'Draft', undefined);
    expect(doc.name).toBe('Draft.md');
    expect(hasUnsavedChanges(doc)).toBe(false);
  });

  test('remain when saving is cancelled', async () => {
    const doc = addDocument();
    edit(doc.id, 'Draft');
    vi.mocked(saveFile).mockResolvedValueOnce(undefined);
    await saveActiveDocument();
    flush();
    expect(hasUnsavedChanges(doc)).toBe(true);
  });
});

describe('closeDocument', () => {
  test('closes a document without unsaved changes straight away', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const doc = addDocument();
    closeDocument(doc.id);
    flush();
    expect(confirm).not.toHaveBeenCalled();
    expect(isOpen(doc.id)).toBe(false);
  });

  test('asks before closing a document with unsaved changes', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    const doc = addDocument();
    edit(doc.id, 'Draft');

    closeDocument(doc.id);
    flush();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(isOpen(doc.id)).toBe(true);

    closeDocument(doc.id);
    flush();
    expect(isOpen(doc.id)).toBe(false);
  });
});

describe('openDocument', () => {
  test('switches to a file that is already open instead of opening it again', async () => {
    // A new handle each time, so the file is matched by isSameEntry, not identity.
    const pickNotes = () =>
      vi.mocked(openFile).mockResolvedValueOnce({
        name: 'Notes.md',
        content: '# Notes',
        handle: fakeHandle('Notes.md'),
      });

    pickNotes();
    await openDocument();
    flush();
    const notes = activeDocument()!;
    expect(notes.content).toBe('# Notes');

    addDocument();
    const count = documentsState.documents.length;
    pickNotes();
    await openDocument();
    flush();
    expect(documentsState.documents).toHaveLength(count);
    expect(activeDocument()?.id).toBe(notes.id);
  });
});

describe('useDocumentsBackup', () => {
  test('writes the pending backup when the page is hidden', () => {
    localStorage.removeItem(STORAGE_KEYS.documents);
    const dispose = createRoot((dispose) => {
      useDocumentsBackup();
      return dispose;
    });
    flush();
    const doc = addDocument();
    edit(doc.id, 'Latest draft');

    window.dispatchEvent(new Event('pagehide'));
    expect(localStorage.getItem(STORAGE_KEYS.documents)).toContain('Latest draft');
    dispose();
  });
});
