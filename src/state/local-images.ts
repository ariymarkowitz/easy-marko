import { action, createMemo, refresh } from 'solid-js';
import { hasAccess } from '../lib/file-access';
import {
  type FileLocation,
  type LocalImage,
  locateFile,
  pickFolder,
  readFolderFile,
  resolvePath,
  showLocalImages,
} from '../lib/local-images';
import { useListeners } from '../reactive';
import { activeDocument, documentFile } from './documents';
import { addGrantedFolder, grantedFolders } from './granted-folders';
import { errorMessage, showNotice } from './notices';

/** What the preview can do for the active document's local images. */
type Access =
  /** The document has no file, or the browser can't grant folders: images stay as written. */
  | { status: 'unavailable' }
  /** No folder the page may read contains the file. `location` is a stored one waiting for permission again. */
  | { status: 'prompt'; file: FileSystemFileHandle; location?: FileLocation }
  | { status: 'granted'; file: FileSystemFileHandle; location: FileLocation };

async function accessTo(file: FileSystemFileHandle, folders: readonly FileSystemDirectoryHandle[]): Promise<Access> {
  const location = await locateFile(folders, file);
  return location && (await hasAccess(location.folder))
    ? { status: 'granted', file, location }
    : { status: 'prompt', file, location };
}

const access = createMemo(
  (): Access | Promise<Access> => {
    if (typeof window.showDirectoryPicker !== 'function') return { status: 'unavailable' };
    const doc = activeDocument();
    const file = doc && documentFile(doc);
    return file ? accessTo(file, grantedFolders()) : { status: 'unavailable' };
  },
  { lazy: true },
);

/**
 * Images by folder, then by path in the folder, each file read once and kept
 * while the page is open. An image is a promise until its read settles.
 */
const images = new WeakMap<FileSystemDirectoryHandle, Map<string, LocalImage | Promise<LocalImage>>>();

function imageIn(folder: FileSystemDirectoryHandle, path: string[]): LocalImage | Promise<LocalImage> {
  let byPath = images.get(folder);
  if (!byPath) images.set(folder, (byPath = new Map()));
  const key = path.join('/');
  const known = byPath.get(key);
  if (known) return known;

  const read = readFolderFile(folder, path).then(
    (file): LocalImage => ({ status: 'loaded', url: URL.createObjectURL(file) }),
    (): LocalImage => ({ status: 'missing' }),
  );
  byPath.set(key, read);
  void read.then((image) => byPath.set(key, image));
  return read;
}

/**
 * The active document's rendered, sanitised HTML with its relatively
 * addressed images read from the granted folder that contains its file.
 * Images show a placeholder while no folder is granted, with a button that
 * calls allowImageAccess. A promise while images it needs are being read.
 */
export function withLocalImages(html: string): string | Promise<string> {
  const current = access();
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
export const allowImageAccess = action(async function* () {
  const current = access();
  if (current.status === 'unavailable') return;
  const { file } = current;

  // Asks before anything is awaited, while the user gesture still counts.
  const stored = current.status === 'prompt' ? current.location?.folder : undefined;
  if (stored?.requestPermission) {
    if ((await stored.requestPermission({ mode: 'read' })) !== 'granted') return;
    yield;
    // Permissions aren't reactive, so check again.
    yield refresh(access);
    return;
  }

  const folder = await pickFolder(file).catch((error: unknown) => {
    showNotice(`Couldn't open the folder: ${errorMessage(error)}`, { tone: 'error' });
    return undefined;
  });
  if (!folder) return;
  if (!(await folder.resolve(file))) {
    showNotice(`${file.name} isn't in ${folder.name}. Choose its folder, or a folder above it.`, {
      tone: 'error',
    });
    return;
  }
  yield addGrantedFolder(folder);
});

/**
 * Checks the granted folders again when the window gains focus, as another
 * tab may have granted one. Call once from the app root.
 */
export function useLocalImages(): void {
  useListeners(window, { focus: () => void refresh(grantedFolders) });
}
