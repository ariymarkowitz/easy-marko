import { createEffect, createStore, deep, snapshot } from 'solid-js';
import { openFile, saveFile } from '../lib/files';
import { readJSON, STORAGE_KEYS, writeText } from '../lib/storage';
import welcome from '../content/welcome.md?raw';

export interface MarkdownDocument {
  id: string;
  name: string;
  content: string;
}

interface DocumentsState {
  documents: MarkdownDocument[];
  activeId: string;
}

function createDocument(name = 'Untitled.md', content = ''): MarkdownDocument {
  return { id: crypto.randomUUID(), name, content };
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

/** Removes a document from the app (the file on disk, if any, is untouched). */
export function closeDocument(id: string): void {
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

export async function openDocument(): Promise<void> {
  const file = await openFile().catch((error) => reportFileError('open', error));
  if (!file) return;
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
    if (target) target.name = saved.name;
  });
}

/** Debounced auto-backup of every open document to localStorage. Call once from the app root. */
export function useDocumentsBackup(): void {
  createEffect(
    () => JSON.stringify(snapshot(deep(state))),
    (json) => {
      const timer = setTimeout(() => writeText(STORAGE_KEYS.documents, json), 300);
      return () => clearTimeout(timer);
    },
  );
}
