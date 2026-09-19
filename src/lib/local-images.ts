// Images with paths relative to a Markdown file, read through the File System
// Access API from a folder the user has granted. Chromium only.

import { ImageOff } from 'lucide';
import { hasAccess, unlessAborted } from './file-access';
import { iconSvg } from './icon-markup';

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

/** Asks for a folder to read, starting at `file`'s. Resolves undefined if cancelled. */
export function pickFolder(file: FileSystemFileHandle): Promise<FileSystemDirectoryHandle | undefined> {
  return unlessAborted(window.showDirectoryPicker!({ startIn: file, mode: 'read' }));
}

/** Reads `blob` as a data URL, for embedding in exported HTML. */
function blobToDataUrl(blob: Blob): Promise<string> {
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
  /** The folder is granted, but the file isn't in it. */
  | { status: 'missing' }
  /** No granted folder contains the image. */
  | { status: 'no-access' };

const imageOffIcon = iconSvg(ImageOff, 'icon');

function placeholder(alt: string, src: string, status: 'missing' | 'no-access'): HTMLElement {
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
  label.textContent = alt || path;
  if (status === 'missing') {
    box.title = `${path} wasn't found`;
    label.textContent += ' (not found)';
  } else {
    box.title = `Allow access to the folder with ${path} to show it`;
    const button = box.appendChild(document.createElement('button'));
    button.type = 'button';
    button.className = 'text-button local-image-allow';
    button.textContent = 'Allow access';
  }
  return box;
}

interface RelativeImages {
  template: HTMLTemplateElement;
  images: { img: HTMLImageElement; src: string }[];
}

/** `html` parsed, with its images whose `src` is a relative path, or undefined if it has none. */
function parseRelativeImages(html: string): RelativeImages | undefined {
  if (!html.includes('<img')) return undefined;
  const template = document.createElement('template');
  template.innerHTML = html;
  const images = [...template.content.querySelectorAll('img')].flatMap((img) => {
    const src = img.getAttribute('src');
    return src !== null && isRelativePath(src) ? [{ img, src }] : [];
  });
  return images.length > 0 ? { template, images } : undefined;
}

/**
 * Sanitised HTML with its relatively addressed images shown as `imageFor`
 * says: loaded ones point at their URL, and the rest are replaced by a
 * placeholder. Placeholders for images without access have an "Allow access"
 * button (`.local-image-allow`). A promise if `imageFor` gives any image as
 * one, resolving once they all have.
 */
export function showLocalImages(
  html: string,
  imageFor: (src: string) => LocalImage | Promise<LocalImage>,
): string | Promise<string> {
  const parsed = parseRelativeImages(html);
  if (!parsed) return html;
  const found = parsed.images.map(({ src }) => imageFor(src));
  const show = (images: LocalImage[]) => {
    parsed.images.forEach(({ img, src }, i) => {
      const image = images[i];
      if (image.status === 'loaded') img.src = image.url;
      else img.replaceWith(placeholder(img.alt, src, image.status));
    });
    return parsed.template.innerHTML;
  };
  return found.some((image) => image instanceof Promise) ? Promise.all(found).then(show) : show(found as LocalImage[]);
}

/** Sanitised HTML with its relatively addressed images embedded as the data URLs `read` gives, where it gives one. */
export async function embedLocalImages(
  html: string,
  read: (src: string) => Promise<string | undefined>,
): Promise<string> {
  const parsed = parseRelativeImages(html);
  if (!parsed) return html;
  await Promise.all(
    parsed.images.map(async ({ img, src }) => {
      const url = await read(src).catch(() => undefined);
      if (url) img.src = url;
    }),
  );
  return parsed.template.innerHTML;
}

/**
 * Reads the images of the Markdown file `file` as data URLs, from the
 * highest of `folders` that contains it, if the page may already read it.
 */
export function localImageReader(
  folders: Promise<readonly FileSystemDirectoryHandle[]>,
  file: FileSystemFileHandle,
): (src: string) => Promise<string | undefined> {
  const location = folders.then(async (list) => {
    const found = await locateFile(list, file);
    return found && (await hasAccess(found.folder)) ? found : undefined;
  });
  return async (src) => {
    const found = await location;
    const path = found && resolvePath(found.path, src);
    return path && blobToDataUrl(await readFolderFile(found.folder, path));
  };
}
