import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { buildHtmlDocument, exportHtml } from './export-html';
import { markdown } from './markdown';

const fetch = vi.fn(async (_url: string) => new Response(new Uint8Array([1, 2, 3])));

/** The names of the font files fetched, sorted. */
const fetchedFiles = () => fetch.mock.calls.map(([url]) => url.slice(url.lastIndexOf('/') + 1)).sort();

beforeEach(() => {
  fetch.mockClear();
  vi.stubGlobal('fetch', fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete window.showSaveFilePicker;
});

const parseDocument = (html: string) => new DOMParser().parseFromString(html, 'text/html');

describe('buildHtmlDocument', () => {
  test('builds a standalone, sanitised document titled after the document', async () => {
    const html = await buildHtmlDocument(
      '<Notes> & more.md',
      '# Hello\n\n<script>alert(1)</script>\n\n- [x] done\n',
    );
    const doc = parseDocument(html);

    // Plain property checks: jest-dom's matchers reject elements from a DOMParser document.
    expect(html).toMatch(/^<!doctype html>/);
    expect(doc.title).toBe('<Notes> & more');
    expect(doc.querySelector('meta[name="color-scheme"]')?.getAttribute('content')).toBe('light dark');
    expect(doc.querySelector('article.markdown > h1')?.textContent).toBe('Hello');
    expect(doc.querySelector<HTMLInputElement>('.task-list-item-checkbox')?.checked).toBe(true);
    expect(doc.querySelector('script')).toBeNull();

    const css = doc.querySelector('style')?.textContent ?? '';
    expect(css).toContain('light-dark(');
    expect(css).toContain('.markdown pre');
    expect(css).toContain('.tok-keyword');
    // The preview CSS styles .katex-display, but KaTeX's own stylesheet and fonts stay out.
    expect(css).not.toContain('KaTeX_');
    expect(css).toContain("src: url(data:font/woff2;base64,AQID) format('woff2-variations')");
    expect(css).not.toContain('url(./files/');
    expect(fetchedFiles()).toEqual(['figtree-latin-wght-normal.woff2', 'instrument-sans-latin-wdth-normal.woff2']);
  });

  test('embeds only the font faces and subsets the document shows', async () => {
    const html = await buildHtmlDocument(
      'Fonts.md',
      ['# *Ść*', '', 'Plain `code`', '', '```js', '// comment', '```', '', 'Łódź'].join('\n'),
    );
    const css = parseDocument(html).querySelector('style')?.textContent ?? '';

    // The heading's italic text is all in the Latin Extended subset.
    expect(fetchedFiles()).toEqual([
      'figtree-latin-ext-wght-italic.woff2',
      'google-sans-code-latin-wght-italic.woff2',
      'google-sans-code-latin-wght-normal.woff2',
      'instrument-sans-latin-ext-wdth-normal.woff2',
      'instrument-sans-latin-wdth-normal.woff2',
    ]);
    expect(css.match(/@font-face/g)?.length).toBe(5 + 2);
  });

  test('leaves out fonts for whitespace and maths', async () => {
    await buildHtmlDocument('Empty.md', '$x$\n\n<p> </p>');
    expect(fetchedFiles().filter((file) => !file.startsWith('KaTeX_'))).toEqual([]);
  });

  test('fixes the colour scheme when given one', async () => {
    const doc = parseDocument(await buildHtmlDocument('Dark.md', '# Dark', { colorScheme: 'dark' }));
    expect(doc.documentElement.dataset.theme).toBe('dark');
    expect(doc.querySelector('meta[name="color-scheme"]')?.getAttribute('content')).toBe('dark');
    expect(doc.querySelector('style')?.textContent).toContain(":root[data-theme='dark']");
  });

  test('embeds KaTeX styles and fonts when the document has maths', async () => {
    const html = await buildHtmlDocument('Maths.md', 'Euler: $e^{i\\pi}$');

    expect(html).toContain('class="katex"');
    expect(html).toContain('.katex-display');
    expect(html).toContain('src:url(data:font/woff2;base64,AQID) format("woff2")');
    expect(html).not.toContain('url(fonts/');
    // KaTeX's 20 fonts and the body font.
    expect(fetch).toHaveBeenCalledTimes(21);
  });

  test('waits for code languages to load and highlights the code', async () => {
    const html = await buildHtmlDocument('Code.md', '```go\npackage main\n```');
    expect(html).toMatch(/<span class="tok-[\w ]+">package<\/span>/);
  });
});

describe('exportHtml', () => {
  test('saves <name>.html through the save dialog', async () => {
    let written = '';
    const handle = {
      name: 'Notes.html',
      createWritable: async () => ({
        write: async (text: string) => {
          written = text;
        },
        close: async () => {},
      }),
    };
    const picker = vi.fn(async () => handle as unknown as FileSystemFileHandle);
    window.showSaveFilePicker = picker;

    await exportHtml('Notes.md', '# Notes');
    expect(picker).toHaveBeenCalledWith({
      suggestedName: 'Notes.html',
      types: [{ description: 'HTML', accept: { 'text/html': ['.html'] } }],
    });
    expect(written).toContain('<h1 id="notes">Notes</h1>');
  });

  test("doesn't render anything when the save dialog is cancelled", async () => {
    window.showSaveFilePicker = vi.fn(async () => {
      throw new DOMException('Cancelled', 'AbortError');
    });
    const spy = vi.spyOn(markdown, 'parse');
    await exportHtml('Notes.md', '# Notes');
    expect(spy).not.toHaveBeenCalled();
  });
});
