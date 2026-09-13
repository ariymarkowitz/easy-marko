// Exports a document as a standalone HTML file: the rendered, sanitised
// markdown with the CSS it needs inlined, so it looks like the preview in any
// browser, offline, in the colour scheme it was exported in.

import katexCss from 'katex/dist/katex.min.css?raw';
import syntaxCss from '../styles/editor.css?raw';
import markdownCss from '../styles/markdown.css?raw';
import tokensCss from '../styles/tokens.css?raw';
import { escapeHtml } from './escape-html';
import { htmlFile, saveFile } from './files';
import { embedLocalImages } from './local-images';
import { createMarkdownRenderer } from './markdown';

/** URLs of KaTeX's WOFF2 fonts, keyed by path. Embedded only in documents with maths. */
const katexFontUrls = import.meta.glob<string>('/node_modules/katex/dist/fonts/*.woff2', {
  query: '?url',
  import: 'default',
  eager: true,
  // Globs skip node_modules unless told otherwise.
  exhaustive: true,
});

// The parts of base.css that the preview's typography relies on.
const documentCss = `
*, *::before, *::after {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: var(--font-sans);
  color: var(--color-text);
  background-color: var(--color-bg);
  -webkit-font-smoothing: antialiased;
}

.markdown > :first-child {
  margin-top: 0;
}

.markdown > :is(h1, h2, h3, h4, h5, h6):first-child {
  margin-top: var(--md-heading-margin-first);
}
`;

/** The document's name without its markdown extension. */
function baseName(name: string): string {
  return name.replace(/\.(md|markdown|mdown|txt)$/i, '') || name;
}

/** Sanitised HTML for the whole document, once the languages of its code have loaded. */
async function renderMarkdown(source: string): Promise<string> {
  const loads: Promise<void>[] = [];
  const render = createMarkdownRenderer({ onLanguageLoad: (loaded) => loads.push(loaded) });
  const html = () =>
    render(source)
      .map((block) => block.html)
      .join('');
  const unhighlighted = html();
  if (loads.length === 0) return unhighlighted;
  await Promise.all(loads);
  return html();
}

async function fetchDataUrl(url: string, type: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Couldn't load ${url} (${response.status})`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = '';
  // In chunks: spreading a whole font into one call can overflow the stack.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:${type};base64,${btoa(binary)}`;
}

/** KaTeX's stylesheet with its fonts embedded, so maths renders offline. */
async function katexCssWithFonts(): Promise<string> {
  const fonts = new Map(
    await Promise.all(
      Object.entries(katexFontUrls).map(
        async ([path, url]) => [path.slice(path.lastIndexOf('/') + 1), await fetchDataUrl(url, 'font/woff2')] as const,
      ),
    ),
  );
  // Each @font-face lists WOFF2, WOFF and TTF files. Browsers that can show
  // the rest of the page all read WOFF2, so only that one is embedded.
  return katexCss.replace(/src:url\(fonts\/([\w-]+\.woff2)\)[^;}]*/g, (_, file: string) => {
    const dataUrl = fonts.get(file);
    if (!dataUrl) throw new Error(`Missing KaTeX font ${file}`);
    return `src:url(${dataUrl}) format("woff2")`;
  });
}

export interface ExportOptions {
  /** Reads an image with a relative path as a data URL to embed, or gives undefined to leave it as written. */
  readImage?: (src: string) => Promise<string | undefined>;
  /** The colour scheme to show the document in. Without one, it follows prefers-color-scheme. */
  colorScheme?: 'light' | 'dark';
}

/** A standalone HTML document for markdown `source`, titled after the document's `name`. */
export async function buildHtmlDocument(
  name: string,
  source: string,
  { readImage, colorScheme }: ExportOptions = {},
): Promise<string> {
  const rendered = await renderMarkdown(source);
  const body = readImage ? await embedLocalImages(rendered, readImage) : rendered;
  const hasMaths = body.includes('class="katex');
  const css = [documentCss, tokensCss, syntaxCss, markdownCss, hasMaths ? await katexCssWithFonts() : '']
    .join('\n')
    .trim();
  return `<!doctype html>
<html lang="en"${colorScheme ? ` data-theme="${colorScheme}"` : ''}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="${colorScheme ?? 'light dark'}">
<title>${escapeHtml(baseName(name))}</title>
<style>
${css}
</style>
</head>
<body>
<article class="markdown">
${body}</article>
</body>
</html>
`;
}

/**
 * Saves a document as `<name>.html`. The HTML is built once a destination is
 * chosen, so the save dialog opens straight from the click, and nothing is
 * built if it's cancelled.
 */
export async function exportHtml(name: string, source: string, options: ExportOptions = {}): Promise<void> {
  await saveFile(`${baseName(name)}.html`, () => buildHtmlDocument(name, source, options), { type: htmlFile });
}
