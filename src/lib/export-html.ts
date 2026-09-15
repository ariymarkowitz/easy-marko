// Exports a document as a standalone HTML file: the rendered, sanitised
// Markdown with the CSS it needs inlined, so it looks like the preview in any
// browser, offline, in the colour scheme it was exported in.

import appColorsCss from 'virtual:app-colors.css?raw';
import syntaxCss from '../styles/editor.css?raw';
import fallbackFontsCss from '../styles/fonts.css?raw';
import markdownCss from '../styles/markdown.css?raw';
import tokensCss from '../styles/tokens.css?raw';
import { escapeHtml } from './escape-html';
import { exportFontsCss } from './export-fonts';
import { htmlFile, saveFile } from './files';
import { embedLocalImages } from './local-images';
import { createMarkdownRenderer } from './markdown';

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

/** The document's name without its Markdown extension. */
function baseName(name: string): string {
  return name.replace(/\.(md|markdown|mdown|txt)$/i, '') || name;
}

/** Sanitised HTML for the whole document, once the languages of its code have loaded. */
async function renderMarkdown(source: string): Promise<string> {
  const loads: Promise<void>[] = [];
  const renderer = createMarkdownRenderer({ onLanguageLoad: (loaded) => loads.push(loaded) });
  const render = () =>
    renderer(source)
      .map((block) => block.html)
      .join('');
  const html = render();
  if (loads.length === 0) return html;
  await Promise.all(loads);
  return render();
}

export interface ExportOptions {
  /** Reads an image with a relative path as a data URL to embed, or gives undefined to leave it as written. */
  readImage?: (src: string) => Promise<string | undefined>;
  /** The colour scheme to show the document in. Without one, it follows prefers-color-scheme. */
  colorScheme?: 'light' | 'dark';
}

/** A standalone HTML document for Markdown `source`, titled after the document's `name`. */
export async function buildHtmlDocument(
  name: string,
  source: string,
  { readImage, colorScheme }: ExportOptions = {},
): Promise<string> {
  const rendered = await renderMarkdown(source);
  const body = readImage ? await embedLocalImages(rendered, readImage) : rendered;
  const fonts = await exportFontsCss(body);
  const css = [documentCss, appColorsCss, tokensCss, fallbackFontsCss, fonts.text, syntaxCss, markdownCss, fonts.maths]
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
 * Resolves once the browser has painted, so changes made before it show
 * before synchronous work starts. A hidden page doesn't paint, so it resolves
 * straight away.
 */
function afterNextPaint(): Promise<void> {
  if (document.visibilityState === 'hidden') return Promise.resolve();
  // Frame callbacks run just before painting, so a task queued from one runs after it.
  return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve)));
}

/**
 * Saves a document as `<name>.html`. The HTML is built once a destination is
 * chosen, so the save dialog opens straight from the click, and nothing is
 * built if it's cancelled. `onBuild` is called when building starts, and the
 * browser paints what it changes before the document renders, which blocks
 * the page for a moment.
 */
export async function exportHtml(
  name: string,
  source: string,
  { onBuild, ...options }: ExportOptions & { onBuild?: () => void } = {},
): Promise<void> {
  const build = async () => {
    onBuild?.();
    await afterNextPaint();
    return buildHtmlDocument(name, source, options);
  };
  await saveFile(`${baseName(name)}.html`, build, { type: htmlFile });
}
