// Fonts embedded in exported HTML as data URLs, so exports look like the
// preview offline and make no requests. Only the faces a document uses are
// embedded: by role (body, headings, code), style, and the subsets whose
// unicode-range covers its characters. Each is cut down to the characters it
// shows (lib/font-subset.ts).

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

/** Axes the preview fixes, pinned so their data can be dropped. */
const pinnedAxes: Record<FontRole, Record<string, number>> = {
  // markdown.css sets the body's font-stretch to 96%.
  body: { wdth: 96 },
  heading: {},
  code: {},
};

/** Elements that markdown.css, editor.css or browsers set in italics. */
const italicSelector = 'em, i, cite, dfn, var, address, .tok-emphasis, .tok-comment';

const faceKey = (role: FontRole, italic: boolean) => `${role} ${italic ? 'italic' : 'normal'}`;

interface KatexFont {
  family?: string;
  style?: string;
  weight?: string;
}

/** The rules in KaTeX's stylesheet that set its fonts, in stylesheet order. */
const katexFontRules = [...katexCss.matchAll(/(\.katex[^{}]*)\{([^}]*)\}/g)].flatMap(([, selector, body]) => {
  const font: KatexFont = {};
  for (const declaration of body.split(';')) {
    const [property, value] = declaration.split(':');
    if (property === 'font-family') font.family = value.split(',')[0].replaceAll('"', '');
    else if (property === 'font-style') font.style = value;
    else if (property === 'font-weight') font.weight = value;
    else if (property === 'font') {
      // The shorthand on .katex, like `normal 1.21em KaTeX_Main,serif`.
      const [, style, family] = /^(\w+) [\d.]+em ([\w-]+)/.exec(value)!;
      Object.assign(font, { family, style, weight: 'normal' });
    }
  }
  return Object.keys(font).length ? [{ selector, font }] : [];
});

const katexFaces = (katexCss.match(/@font-face\{[^}]*\}/g) ?? []).map((rule) => ({
  rule,
  // Some family names are quoted.
  family: /font-family:"?([\w-]+)/.exec(rule)![1],
  italic: /font-style:italic/.test(rule),
  bold: /font-weight:700/.test(rule),
  file: /src:url\(fonts\/([\w-]+\.woff2)\)/.exec(rule)![1],
}));

/**
 * The file of the KaTeX face that shows text in `element`, from the classes
 * KaTeX's stylesheet picks fonts by, as the browser would match them.
 */
function katexFontFile(element: Element): string | undefined {
  const font: KatexFont = {};
  for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) {
    // Later rules win, so they're checked first.
    for (let i = katexFontRules.length - 1; i >= 0; i--) {
      const rule = katexFontRules[i];
      if (!ancestor.matches(rule.selector)) continue;
      font.family ??= rule.font.family;
      font.style ??= rule.font.style;
      font.weight ??= rule.font.weight;
    }
    if (font.family && font.style && font.weight) break;
  }
  const italic = font.style === 'italic';
  const bold = font.weight === '700' || font.weight === 'bold';
  const family = katexFaces.filter((face) => face.family === font.family);
  // Browsers match the style first, then the weight.
  const styled = family.some((face) => face.italic === italic) ? family.filter((face) => face.italic === italic) : family;
  return (styled.find((face) => face.bold === bold) ?? styled[0])?.file;
}

/**
 * The code points of `html`'s text, other than whitespace, by the role and
 * style they're shown in, or for maths, by `katex <file>`.
 */
function charactersByFace(html: string): Map<string, Set<number>> {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const characters = new Map<string, Set<number>>();
  const add = (key: string, text: string) => {
    let set = characters.get(key);
    for (const char of text) {
      if (/\s/.test(char)) continue;
      if (!set) characters.set(key, (set = new Set()));
      set.add(char.codePointAt(0)!);
    }
  };
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    // KaTeX's MathML copy is for screen readers and isn't shown.
    if (!parent || parent.closest('.katex-mathml')) continue;
    if (parent.closest('.katex')) {
      add(`katex ${katexFontFile(parent)}`, (node as Text).data);
      continue;
    }
    const role = parent.closest('code') ? 'code' : parent.closest('h1, h2, h3, h4, h5, h6') ? 'heading' : 'body';
    add(faceKey(role, parent.closest(italicSelector) !== null), (node as Text).data);
  }
  // KaTeX's stylesheet numbers equations as "(1)".
  const number = doc.querySelector('.katex .eqn-num');
  if (number) add(`katex ${katexFontFile(number)}`, '()0123456789');
  return characters;
}

let fontSubset: Promise<typeof import('./font-subset')> | undefined;

/** The subsetting module, loaded on the first export. */
function loadFontSubset() {
  fontSubset ??= import('./font-subset');
  return fontSubset;
}

/**
 * A data URL for the font file at `url`, cut down to `codePoints`, or
 * undefined if the font has none of them.
 */
async function subsetDataUrl(
  url: string,
  codePoints: Iterable<number>,
  axes?: Record<string, number>,
): Promise<string | undefined> {
  const [{ subsetFont }, response] = await Promise.all([loadFontSubset(), fetch(url)]);
  if (!response.ok) throw new Error(`Couldn't load ${url} (${response.status})`);
  const woff = await subsetFont(new Uint8Array(await response.arrayBuffer()), codePoints, axes);
  return woff && `data:font/woff;base64,${woff.toBase64()}`;
}

/** The URL of a font `file` among `urls`, keyed by path. */
function fontUrl(urls: Record<string, string>, file: string): string {
  const path = Object.keys(urls).find((key) => fileName(key) === file);
  if (!path) throw new Error(`Missing font ${file}`);
  return urls[path];
}

/** The @font-face rules, with embedded files, for the text fonts that `characters` need. */
async function textFontsCss(characters: Map<string, Set<number>>): Promise<string> {
  const rules = await Promise.all(
    faces.map(async (face) => {
      const inRange = [...(characters.get(faceKey(face.role, face.italic)) ?? [])].filter((code) =>
        face.ranges.some(([start, end]) => code >= start && code <= end),
      );
      if (inRange.length === 0) return '';
      const dataUrl = await subsetDataUrl(fontUrl(fontUrls, face.file), inRange, pinnedAxes[face.role]);
      return dataUrl ? face.css.replace(/src:[^;]*/, `src: url(${dataUrl}) format('woff')`) : '';
    }),
  );
  return rules.filter(Boolean).join('\n');
}

/**
 * KaTeX's stylesheet with the fonts that `characters` need embedded, and the
 * other @font-face rules left out.
 */
async function katexCssWithFonts(characters: Map<string, Set<number>>): Promise<string> {
  const embedded = await Promise.all(
    katexFaces.map(async ({ rule, file }) => {
      const codePoints = characters.get(`katex ${file}`);
      const dataUrl = codePoints && (await subsetDataUrl(fontUrl(katexFontUrls, file), codePoints));
      // Each @font-face lists WOFF2, WOFF and TTF files, replaced by the one subset.
      return dataUrl ? rule.replace(/src:[^;}]*/, `src:url(${dataUrl}) format("woff")`) : '';
    }),
  );
  return katexFaces.reduce((css, { rule }, i) => css.replace(rule, embedded[i]), katexCss);
}

/**
 * CSS with embedded fonts for sanitised document `html`: @font-face rules for
 * its text, and KaTeX's stylesheet if it has maths.
 */
export async function exportFontsCss(html: string): Promise<{ text: string; maths: string }> {
  const characters = charactersByFace(html);
  const hasMaths = html.includes('class="katex');
  const [text, maths] = await Promise.all([
    textFontsCss(characters),
    hasMaths ? katexCssWithFonts(characters) : '',
  ]);
  return { text, maths };
}
