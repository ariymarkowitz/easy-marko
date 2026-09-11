import { createEffect, createStore, deep, onSettled, snapshot } from 'solid-js';
import { openFile, saveFile } from '../lib/files';
import { hashText } from '../lib/hash';
import { readJSON, STORAGE_KEYS, writeText } from '../lib/storage';
import welcome from '../content/welcome.md?raw';

export interface MarkdownDocument {
  id: string;
  name: string;
  content: string;
  /**
   * Hash of the content when the document was last opened or saved. Backups
   * from before this field existed don't have it, so they count as unsaved.
   */
  savedHash: string;
}

interface DocumentsState {
  documents: MarkdownDocument[];
  activeId: string;
}

function createDocument(name = 'Untitled.md', content = ''): MarkdownDocument {
  return { id: crypto.randomUUID(), name, content, savedHash: hashText(content) };
}

function initialState(): DocumentsState {
  const saved = readJSON<DocumentsState | undefined>(STORAGE_KEYS.documents, undefined);
  if (saved?.documents?.length) {
    const hasActive = saved.documents.some((doc) => doc.id === saved.activeId);
    return hasActive ? saved : { ...saved, activeId: saved.documents[0].id };
  }
  const doc = createDocument('Welcome.md', welcome);
  return { documents: [doc], activeId: doc.id };
}

const [state, setState] = createStore<DocumentsState>(initialState());

export { state as documentsState };

/** File System Access API handles. They can't be serialised, so they only last for the session. */
const fileHandles = new Map<string, FileSystemFileHandle>();

export const activeDocument = (): MarkdownDocument | undefined =>
  state.documents.find((doc) => doc.id === state.activeId);

export function hasUnsavedChanges(doc: MarkdownDocument): boolean {
  return hashText(doc.content) !== doc.savedHash;
}

export function selectDocument(id: string): void {
  setState((draft) => {
    draft.activeId = id;
  });
}

export function newDocument(): void {
  const doc = createDocument();
  setState((draft) => {
    draft.documents.push(doc);
    draft.activeId = doc.id;
  });
}

export function updateContent(id: string, content: string): void {
  setState((draft) => {
    const doc = draft.documents.find((d) => d.id === id);
    if (doc) doc.content = content;
  });
}

/**
 * Removes a document from the app, asking first if it has unsaved changes.
 * The file on disk, if any, is untouched.
 */
export function closeDocument(id: string): void {
  const doc = state.documents.find((d) => d.id === id);
  if (!doc) return;
  if (
    hasUnsavedChanges(doc) &&
    !window.confirm(`${doc.name} has unsaved changes. Close it and discard them?`)
  ) {
    return;
  }
  fileHandles.delete(id);
  setState((draft) => {
    const index = draft.documents.findIndex((d) => d.id === id);
    if (index === -1) return;
    draft.documents.splice(index, 1);
    if (draft.documents.length === 0) draft.documents.push(createDocument());
    if (draft.activeId === id) {
      draft.activeId = draft.documents[Math.min(index, draft.documents.length - 1)].id;
    }
  });
}

function reportFileError(action: 'open' | 'save', error: unknown): undefined {
  console.error(error);
  const reason = error instanceof Error ? error.message : String(error);
  window.alert(`Couldn't ${action} the file: ${reason}`);
  return undefined;
}

/** The id of the open document backed by the same file as `handle`, if any. */
async function findDocumentForFile(handle: FileSystemFileHandle): Promise<string | undefined> {
  for (const [id, existing] of fileHandles) {
    if (await existing.isSameEntry(handle)) return id;
  }
  return undefined;
}

export async function openDocument(): Promise<void> {
  const file = await openFile().catch((error) => reportFileError('open', error));
  if (!file) return;
  const openId = file.handle && (await findDocumentForFile(file.handle));
  if (openId) {
    selectDocument(openId);
    return;
  }
  const doc = createDocument(file.name, file.content);
  if (file.handle) fileHandles.set(doc.id, file.handle);
  setState((draft) => {
    draft.documents.push(doc);
    draft.activeId = doc.id;
  });
}

export async function saveActiveDocument(): Promise<void> {
  const doc = activeDocument();
  if (!doc) return;
  const { id, name, content } = doc;
  const saved = await saveFile(name, content, fileHandles.get(id)).catch((error) =>
    reportFileError('save', error),
  );
  if (!saved) return;
  if (saved.handle) fileHandles.set(id, saved.handle);
  setState((draft) => {
    const target = draft.documents.find((d) => d.id === id);
    if (!target) return;
    target.name = saved.name;
    // The content as written, so edits made while saving still count as unsaved.
    target.savedHash = hashText(content);
  });
}

/** Debounced auto-backup of every open document to localStorage. Call once from the app root. */
export function useDocumentsBackup(): void {
  let pending: string | undefined;
  const writePending = () => {
    if (pending === undefined) return;
    writeText(STORAGE_KEYS.documents, pending);
    pending = undefined;
  };

  createEffect(
    () => JSON.stringify(snapshot(deep(state))),
    (json) => {
      pending = json;
      const timer = setTimeout(writePending, 300);
      return () => clearTimeout(timer);
    },
    { name: 'documentsBackup' },
  );

  // Write the last edits straight away when the page goes away. Mobile
  // browsers can discard a background tab without firing pagehide, so also
  // write whenever the page is hidden.
  onSettled(() => {
    window.addEventListener('pagehide', writePending);
    document.addEventListener('visibilitychange', writePending);
    return () => {
      window.removeEventListener('pagehide', writePending);
      document.removeEventListener('visibilitychange', writePending);
    };
  });
}

/** Shows the active document's name in the window title. */
export function useWindowTitle(): void {
  createEffect(
    () => {
      const doc = activeDocument();
      return doc ? `${doc.name} — Easy Marko` : 'Easy Marko';
    },
    (title) => {
      document.title = title;
    },
    { name: 'windowTitle' },
  );
}
