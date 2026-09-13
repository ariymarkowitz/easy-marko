import { createEffect, createStore, deep, flush, reconcile, snapshot } from 'solid-js';
import { clamp } from '../lib/clamp';
import { exportHtml } from '../lib/export-html';
import { type OpenedFile, openFile, readFileHandle, requestAccess, saveFile } from '../lib/files';
import { readFolders } from '../lib/folder-store';
import { deleteHandles, readHandles, storeHandle } from '../lib/handle-store';
import { hashText } from '../lib/hash';
import { localImageReader } from '../lib/local-images';
import { mergeById } from '../lib/merge';
import { parseJSON, readText, STORAGE_KEYS, writeText } from '../lib/storage';
import { useListeners } from '../reactive';
import { showNotice } from './notices';
import { forgetFile, rememberFile } from './recent-files';
import { theme } from './theme';
import welcomeSource from '../content/welcome.md?raw';

export interface MarkdownDocument {
  id: string;
  name: string;
  content: string;
  /**
   * Hash of the content when the document was last opened or saved. Backups
   * from before this field existed don't have it, so they count as unsaved.
   */
  savedHash: string;
  /**
   * When the document last changed, in milliseconds. Tabs use it to keep the
   * latest version when merging; backups from before this field existed count
   * the documents as changed at time 0.
   */
  updatedAt: number;
}

interface DocumentsState {
  documents: MarkdownDocument[];
  activeId: string;
}

const welcomeName = 'Welcome.md';
// welcome.md links to files in public/ from the root; the app may be served from a subpath.
const welcome = welcomeSource.replaceAll('src="/', `src="${import.meta.env.BASE_URL}`);

function createDocument(name = 'Untitled.md', content = ''): MarkdownDocument {
  const updatedAt = Date.now();
  return { id: crypto.randomUUID(), name, content, savedHash: hashText(content), updatedAt };
}

/**
 * The shared backup. Which document is active is per tab, so it's stored
 * separately (see useDocumentsBackup) and tabs don't overwrite each other's.
 */
interface Backup {
  documents: MarkdownDocument[];
}

/** A backup's documents, or undefined if it's missing, corrupt, or has no documents. */
function parseBackup(json: string | null): MarkdownDocument[] | undefined {
  const saved = parseJSON<Backup | undefined>(json, undefined);
  if (!saved?.documents?.length) return undefined;
  return saved.documents.map((doc) => ({ ...doc, updatedAt: doc.updatedAt ?? 0 }));
}

/**
 * The backup as this tab last read or wrote it. All tabs of the app share the
 * backup, so this is the common base for merging their changes; see syncBackup.
 */
let syncedBackup = readText(STORAGE_KEYS.documents);

function initialState(): DocumentsState {
  const documents = parseBackup(syncedBackup);
  if (documents) {
    const activeId = readText(STORAGE_KEYS.activeDocument);
    const hasActive = documents.some((doc) => doc.id === activeId);
    return { documents, activeId: hasActive ? activeId! : documents[0].id };
  }
  const doc = createDocument(welcomeName, welcome);
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
  for (const doc of parseBackup(readText(STORAGE_KEYS.documents)) ?? []) {
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

type DocumentChange = Partial<Pick<MarkdownDocument, 'name' | 'content' | 'savedHash'>>;

/**
 * Applies `change` to the document with `id`, if it's still open. A change
 * that sets fields to the values they have leaves the document as it is, so
 * it doesn't count as a newer version.
 */
function updateDocument(id: string, change: DocumentChange): void {
  setState((draft) => {
    const doc = draft.documents.find((d) => d.id === id);
    const fields = Object.keys(change) as (keyof DocumentChange)[];
    if (!doc || fields.every((field) => doc[field] === change[field])) return;
    // Later than the version it changes, even if the clock hasn't moved on.
    Object.assign(doc, change, { updatedAt: Math.max(Date.now(), doc.updatedAt + 1) });
  });
}

export function newDocument(): void {
  addDocument(createDocument());
}

/**
 * Opens a new copy of the welcome document. Switches to an open copy instead
 * if one is unedited and not saved to a file, so repeated clicks don't pile up.
 */
export function openWelcomeDocument(): void {
  const copy = state.documents.find(
    (doc) => doc.name === welcomeName && doc.content === welcome && !fileHandles.has(doc.id),
  );
  if (copy) selectDocument(copy.id);
  else addDocument(createDocument(welcomeName, welcome));
}

export function updateContent(id: string, content: string): void {
  updateDocument(id, { content });
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

function reportFileError(action: 'open' | 'save' | 'export', error: unknown): undefined {
  console.error(error);
  const reason = error instanceof Error ? error.message : String(error);
  showNotice(`Couldn't ${action} the file: ${reason}`, { tone: 'error' });
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

/** The file that the open document with `id` is linked to, if any. See linkedFileHandle. */
export function documentFile(id: string): FileSystemFileHandle | undefined {
  const doc = state.documents.find((d) => d.id === id);
  return doc && linkedFileHandle(doc);
}

/** Replaces a document's content with its file's, as read from disk. It then has no unsaved changes. */
export function reloadDocument(id: string, content: string): void {
  updateDocument(id, { content, savedHash: hashText(content) });
}

/** Ids of the documents being saved, whose files may be part-written. */
const savingIds = new Set<string>();

export const isSaving = (id: string): boolean => savingIds.has(id);

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
  if (file.handle) void rememberFile(file.handle);
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
 * Opens a recent file, or switches to it if it's open. Asks for permission to
 * read it if needed, so call this straight from a user gesture. A file that
 * has been moved or deleted is reported and removed from the recent files.
 */
export async function openRecentFile(handle: FileSystemFileHandle): Promise<void> {
  const openId = await findDocumentForFile(handle);
  if (openId) {
    selectDocument(openId);
    void rememberFile(handle);
    return;
  }
  try {
    if (!(await requestAccess(handle, 'read'))) return;
    await openFileDocument(await readFileHandle(handle));
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'NotFoundError')) {
      reportFileError('open', error);
      return;
    }
    void forgetFile(handle);
    showNotice(`${handle.name} has been moved or deleted.`, { tone: 'error' });
  }
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
  updateDocument(id, { name: trimmed });
  return true;
}

export async function saveActiveDocument(): Promise<void> {
  const doc = activeDocument();
  if (!doc) return;
  const { id, name, content } = doc;
  savingIds.add(id);
  try {
    await handlesLoaded;
    const handle = linkedFileHandle(doc);
    const saved = await saveFile(name, content, { handle }).catch((error) =>
      reportFileError('save', error),
    );
    if (!saved) return;
    if (saved.handle && saved.handle !== handle) setFileHandle(id, saved.handle);
    if (saved.handle) void rememberFile(saved.handle);
    // The content as written, so edits made while saving still count as unsaved.
    updateDocument(id, { name: saved.name, savedHash: hashText(content) });
  } finally {
    savingIds.delete(id);
  }
}

/**
 * Saves a standalone HTML copy of the active document. Its markdown file stays
 * the one Save writes to. Local images are embedded if their folder is granted.
 * The copy keeps the app's current colour scheme.
 */
export async function exportActiveDocument(): Promise<void> {
  const doc = activeDocument();
  if (!doc) return;
  const { name, content } = doc;
  const colorScheme = theme();
  await handlesLoaded;
  const file = linkedFileHandle(doc);
  const readImage = file && localImageReader(readFolders().then((folders) => folders ?? []), file);
  await exportHtml(name, content, { readImage, colorScheme }).catch((error) => reportFileError('export', error));
}

/** The file linked to the document with `id`, once the stored handles have loaded. */
export async function loadDocumentFile(id: string): Promise<FileSystemFileHandle | undefined> {
  await handlesLoaded;
  return documentFile(id);
}

const sameDocument = (a: MarkdownDocument, b: MarkdownDocument): boolean =>
  a.name === b.name && a.content === b.content && a.savedHash === b.savedHash;

/**
 * The later of two versions of a document. Versions changed in the same
 * millisecond are ordered by their contents, so every tab picks the same one.
 */
function laterVersion(a: MarkdownDocument, b: MarkdownDocument): MarkdownDocument {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b;
  return JSON.stringify(a) >= JSON.stringify(b) ? a : b;
}

/**
 * Merges this tab's documents with the backup, shows the result, and writes
 * it back. If another tab has written the backup since this tab last synced,
 * each document takes its latest version, and documents that one side closed
 * stay open if the other changed them.
 *
 * Tabs don't see each other's writes straight away, so a tab can write over a
 * newer backup with an older copy of a document it didn't change. Keeping the
 * latest version stops that copy undoing the newer edits, and the next write
 * restores them.
 */
function syncBackup(): void {
  const stored = readText(STORAGE_KEYS.documents);
  const local = snapshot(state);
  let documents = local.documents;
  const remote = stored === syncedBackup ? undefined : parseBackup(stored);
  if (remote) {
    const base = parseBackup(syncedBackup) ?? [];
    documents = mergeById(base, local.documents, remote, sameDocument, laterVersion);
    // Each tab closed a different document that the other didn't change.
    if (documents.length === 0) documents.push(createDocument());
    const activeIndex = local.documents.findIndex((doc) => doc.id === local.activeId);
    const activeId = documents.some((doc) => doc.id === local.activeId)
      ? local.activeId
      : documents[clamp(activeIndex, 0, documents.length - 1)].id;

    const openIds = new Set(documents.map((doc) => doc.id));
    const baseIds = new Set(base.map((doc) => doc.id));
    const remoteIds = new Set(remote.map((doc) => doc.id));
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

  const json = JSON.stringify({ documents } satisfies Backup);
  // If the write fails, the stored backup (already merged) stays the base.
  syncedBackup = json === stored || writeText(STORAGE_KEYS.documents, json) ? json : stored;
}

/**
 * Auto-backup of every open document to localStorage, shared by all tabs of
 * the app. Syncs 300ms after a change, and straight away when another tab
 * writes the backup. Also remembers the active document, which the tab
 * opens after a reload, and restores the file handles stored in IndexedDB, so
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

  createEffect(
    () => state.activeId,
    (id) => {
      writeText(STORAGE_KEYS.activeDocument, id);
    },
    { name: 'activeDocumentBackup' },
  );

  // Write the last edits straight away when the page goes away. Mobile
  // browsers can discard a background tab without firing pagehide, so also
  // sync whenever the page is hidden. A page restored from the back/forward
  // cache missed other tabs' storage events, so sync when it's shown too.
  useListeners(window, {
    storage: (event) => {
      if (event.key === STORAGE_KEYS.documents) syncBackup();
    },
    pagehide: syncBackup,
    pageshow: syncBackup,
  });
  useListeners(document, { visibilitychange: syncBackup });
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
