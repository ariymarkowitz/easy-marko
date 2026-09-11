import { createRoot, flush } from 'solid-js';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { openFile, saveFile } from '../lib/files';
import { STORAGE_KEYS } from '../lib/storage';
import {
  activeDocument,
  closeDocument,
  documentsState,
  hasUnsavedChanges,
  type MarkdownDocument,
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
  interface Backup {
    documents: MarkdownDocument[];
    activeId: string;
  }

  function useBackup() {
    const dispose = createRoot((dispose) => {
      useDocumentsBackup();
      return dispose;
    });
    flush();
    return dispose;
  }

  const readBackup = (): Backup => JSON.parse(localStorage.getItem(STORAGE_KEYS.documents)!);
  const backedUp = (id: string) => readBackup().documents.find((doc) => doc.id === id);

  /** Changes the backup as another tab of the app would. */
  function changeInOtherTab(change: (documents: MarkdownDocument[]) => MarkdownDocument[]) {
    const backup = readBackup();
    backup.documents = change(backup.documents);
    localStorage.setItem(STORAGE_KEYS.documents, JSON.stringify(backup));
  }

  const editIn = (id: string, content: string) => (documents: MarkdownDocument[]) =>
    documents.map((doc) => (doc.id === id ? { ...doc, content } : doc));

  function hidePage() {
    window.dispatchEvent(new Event('pagehide'));
    flush();
  }

  test('writes the pending backup when the page is hidden', () => {
    localStorage.removeItem(STORAGE_KEYS.documents);
    const dispose = useBackup();
    const doc = addDocument();
    edit(doc.id, 'Latest draft');

    hidePage();
    expect(backedUp(doc.id)?.content).toBe('Latest draft');
    dispose();
  });

  test('keeps edits made in another tab when writing', () => {
    const dispose = useBackup();
    const mine = addDocument();
    const theirs = addDocument();
    hidePage();

    // No storage event, as for a tab that was in the back/forward cache.
    changeInOtherTab(editIn(theirs.id, 'Their edit'));
    edit(mine.id, 'My edit');
    hidePage();
    expect(backedUp(mine.id)?.content).toBe('My edit');
    expect(backedUp(theirs.id)?.content).toBe('Their edit');
    expect(theirs.content).toBe('Their edit');
    dispose();
  });

  test('shows edits and closed documents from another tab straight away', () => {
    const dispose = useBackup();
    const edited = addDocument();
    const closed = addDocument();
    hidePage();

    changeInOtherTab((documents) =>
      editIn(edited.id, 'Their edit')(documents).filter((doc) => doc.id !== closed.id),
    );
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEYS.documents }));
    flush();
    expect(edited.content).toBe('Their edit');
    expect(isOpen(closed.id)).toBe(false);
    expect(activeDocument()?.id).toBe(edited.id);
    dispose();
  });

  test('does not bring back a document closed in this tab', () => {
    const dispose = useBackup();
    const other = addDocument();
    const closed = addDocument();
    hidePage();

    changeInOtherTab(editIn(other.id, 'Their edit'));
    closeDocument(closed.id);
    flush();
    hidePage();
    expect(isOpen(closed.id)).toBe(false);
    expect(backedUp(closed.id)).toBeUndefined();
    expect(backedUp(other.id)?.content).toBe('Their edit');
    dispose();
  });
});
