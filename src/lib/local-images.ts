// Images with paths relative to a markdown file, read through the File System
// Access API from a folder the user has granted. Chromium only.

import { ImageOff } from 'lucide';
import { iconMarkup } from './icon-markup';

/** Whether `src` is a path relative to the document, rather than a URL, an absolute path or a fragment. */
export function isRelativePath(src: string): boolean {
  return src !== '' && !/^([a-z][a-z\d+.-]*:|[/\\#?])/i.test(src);
}

/**
 * The path, as names from a folder, of `src` relative to a file at `filePath`
 * in that folder. Undefined if it leaves the folder (with `../`) or isn't a
 * valid path.
 */
export function resolvePath(filePath: readonly string[], src: string): string[] | undefined {
  const path = filePath.slice(0, -1);
  const withoutQuery = src.replace(/[?#].*$/, '');
  for (const part of withoutQuery.split(/[/\\]/)) {
    let name: string;
    try {
      name = decodeURIComponent(part);
    } catch {
      return undefined;
    }
    if (name === '' || name === '.') continue;
    if (name === '..') {
      if (path.length === 0) return undefined;
      path.pop();
    } else {
      path.push(name);
    }
  }
  return path.length > 0 ? path : undefined;
}

/** The file at `path` in `folder`. Rejects with a NotFoundError if it doesn't exist. */
export async function readFolderFile(folder: FileSystemDirectoryHandle, path: readonly string[]): Promise<File> {
  let current = folder;
  for (const name of path.slice(0, -1)) current = await current.getDirectoryHandle(name);
  const handle = await current.getFileHandle(path[path.length - 1]);
  return handle.getFile();
}

export interface FileLocation {
  folder: FileSystemDirectoryHandle;
  /** The file's path in the folder, ending with its name. */
  path: string[];
}

/**
 * The highest of `folders` that contains `file`, so `../` paths reach as far
 * as possible, or undefined if none does.
 */
export async function locateFile(
  folders: readonly FileSystemDirectoryHandle[],
  file: FileSystemFileHandle,
): Promise<FileLocation | undefined> {
  let best: FileLocation | undefined;
  for (const folder of folders) {
    const path = await folder.resolve(file).catch(() => null);
    if (path && path.length > (best?.path.length ?? 0)) best = { folder, path };
  }
  return best;
}

/** Whether the page may read `folder` without asking. */
export async function canReadFolder(folder: FileSystemDirectoryHandle): Promise<boolean> {
  if (!folder.queryPermission) return true;
  return (await folder.queryPermission({ mode: 'read' }).catch(() => 'denied')) === 'granted';
}

/** Reads `blob` as a data URL, for embedding in exported HTML. */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** What the preview can show for a local image. */
export type LocalImage =
  | { status: 'loaded'; url: string }
  | { status: 'loading' }
  /** The folder is granted, but the file isn't in it. */
  | { status: 'missing' }
  /** No granted folder contains the image. */
  | { status: 'no-access' };

const imageOffIcon = `<svg class="local-image-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconMarkup(ImageOff)}</svg>`;

function placeholder(img: HTMLImageElement, src: string, status: 'missing' | 'no-access'): HTMLElement {
  let path = src;
  try {
    path = decodeURI(src);
  } catch {
    // Show a malformed path as written.
  }
  const box = document.createElement('span');
  box.className = 'local-image';
  box.innerHTML = imageOffIcon;
  const label = box.appendChild(document.createElement('span'));
  label.className = 'local-image-label';
  label.textContent = img.alt || path;
  if (status === 'missing') {
    box.title = `${path} wasn't found`;
    label.textContent += ' (not found)';
  } else {
    box.title = `Allow access to the folder with ${path} to show it`;
    const button = box.appendChild(document.createElement('button'));
    button.type = 'button';
    button.className = 'local-image-allow';
    button.textContent = 'Allow access';
  }
  return box;
}

/** The images in `root` whose `src` is a relative path, with that path. */
function relativeImages(root: ParentNode): [HTMLImageElement, string][] {
  return [...root.querySelectorAll('img')].flatMap((img) => {
    const src = img.getAttribute('src');
    return src !== null && isRelativePath(src) ? [[img, src] as [HTMLImageElement, string]] : [];
  });
}

function parseHtml(html: string): HTMLTemplateElement {
  const template = document.createElement('template');
  template.innerHTML = html;
  return template;
}

/**
 * Sanitised HTML with its relatively addressed images shown as `imageFor`
 * says: loaded ones point at their URL, loading ones have no `src` yet, and
 * the rest are replaced by a placeholder. Placeholders for images without
 * access have an "Allow access" button (`.local-image-allow`).
 */
export function showLocalImages(html: string, imageFor: (src: string) => LocalImage): string {
  if (!html.includes('<img')) return html;
  const template = parseHtml(html);
  const images = relativeImages(template.content);
  if (images.length === 0) return html;
  for (const [img, src] of images) {
    const image = imageFor(src);
    if (image.status === 'loaded') img.src = image.url;
    else if (image.status === 'loading') img.removeAttribute('src');
    else img.replaceWith(placeholder(img, src, image.status));
  }
  return template.innerHTML;
}

/** Sanitised HTML with its relatively addressed images embedded as the data URLs `read` gives, where it gives one. */
export async function embedLocalImages(
  html: string,
  read: (src: string) => Promise<string | undefined>,
): Promise<string> {
  if (!html.includes('<img')) return html;
  const template = parseHtml(html);
  const images = relativeImages(template.content);
  if (images.length === 0) return html;
  await Promise.all(
    images.map(async ([img, src]) => {
      const url = await read(src).catch(() => undefined);
      if (url) img.src = url;
    }),
  );
  return template.innerHTML;
}

/**
 * Reads the images of the markdown file `file` as data URLs, from the
 * highest of `folders` that contains it, if the page may already read it.
 */
export function localImageReader(
  folders: Promise<readonly FileSystemDirectoryHandle[]>,
  file: FileSystemFileHandle,
): (src: string) => Promise<string | undefined> {
  const location = folders.then(async (list) => {
    const found = await locateFile(list, file);
    return found && (await canReadFolder(found.folder)) ? found : undefined;
  });
  return async (src) => {
    const found = await location;
    const path = found && resolvePath(found.path, src);
    return path && blobToDataUrl(await readFolderFile(found.folder, path));
  };
}
