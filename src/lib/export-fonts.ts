// Fonts embedded in exported HTML as data URLs, so exports look like the
// preview offline and make no requests. Only the faces a document uses are
// embedded: by role (body, headings, code), style, and the subsets whose
// unicode-range covers its characters.

import figtree from '@fontsource-variable/figtree/wght.css?raw';
import figtreeItalic from '@fontsource-variable/figtree/wght-italic.css?raw';
import googleSansCode from '@fontsource-variable/google-sans-code/wght.css?raw';
import googleSansCodeItalic from '@fontsource-variable/google-sans-code/wght-italic.css?raw';
import instrumentSans from '@fontsource-variable/instrument-sans/wdth.css?raw';
import instrumentSansItalic from '@fontsource-variable/instrument-sans/wdth-italic.css?raw';
import katexCss from 'katex/dist/katex.min.css?raw';

// Glob options have to be written out in each call. Globs skip node_modules
// unless they're exhaustive.

/** URLs of KaTeX's WOFF2 fonts, keyed by path. Embedded only in documents with maths. */
const katexFontUrls = import.meta.glob<string>('/node_modules/katex/dist/fonts/*.woff2', {
  query: '?url',
  import: 'default',
  eager: true,
  exhaustive: true,
});

/** URLs of the files in the Fontsource stylesheets below, keyed by path. The same files as App.tsx imports. */
const fontUrls = import.meta.glob<string>(
  [
    '/node_modules/@fontsource-variable/instrument-sans/files/*-wdth-*.woff2',
    '/node_modules/@fontsource-variable/figtree/files/*-wght-*.woff2',
    '/node_modules/@fontsource-variable/google-sans-code/files/*-wght-*.woff2',
  ],
  { query: '?url', import: 'default', eager: true, exhaustive: true },
);

type FontRole = 'body' | 'heading' | 'code';

/** Each role's Fontsource stylesheets, as App.tsx imports them. */
const stylesheets: Record<FontRole, string[]> = {
  body: [instrumentSans, instrumentSansItalic],
  heading: [figtree, figtreeItalic],
  code: [googleSansCode, googleSansCodeItalic],
};

interface Face {
  role: FontRole;
  italic: boolean;
  /** The @font-face rule, with its file as `url(./files/<file>)`. */
  css: string;
  file: string;
  /** Inclusive code point ranges. */
  ranges: [number, number][];
}

const fileName = (path: string) => path.slice(path.lastIndexOf('/') + 1);

/** The code point ranges in a unicode-range value, like `U+0000-00FF,U+4??`. */
export function parseUnicodeRange(value: string): [number, number][] {
  return value.split(',').map((part) => {
    const [start, end = start] = part.trim().replace(/^U\+/i, '').split('-');
    // A wildcard like U+4?? covers U+400 to U+4FF.
    return [parseInt(start.replaceAll('?', '0'), 16), parseInt(end.replaceAll('?', 'F'), 16)];
  });
}

const faces: Face[] = Object.entries(stylesheets).flatMap(([role, sheets]) =>
  sheets
    .flatMap((sheet) => sheet.match(/@font-face\s*\{[^}]*\}/g) ?? [])
    .map((css) => ({
      role: role as FontRole,
      italic: /font-style:\s*italic/.test(css),
      css,
      file: /url\(\.\/files\/([\w-]+\.woff2)\)/.exec(css)![1],
      ranges: parseUnicodeRange(/unicode-range:\s*([^;}]+)/.exec(css)![1]),
    })),
);

/** Elements that markdown.css, editor.css or browsers set in italics. */
const italicSelector = 'em, i, cite, dfn, var, address, .tok-emphasis, .tok-comment';

const faceKey = (role: FontRole, italic: boolean) => `${role} ${italic ? 'italic' : 'normal'}`;

/** The code points of `html`'s text, other than whitespace, by the role and style they're shown in. */
function charactersByFace(html: string): Map<string, Set<number>> {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const characters = new Map<string, Set<number>>();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    // KaTeX's own fonts show maths.
    if (!parent || parent.closest('.katex')) continue;
    const role = parent.closest('code') ? 'code' : parent.closest('h1, h2, h3, h4, h5, h6') ? 'heading' : 'body';
    const key = faceKey(role, parent.closest(italicSelector) !== null);
    let set = characters.get(key);
    for (const char of (node as Text).data) {
      if (/\s/.test(char)) continue;
      if (!set) characters.set(key, (set = new Set()));
      set.add(char.codePointAt(0)!);
    }
  }
  return characters;
}

export async function fetchDataUrl(url: string, type: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Couldn't load ${url} (${response.status})`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  return `data:${type};base64,${bytes.toBase64()}`;
}

/** Data URLs for font `files`, keyed by file name, from `urls` keyed by path. */
async function fontDataUrls(urls: Record<string, string>, files: Iterable<string>): Promise<Map<string, string>> {
  const byName = new Map(Object.entries(urls).map(([path, url]) => [fileName(path), url]));
  return new Map(
    await Promise.all(
      [...new Set(files)].map(async (file) => {
        const url = byName.get(file);
        if (!url) throw new Error(`Missing font ${file}`);
        return [file, await fetchDataUrl(url, 'font/woff2')] as const;
      }),
    ),
  );
}

/** The @font-face rules, with embedded files, for the fonts that sanitised document `html` shows. */
export async function documentFontsCss(html: string): Promise<string> {
  const characters = charactersByFace(html);
  const used = faces.filter((face) => {
    const set = characters.get(faceKey(face.role, face.italic));
    return set !== undefined && [...set].some((code) => face.ranges.some(([start, end]) => code >= start && code <= end));
  });
  const dataUrls = await fontDataUrls(fontUrls, used.map((face) => face.file));
  return used
    .map((face) => face.css.replace(`url(./files/${face.file})`, `url(${dataUrls.get(face.file)})`))
    .join('\n');
}

/** KaTeX's stylesheet with its fonts embedded, so maths renders offline. */
export async function katexCssWithFonts(): Promise<string> {
  const dataUrls = await fontDataUrls(katexFontUrls, Object.keys(katexFontUrls).map(fileName));
  // Each @font-face lists WOFF2, WOFF and TTF files. Browsers that can show
  // the rest of the page all read WOFF2, so only that one is embedded.
  return katexCss.replace(
    /src:url\(fonts\/([\w-]+\.woff2)\)[^;}]*/g,
    (_, file: string) => `src:url(${dataUrls.get(file)}) format("woff2")`,
  );
}
