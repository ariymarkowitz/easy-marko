import { createEffect, createSignal } from 'solid-js';
import { readFolders, writeFolders } from '../lib/folder-store';
import {
  canReadFolder,
  type FileLocation,
  type LocalImage,
  locateFile,
  readFolderFile,
  resolvePath,
  showLocalImages,
} from '../lib/local-images';
import { useListeners } from '../reactive';
import { activeDocument, loadDocumentFile } from './documents';
import { showNotice } from './notices';

/** What the preview can do for the active document's local images. */
type Access =
  /** The document has no file, or the browser can't grant folders: images stay as written. */
  | { status: 'unavailable' }
  /** No folder the page may read contains the file. `location` is a stored one waiting for permission again. */
  | { status: 'prompt'; file: FileSystemFileHandle; location?: FileLocation }
  | { status: 'granted'; file: FileSystemFileHandle; location: FileLocation };

const [access, setAccess] = createSignal<Access>({ status: 'unavailable' });

/** Counts finished image reads, so the preview shows them. */
const [imagesRead, setImagesRead] = createSignal(0);

/** The granted folders, loaded from IndexedDB when first needed. */
let folders: Promise<FileSystemDirectoryHandle[]> | undefined;

const storedFolders = () => (folders ??= readFolders().then((list) => list ?? []));

/** Read images by folder, then by path in the folder. Kept while the page is open. */
const images = new WeakMap<FileSystemDirectoryHandle, Map<string, LocalImage>>();

function imageIn(folder: FileSystemDirectoryHandle, path: string[]): LocalImage {
  let byPath = images.get(folder);
  if (!byPath) images.set(folder, (byPath = new Map()));
  const key = path.join('/');
  const known = byPath.get(key);
  if (known) return known;

  const loading: LocalImage = { status: 'loading' };
  byPath.set(key, loading);
  readFolderFile(folder, path)
    .then(
      (file): LocalImage => ({ status: 'loaded', url: URL.createObjectURL(file) }),
      (): LocalImage => ({ status: 'missing' }),
    )
    .then((image) => {
      byPath.set(key, image);
      setImagesRead((count) => count + 1);
    });
  return loading;
}

/** Counts refreshes, so an older one that finishes late doesn't overwrite a newer one. */
let refreshes = 0;

async function refresh(documentId: string | undefined): Promise<void> {
  const run = ++refreshes;
  const file = documentId && window.showDirectoryPicker ? await loadDocumentFile(documentId) : undefined;
  let next: Access = { status: 'unavailable' };
  if (file) {
    const location = await locateFile(await storedFolders(), file);
    next =
      location && (await canReadFolder(location.folder))
        ? { status: 'granted', file, location }
        : { status: 'prompt', file, location };
  }
  if (run === refreshes) setAccess(next);
}

/**
 * The active document's rendered, sanitised HTML with its relatively
 * addressed images read from the granted folder that contains its file.
 * Images show a placeholder while no folder is granted, with a button that
 * calls allowImageAccess.
 */
export function withLocalImages(html: string): string {
  const current = access();
  imagesRead();
  if (current.status === 'unavailable') return html;
  return showLocalImages(html, (src) => {
    if (current.status === 'prompt') return { status: 'no-access' };
    const path = resolvePath(current.location.path, src);
    // `../` past the granted folder needs a higher one.
    return path ? imageIn(current.location.folder, path) : { status: 'no-access' };
  });
}

/**
 * Lets the preview read the folder with the active document's file: asks for
 * permission again for a stored folder that contains it, or asks the user to
 * choose one. Call straight from a user gesture.
 */
export async function allowImageAccess(): Promise<void> {
  const current = access();
  if (current.status === 'unavailable') return;
  const { file } = current;

  if (current.status === 'prompt' && current.location?.folder.requestPermission) {
    const permission = await current.location.folder.requestPermission({ mode: 'read' });
    if (permission === 'granted') void refresh(activeDocument()?.id);
    return;
  }

  let folder: FileSystemDirectoryHandle;
  try {
    folder = await window.showDirectoryPicker!({ startIn: file, mode: 'read' });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return;
    showNotice(`Couldn't open the folder: ${error instanceof Error ? error.message : String(error)}`, {
      tone: 'error',
    });
    return;
  }
  if (!(await folder.resolve(file))) {
    showNotice(`${file.name} isn't in ${folder.name}. Choose its folder, or a folder above it.`, {
      tone: 'error',
    });
    return;
  }

  // Picks up folders other tabs granted, and replaces any stored copy of this one.
  const stored = (await readFolders()) ?? (await storedFolders());
  const others: FileSystemDirectoryHandle[] = [];
  for (const entry of stored) {
    if (!(await entry.isSameEntry(folder))) others.push(entry);
  }
  const list = [...others, folder];
  folders = Promise.resolve(list);
  await writeFolders(list);
  await refresh(activeDocument()?.id);
}

/**
 * Keeps the preview's access to local images up to date with the active
 * document and its file. Checks again when the window gains focus while
 * access is missing, as another tab may have granted it. Call once from the
 * app root.
 */
export function useLocalImages(): void {
  createEffect(
    () => {
      const doc = activeDocument();
      // A save can link the document to a new file.
      return doc ? `${doc.id}\n${doc.name}\n${doc.savedHash}` : '';
    },
    (key) => {
      void refresh(key.split('\n')[0] || undefined);
    },
    { name: 'localImages' },
  );

  useListeners(window, {
    focus: () => {
      if (access().status !== 'prompt') return;
      folders = undefined;
      void refresh(activeDocument()?.id);
    },
  });
}
