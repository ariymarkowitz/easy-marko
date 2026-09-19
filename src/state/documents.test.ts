import { flush } from 'solid-js';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { storedHandles } from '../lib/__mocks__/handle-store';
import { fakeFileHandle } from '../lib/file-system.fakes';
import { chooseSaveFile, openFile, saveFile } from '../lib/files';
import { STORAGE_KEYS } from '../lib/storage';
import welcome from '../content/welcome.md?raw';
import { mountHooks, setMediaMatches } from '../test-helpers';
import {
  activeDocument,
  closeDocument,
  documentsState,
  exportActiveDocument,
  exporting,
  hasUnsavedChanges,
  type MarkdownDocument,
  newDocument,
  openDocument,
  openWelcomeDocument,
  renameDocument,
  saveActiveDocument,
  selectDocument,
  updateContent,
  useDocumentsBackup,
  useWindowTitle,
} from './documents';

vi.mock('../lib/files');

vi.mock('../lib/handle-store');

afterEach(() => {
  vi.restoreAllMocks();
});

/** Waits for pending handle loads and writes. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

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
    expect(saveFile).toHaveBeenLastCalledWith('Untitled.md', 'Draft', { handle: undefined });
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

describe('exportActiveDocument', () => {
  test('is exporting while the file builds, and ignores another export meanwhile', async () => {
    addDocument();
    let finish!: () => void;
    vi.mocked(chooseSaveFile).mockResolvedValueOnce(
      (text) => new Promise((resolve) => (finish = () => resolve({ name: text && 'Untitled.html' }))),
    );

    const exported = exportActiveDocument();
    await settle();
    flush();
    expect(exporting()).toBe(true);

    await exportActiveDocument();
    expect(chooseSaveFile).toHaveBeenCalledTimes(1);

    await vi.waitFor(() => expect(finish).toBeDefined());
    finish();
    await exported;
    flush();
    expect(exporting()).toBe(false);
  });

  test('ignores another export while the save dialog is open', async () => {
    addDocument();
    let cancel!: () => void;
    vi.mocked(chooseSaveFile).mockImplementationOnce(
      () => new Promise((resolve) => (cancel = () => resolve(undefined))),
    );

    const exported = exportActiveDocument();
    await settle();
    flush();
    expect(exporting()).toBe(false);
    await exportActiveDocument();
    expect(chooseSaveFile).toHaveBeenCalledTimes(1);

    cancel();
    await exported;
    flush();
    expect(exporting()).toBe(false);
  });
});

describe('renameDocument', () => {
  test('trims the name and refuses empty names', () => {
    const doc = addDocument();
    expect(renameDocument(doc.id, '  Ideas.md ')).toBe(true);
    flush();
    expect(doc.name).toBe('Ideas.md');
    expect(renameDocument(doc.id, '   ')).toBe(false);
    flush();
    expect(doc.name).toBe('Ideas.md');
  });

  test('unlinks a document from its file until it gets the file name back', async () => {
    const handle = fakeFileHandle('Linked.md');
    vi.mocked(openFile).mockResolvedValueOnce({ name: 'Linked.md', content: '', handle });
    await openDocument();
    flush();
    const doc = activeDocument()!;

    renameDocument(doc.id, 'Renamed.md');
    flush();
    vi.mocked(saveFile).mockResolvedValueOnce(undefined);
    await saveActiveDocument();
    expect(saveFile).toHaveBeenLastCalledWith('Renamed.md', '', { handle: undefined });

    // Opening the file again opens a new document.
    vi.mocked(openFile).mockResolvedValueOnce({ name: 'Linked.md', content: '', handle: fakeFileHandle('Linked.md') });
    await openDocument();
    flush();
    expect(activeDocument()?.id).not.toBe(doc.id);

    selectDocument(doc.id);
    renameDocument(doc.id, 'Linked.md');
    flush();
    vi.mocked(saveFile).mockResolvedValueOnce(undefined);
    await saveActiveDocument();
    expect(saveFile).toHaveBeenLastCalledWith('Linked.md', '', { handle });
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

describe('openWelcomeDocument', () => {
  test('opens the original welcome text, and reuses a copy until it is edited', () => {
    openWelcomeDocument();
    flush();
    const first = activeDocument()!;
    expect(first).toMatchObject({ name: 'Welcome.md', content: welcome });
    expect(hasUnsavedChanges(first)).toBe(false);

    addDocument();
    openWelcomeDocument();
    flush();
    expect(activeDocument()!.id).toBe(first.id);

    edit(first.id, 'Edited');
    openWelcomeDocument();
    flush();
    const second = activeDocument()!;
    expect(second.id).not.toBe(first.id);
    expect(second.content).toBe(welcome);
  });
});

describe('openDocument', () => {
  test('switches to a file that is already open instead of opening it again', async () => {
    // A new handle each time, so the file is matched by isSameEntry, not identity.
    const pickNotes = () =>
      vi.mocked(openFile).mockResolvedValueOnce({
        name: 'Notes.md',
        content: '# Notes',
        handle: fakeFileHandle('Notes.md'),
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
  }

  const useBackup = () => mountHooks(useDocumentsBackup);

  const readBackup = (): Backup => JSON.parse(localStorage.getItem(STORAGE_KEYS.documents)!);
  const backedUp = (id: string) => readBackup().documents.find((doc) => doc.id === id);

  /** Changes the backup as another tab of the app would. */
  function changeInOtherTab(change: (documents: MarkdownDocument[]) => MarkdownDocument[]) {
    const backup = readBackup();
    backup.documents = change(backup.documents);
    localStorage.setItem(STORAGE_KEYS.documents, JSON.stringify(backup));
  }

  /** Changes a document as another tab would, making it the latest version. */
  const changeDocument =
    (id: string, change: Partial<MarkdownDocument>) => (documents: MarkdownDocument[]) =>
      documents.map((doc) =>
        doc.id === id ? { ...doc, updatedAt: doc.updatedAt + 1, ...change } : doc,
      );

  const editIn = (id: string, content: string) => changeDocument(id, { content });

  function hidePage() {
    window.dispatchEvent(new Event('pagehide'));
    flush();
  }

  /** Fires the storage event another tab's backup write causes. */
  function syncFromOtherTab() {
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEYS.documents }));
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
    syncFromOtherTab();
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

  test('keeps the latest edits when another tab writes an older copy', () => {
    const dispose = useBackup();
    const doc = addDocument();
    edit(doc.id, 'Older');
    hidePage();
    const older = backedUp(doc.id)!;
    edit(doc.id, 'Newer');
    hidePage();

    // The other tab hadn't seen the newer edit when it wrote.
    changeInOtherTab((documents) => documents.map((d) => (d.id === doc.id ? older : d)));
    syncFromOtherTab();
    expect(doc.content).toBe('Newer');
    expect(backedUp(doc.id)?.content).toBe('Newer');
    dispose();
  });

  test("does not write the backup for another tab's changes", () => {
    const dispose = useBackup();
    const edited = addDocument();
    addDocument();
    hidePage();

    // The other tab has a different document open.
    changeInOtherTab(editIn(edited.id, 'Their edit'));
    const written = localStorage.getItem(STORAGE_KEYS.documents);
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    syncFromOtherTab();
    hidePage();
    expect(edited.content).toBe('Their edit');
    expect(setItem).not.toHaveBeenCalledWith(STORAGE_KEYS.documents, expect.anything());
    expect(localStorage.getItem(STORAGE_KEYS.documents)).toBe(written);
    dispose();
  });

  describe('file handles', () => {
    async function openWithHandle(name: string) {
      vi.mocked(openFile).mockResolvedValueOnce({ name, content: '', handle: fakeFileHandle(name) });
      await openDocument();
      flush();
      return activeDocument()!;
    }

    /** Saves the active document and returns the handle it was saved to. */
    async function saveActive() {
      vi.mocked(saveFile).mockImplementationOnce(async (name, _content, options) => ({
        name,
        handle: options?.handle,
      }));
      await saveActiveDocument();
      flush();
      return vi.mocked(saveFile).mock.lastCall?.[2]?.handle;
    }

    test('are restored at startup, and those of closed documents are removed', async () => {
      const doc = addDocument();
      const handle = fakeFileHandle('Restored.md', { name: doc.name });
      storedHandles.set(doc.id, handle);
      storedHandles.set('closed-document', fakeFileHandle('Closed.md'));

      const dispose = useBackup();
      await settle();
      expect(storedHandles.has('closed-document')).toBe(false);
      expect(await saveActive()).toBe(handle);
      dispose();
    });

    test('stored by another tab are used when saving', async () => {
      const dispose = useBackup();
      const doc = addDocument();
      hidePage();

      // The other tab saved the document to a file.
      const handle = fakeFileHandle('Saved in other tab.md', { name: doc.name });
      storedHandles.set(doc.id, handle);
      changeInOtherTab(changeDocument(doc.id, { savedHash: 'saved' }));
      syncFromOtherTab();
      await settle();
      expect(await saveActive()).toBe(handle);
      dispose();
    });

    test('stored by another tab are used to find files that are already open', async () => {
      const dispose = useBackup();
      hidePage();

      const shared = {
        id: 'shared-document',
        name: 'Shared.md',
        content: '',
        savedHash: '',
        updatedAt: 0,
      };
      changeInOtherTab((documents) => [...documents, shared]);
      storedHandles.set(shared.id, fakeFileHandle('Shared.md'));
      syncFromOtherTab();
      await settle();

      const count = documentsState.documents.length;
      await openWithHandle('Shared.md');
      expect(documentsState.documents).toHaveLength(count);
      expect(activeDocument()?.id).toBe(shared.id);
      dispose();
    });

    test('are removed when their document is closed', async () => {
      const doc = await openWithHandle('Closing.md');
      expect(storedHandles.has(doc.id)).toBe(true);
      closeDocument(doc.id);
      flush();
      await settle();
      expect(storedHandles.has(doc.id)).toBe(false);
    });

    test('are kept for a document closed in another tab but changed in this one', async () => {
      const dispose = useBackup();
      const doc = await openWithHandle('Kept.md');
      hidePage();

      edit(doc.id, 'My edit');
      changeInOtherTab((documents) => documents.filter((d) => d.id !== doc.id));
      storedHandles.delete(doc.id);
      syncFromOtherTab();
      await settle();
      expect(isOpen(doc.id)).toBe(true);
      expect(storedHandles.has(doc.id)).toBe(true);
      dispose();
    });
  });
});

describe('window title', () => {
  /** Opens or closes the app as an installed app. */
  const setInstalled = (installed: boolean) => setMediaMatches('(display-mode: standalone)', installed);

  test("shows the active document's name, and the app's name outside the installed app", () => {
    const dispose = mountHooks(useWindowTitle);
    const doc = addDocument();
    expect(document.title).toBe(`${doc.name} — Easy Marko`);

    setInstalled(true);
    expect(document.title).toBe(doc.name);

    setInstalled(false);
    dispose();
  });
});
