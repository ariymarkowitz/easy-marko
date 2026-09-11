import { createEffect, createStore, deep, onSettled, reconcile, snapshot } from 'solid-js';
import { clamp } from '../lib/clamp';
import { openFile, saveFile } from '../lib/files';
import { hashText } from '../lib/hash';
import { mergeById } from '../lib/merge';
import { parseJSON, readText, STORAGE_KEYS, writeText } from '../lib/storage';
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

/** A backup's state, or undefined if it's missing, corrupt, or has no documents. */
function parseBackup(json: string | null): DocumentsState | undefined {
  const saved = parseJSON<DocumentsState | undefined>(json, undefined);
  return saved?.documents?.length ? saved : undefined;
}

/**
 * The backup as this tab last read or wrote it. All tabs of the app share the
 * backup, so this is the common base for merging their changes; see syncBackup.
 */
let syncedBackup = readText(STORAGE_KEYS.documents);

function initialState(): DocumentsState {
  const saved = parseBackup(syncedBackup);
  if (saved) {
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

function addDocument(doc: MarkdownDocument): void {
  setState((draft) => {
    draft.documents.push(doc);
    draft.activeId = doc.id;
  });
}

/** Applies `change` to the document with `id`, if it's still open. */
function updateDocument(id: string, change: (doc: MarkdownDocument) => void): void {
  setState((draft) => {
    const doc = draft.documents.find((d) => d.id === id);
    if (doc) change(doc);
  });
}

export function newDocument(): void {
  addDocument(createDocument());
}

export function updateContent(id: string, content: string): void {
  updateDocument(id, (doc) => {
    doc.content = content;
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
  addDocument(doc);
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
  updateDocument(id, (target) => {
    target.name = saved.name;
    // The content as written, so edits made while saving still count as unsaved.
    target.savedHash = hashText(content);
  });
}

const sameDocument = (a: MarkdownDocument, b: MarkdownDocument): boolean =>
  a.name === b.name && a.content === b.content && a.savedHash === b.savedHash;

/**
 * Merges this tab's documents with the backup, shows the result, and writes
 * it back. If another tab has written the backup since this tab last synced,
 * each side keeps the documents it changed (this tab wins where both changed
 * one), so neither overwrites the other's edits.
 */
function syncBackup(): void {
  const stored = readText(STORAGE_KEYS.documents);
  let next = snapshot(state);
  const remote = stored === syncedBackup ? undefined : parseBackup(stored);
  if (remote) {
    const local = next;
    const base = parseBackup(syncedBackup)?.documents ?? [];
    const documents = mergeById(base, local.documents, remote.documents, sameDocument);
    // Each tab closed a different document that the other didn't change.
    if (documents.length === 0) documents.push(createDocument());
    const activeIndex = local.documents.findIndex((doc) => doc.id === local.activeId);
    const activeId = documents.some((doc) => doc.id === local.activeId)
      ? local.activeId
      : documents[clamp(activeIndex, 0, documents.length - 1)].id;
    next = { documents, activeId };

    for (const id of fileHandles.keys()) {
      if (!documents.some((doc) => doc.id === id)) fileHandles.delete(id);
    }
    setState((draft) => {
      reconcile(documents, 'id')(draft.documents);
      draft.activeId = activeId;
    });
  }

  const json = JSON.stringify(next);
  // If the write fails, the stored backup (already merged) stays the base.
  syncedBackup = json === stored || writeText(STORAGE_KEYS.documents, json) ? json : stored;
}

/**
 * Auto-backup of every open document to localStorage, shared by all tabs of
 * the app. Syncs 300ms after a change, and straight away when another tab
 * writes the backup. Call once from the app root.
 */
export function useDocumentsBackup(): void {
  createEffect(
    () => JSON.stringify(snapshot(deep(state))),
    () => {
      const timer = setTimeout(syncBackup, 300);
      return () => clearTimeout(timer);
    },
    { name: 'documentsBackup' },
  );

  // Write the last edits straight away when the page goes away. Mobile
  // browsers can discard a background tab without firing pagehide, so also
  // sync whenever the page is hidden. A page restored from the back/forward
  // cache missed other tabs' storage events, so sync when it's shown too.
  onSettled(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEYS.documents) syncBackup();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('pagehide', syncBackup);
    window.addEventListener('pageshow', syncBackup);
    document.addEventListener('visibilitychange', syncBackup);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('pagehide', syncBackup);
      window.removeEventListener('pageshow', syncBackup);
      document.removeEventListener('visibilitychange', syncBackup);
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
