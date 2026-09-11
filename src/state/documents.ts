import { createEffect, createStore, deep, flush, onSettled, reconcile, snapshot } from 'solid-js';
import { clamp } from '../lib/clamp';
import { type OpenedFile, openFile, saveFile } from '../lib/files';
import { deleteHandles, readHandles, storeHandle } from '../lib/handle-store';
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

/**
 * File System Access API handles by document id: this tab's copy of the
 * handles in IndexedDB, which all tabs share. A tab stores the handles it gets
 * and removes the handles of the documents it closes, and reloads them when it
 * picks up another tab's changes.
 */
const fileHandles = new Map<string, FileSystemFileHandle>();

/** Counts this tab's handle changes, so a load can tell that its read is out of date. */
let handleChanges = 0;

/** Settles once the stored handles have loaded at startup. */
let handlesLoaded: Promise<void> = Promise.resolve();

function setFileHandle(id: string, handle: FileSystemFileHandle): void {
  handleChanges++;
  fileHandles.set(id, handle);
  void storeHandle(id, handle);
}

function removeFileHandle(id: string): void {
  handleChanges++;
  fileHandles.delete(id);
  void deleteHandles([id]);
}

/**
 * Replaces the open documents' handles with the stored ones. With `prune`,
 * also removes stored handles of documents that no tab has open, such as those
 * of a backup that was cleared.
 */
async function loadFileHandles(prune = false): Promise<void> {
  const changes = handleChanges;
  const stored = await readHandles();
  if (!stored) return;
  // This tab changed a handle during the read, so read again: the new read sees the change.
  if (changes !== handleChanges) return loadFileHandles(prune);

  const openIds = new Set(state.documents.map((doc) => doc.id));
  fileHandles.clear();
  for (const [id, handle] of stored) {
    if (openIds.has(id)) fileHandles.set(id, handle);
  }
  if (!prune) return;
  // Other tabs back up their new documents before storing their handles (see
  // openFileDocument), so any document with a stored handle is in the backup
  // by now, even if this tab hasn't synced it yet.
  for (const doc of parseBackup(readText(STORAGE_KEYS.documents))?.documents ?? []) {
    openIds.add(doc.id);
  }
  const unused = [...stored.keys()].filter((id) => !openIds.has(id));
  if (unused.length > 0) void deleteHandles(unused);
}

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
  removeFileHandle(id);
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

/**
 * The handle of the file that `doc` was opened from or last saved to, while
 * the document still has the file's name. Renaming a document unlinks it from
 * its file: the next save asks where to save it under the new name, and
 * opening the file again opens a new document. Renaming it back relinks it.
 */
function linkedFileHandle(doc: MarkdownDocument): FileSystemFileHandle | undefined {
  const handle = fileHandles.get(doc.id);
  return handle?.name === doc.name ? handle : undefined;
}

/** The id of the open document backed by the same file as `handle`, if any. */
async function findDocumentForFile(handle: FileSystemFileHandle): Promise<string | undefined> {
  await handlesLoaded;
  for (const doc of state.documents) {
    const existing = linkedFileHandle(doc);
    if (existing && (await existing.isSameEntry(handle))) return doc.id;
  }
  return undefined;
}

/** Opens `file` as a new document, or switches to its document if the file is already open. */
async function openFileDocument(file: OpenedFile): Promise<void> {
  const openId = file.handle && (await findDocumentForFile(file.handle));
  if (openId) {
    selectDocument(openId);
    return;
  }
  const doc = createDocument(file.name, file.content);
  addDocument(doc);
  if (file.handle) {
    // Back up the document before storing its handle, so that a tab starting
    // in between doesn't take the handle for a closed document's and remove it.
    flush();
    syncBackup();
    setFileHandle(doc.id, file.handle);
  }
}

export async function openDocument(): Promise<void> {
  const file = await openFile().catch((error) => reportFileError('open', error));
  if (file) await openFileDocument(file);
}

/**
 * Opens files that are being read, such as files the app was launched with,
 * in the order given. Reports each file that couldn't be read.
 */
export async function openFiles(files: Iterable<Promise<OpenedFile>>): Promise<void> {
  // Handle every failure straight away, so none goes unhandled while an earlier file opens.
  const results = Array.from(files, (file) =>
    file.catch((error: unknown) => reportFileError('open', error)),
  );
  for (const result of results) {
    const file = await result;
    if (file) await openFileDocument(file);
  }
}

/**
 * Renames a document, trimming the name. Returns false, leaving the name as
 * it was, if the name is empty. See linkedFileHandle for documents with files.
 */
export function renameDocument(id: string, name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return false;
  updateDocument(id, (doc) => {
    doc.name = trimmed;
  });
  return true;
}

export async function saveActiveDocument(): Promise<void> {
  const doc = activeDocument();
  if (!doc) return;
  const { id, name, content } = doc;
  await handlesLoaded;
  const handle = linkedFileHandle(doc);
  const saved = await saveFile(name, content, handle).catch((error) =>
    reportFileError('save', error),
  );
  if (!saved) return;
  if (saved.handle && saved.handle !== handle) setFileHandle(id, saved.handle);
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

    const openIds = new Set(documents.map((doc) => doc.id));
    const baseIds = new Set(base.map((doc) => doc.id));
    const remoteIds = new Set(remote.documents.map((doc) => doc.id));
    for (const [id, handle] of fileHandles) {
      // Closed in another tab, which removed the stored handle.
      if (!openIds.has(id)) fileHandles.delete(id);
      // Closed in another tab too, but kept because this tab changed it.
      else if (baseIds.has(id) && !remoteIds.has(id)) setFileHandle(id, handle);
    }
    setState((draft) => {
      reconcile(documents, 'id')(draft.documents);
      draft.activeId = activeId;
    });
    // Pick up the handles that other tabs stored for files they opened or saved.
    void loadFileHandles();
  }

  const json = JSON.stringify(next);
  // If the write fails, the stored backup (already merged) stays the base.
  syncedBackup = json === stored || writeText(STORAGE_KEYS.documents, json) ? json : stored;
}

/**
 * Auto-backup of every open document to localStorage, shared by all tabs of
 * the app. Syncs 300ms after a change, and straight away when another tab
 * writes the backup. Also restores the file handles stored in IndexedDB, so
 * saves go to the same files after a reload. Call once from the app root.
 */
export function useDocumentsBackup(): void {
  handlesLoaded = loadFileHandles(true);

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
