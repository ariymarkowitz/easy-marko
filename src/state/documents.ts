import {
  action,
  createEffect,
  createMemo,
  createOptimistic,
  createStore,
  deep,
  flush,
  latest,
  onSettled,
  reconcile,
  refresh,
  resolve,
  snapshot,
} from 'solid-js';
import { APP_NAME } from '../app-info';
import { clamp } from '../lib/clamp';
import { listen } from '../lib/events';
import { chooseExportFile } from '../lib/export-html';
import { isDomError, requestAccess } from '../lib/file-access';
import { type OpenedFile, openFile, readFileHandle, saveFile } from '../lib/files';
import { deleteHandles, readHandles, storeHandle } from '../lib/handle-store';
import { hashText } from '../lib/hash';
import { localImageReader } from '../lib/local-images';
import { mergeById } from '../lib/merge';
import { parseJSON, readText, STORAGE_KEYS, writeText } from '../lib/storage';
import { delay } from '../lib/timers';
import { createMediaQuery } from '../reactive';
import { grantedFolders } from './granted-folders';
import { errorMessage, showNotice } from './notices';
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

export const activeDocument = (): MarkdownDocument | undefined =>
  state.documents.find((doc) => doc.id === state.activeId);

export function hasUnsavedChanges(doc: MarkdownDocument): boolean {
  return hashText(doc.content) !== doc.savedHash;
}

// File links

/**
 * File System Access API handles by document id, as stored in IndexedDB,
 * which all tabs share. A tab stores the handles it gets and removes the
 * handles of the documents it closes. Refreshed when this tab changes them or
 * picks up another tab's changes.
 */
const fileHandles = createMemo(readHandles, { lazy: true });

/** Stores a handle, and settles once fileHandles has it. */
async function setFileHandle(id: string, handle: FileSystemFileHandle): Promise<void> {
  await storeHandle(id, handle);
  await refresh(fileHandles);
}

async function removeFileHandle(id: string): Promise<void> {
  await deleteHandles([id]);
  await refresh(fileHandles);
}

/**
 * Removes stored handles of documents that no tab has open, such as those of
 * a backup that was cleared.
 */
async function pruneFileHandles(): Promise<void> {
  const stored = await readHandles();
  // Other tabs back up their new documents before storing their handles (see
  // openFileDocument), so any document with a stored handle is in the backup
  // by now, even if this tab hasn't synced it yet.
  const backedUp = parseBackup(readText(STORAGE_KEYS.documents)) ?? [];
  const openIds = new Set([...state.documents, ...backedUp].map((doc) => doc.id));
  const unused = [...stored.keys()].filter((id) => !openIds.has(id));
  if (unused.length > 0) await deleteHandles(unused);
}

/**
 * The handle of the file that `doc` was opened from or last saved to, while
 * the document still has the file's name. Renaming a document unlinks it from
 * its file: the next save asks where to save it under the new name, and
 * opening the file again opens a new document. Renaming it back relinks it.
 */
export function documentFile(doc: MarkdownDocument): FileSystemFileHandle | undefined {
  const handle = fileHandles().get(doc.id);
  return handle?.name === doc.name ? handle : undefined;
}

/** The files of the open documents that are linked to one, by document id. See documentFile. */
export function linkedFiles(): Map<string, FileSystemFileHandle> {
  return new Map(
    state.documents.flatMap((doc) => {
      const handle = documentFile(doc);
      return handle ? [[doc.id, handle] as const] : [];
    }),
  );
}

/** The id of the open document backed by the same file as `handle`, if any. */
async function findDocumentForFile(handle: FileSystemFileHandle): Promise<string | undefined> {
  for (const [id, file] of await resolve(linkedFiles)) {
    if (await file.isSameEntry(handle)) return id;
  }
  return undefined;
}

// Document actions

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
    (doc) => doc.name === welcomeName && doc.content === welcome && !latest(fileHandles)?.has(doc.id),
  );
  if (copy) selectDocument(copy.id);
  else addDocument(createDocument(welcomeName, welcome));
}

export function updateContent(id: string, content: string): void {
  updateDocument(id, { content });
}

/** Replaces a document's content with its file's, as read from disk. It then has no unsaved changes. */
export function reloadDocument(id: string, content: string): void {
  updateDocument(id, { content, savedHash: hashText(content) });
}

/**
 * Renames a document, trimming the name. Returns false, leaving the name as
 * it was, if the name is empty. See documentFile for documents with files.
 */
export function renameDocument(id: string, name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return false;
  updateDocument(id, { name: trimmed });
  return true;
}

/** Moves a document to `index` in the list, or as near as the list's ends allow. */
export function moveDocument(id: string, index: number): void {
  setState((draft) => {
    const from = draft.documents.findIndex((d) => d.id === id);
    const to = clamp(index, 0, draft.documents.length - 1);
    if (from === -1 || from === to) return;
    const [doc] = draft.documents.splice(from, 1);
    draft.documents.splice(to, 0, doc);
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
  void removeFileHandle(id);
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

// File actions

function reportFileError(task: 'open' | 'save' | 'export', error: unknown): undefined {
  console.error(error);
  showNotice(`Couldn't ${task} the file: ${errorMessage(error)}`, { tone: 'error' });
  return undefined;
}

/** Switches to the document of the file behind `handle`, if it's open, and returns whether it was. */
const selectFileDocument = action(async function* (handle: FileSystemFileHandle) {
  const openId = await findDocumentForFile(handle);
  if (!openId) return false;
  yield;
  selectDocument(openId);
  void rememberFile(handle);
  return true;
});

/** Opens `file` as a new document, or switches to its document if the file is already open. */
const openFileDocument = action(async function* (file: OpenedFile) {
  const { handle } = file;
  if (handle && (await selectFileDocument(handle))) return;
  yield;
  const doc = createDocument(file.name, file.content);
  addDocument(doc);
  if (!handle) return;
  // Back up the document before storing its handle, so that a tab starting
  // in between doesn't take the handle for a closed document's and remove it.
  flush();
  syncBackup();
  void rememberFile(handle);
  yield setFileHandle(doc.id, handle);
});

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
  if (await selectFileDocument(handle)) return;
  try {
    if (!(await requestAccess(handle, 'read'))) return;
    await openFileDocument(await readFileHandle(handle));
  } catch (error) {
    if (isDomError(error, 'NotFoundError')) {
      void forgetFile(handle);
      showNotice(`${handle.name} has been moved or deleted.`, { tone: 'error' });
    } else {
      reportFileError('open', error);
    }
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

/** The file linked to `doc` once the stored handles have loaded, for code outside the reactive graph. */
const loadDocumentFile = (doc: MarkdownDocument) => resolve(() => documentFile(doc));

/** Ids of the documents being saved, whose files may be part-written. */
const [savingIds, setSavingIds] = createOptimistic<ReadonlySet<string>>(new Set());

export const isSaving = (id: string): boolean => savingIds().has(id);

export const saveActiveDocument = action(async function* () {
  const doc = activeDocument();
  if (!doc) return;
  const { id, name, content } = doc;
  setSavingIds((ids) => new Set(ids).add(id));
  const handle = await loadDocumentFile(doc);
  const saved = await saveFile(name, content, { handle }).catch((error) => reportFileError('save', error));
  if (!saved) return;
  yield;
  // The content as written, so edits made while saving still count as unsaved.
  updateDocument(id, { name: saved.name, savedHash: hashText(content) });
  if (!saved.handle) return;
  void rememberFile(saved.handle);
  if (saved.handle !== handle) yield setFileHandle(id, saved.handle);
});

/** Where an export is: its save dialog is open, or it's building its file. */
const [exportStage, setExportStage] = createOptimistic<'choosing' | 'building' | undefined>(undefined);

/** Whether an export is building its file, after its save dialog has closed. */
export const exporting = (): boolean => exportStage() === 'building';

/**
 * Saves a standalone HTML copy of the active document. Its Markdown file stays
 * the one Save writes to. Local images are embedded if their folder is granted.
 * The copy keeps the app's current colour scheme. Does nothing while another
 * export is running.
 */
export const exportActiveDocument = action(async function* () {
  const doc = activeDocument();
  if (!doc || exportStage()) return;
  setExportStage('choosing');
  const { name, content } = doc;
  const colorScheme = theme();
  try {
    const write = await chooseExportFile(name);
    if (!write) return;
    yield;
    setExportStage('building');
    const file = await loadDocumentFile(doc);
    const readImage = file && localImageReader(await resolve(grantedFolders), file);
    await write(content, { readImage, colorScheme });
  } catch (error) {
    reportFileError('export', error);
  }
});

// Backup sync

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

    // Closed in another tab, which removed its stored handle, but kept because this tab changed it.
    const baseIds = new Set(base.map((doc) => doc.id));
    const remoteIds = new Set(remote.map((doc) => doc.id));
    const handles = latest(fileHandles);
    for (const { id } of documents) {
      const handle = baseIds.has(id) && !remoteIds.has(id) && handles?.get(id);
      if (handle) void storeHandle(id, handle);
    }
    setState((draft) => {
      reconcile(documents, 'id')(draft.documents);
      draft.activeId = activeId;
    });
    // Pick up the handles that other tabs stored or removed. IndexedDB runs
    // requests in order, so this sees the handles stored above.
    void refresh(fileHandles);
  }

  const json = JSON.stringify({ documents } satisfies Backup);
  // If the write fails, the stored backup (already merged) stays the base.
  syncedBackup = json === stored || writeText(STORAGE_KEYS.documents, json) ? json : stored;
}

/**
 * Auto-backup of every open document to localStorage, shared by all tabs of
 * the app. Syncs 300ms after a change, and straight away when another tab
 * writes the backup. Also remembers the active document, which the tab
 * opens after a reload, and removes the stored file handles of documents that
 * no tab has open. Call once from the app root.
 */
export function useDocumentsBackup(): void {
  void pruneFileHandles();

  createEffect(
    () => deep(state),
    () => delay(syncBackup, 300),
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
  onSettled(() =>
    listen(window, {
      storage: (event) => {
        if (event.key === STORAGE_KEYS.documents) syncBackup();
      },
      pagehide: syncBackup,
      pageshow: syncBackup,
    }),
  );
  onSettled(() => listen(document, { visibilitychange: syncBackup }));
}

/** Whether the app runs in its own window, installed as a PWA. */
const installed = createMediaQuery('(display-mode: standalone)');

/**
 * Shows the active document's name in the window title. An installed app's
 * window already puts the app's name before the title, so it's left out there.
 */
export function useWindowTitle(): void {
  createEffect(
    () => {
      const doc = activeDocument();
      if (!doc) return APP_NAME;
      return installed() ? doc.name : `${doc.name} — ${APP_NAME}`;
    },
    (title) => {
      document.title = title;
    },
    { name: 'windowTitle' },
  );
}
