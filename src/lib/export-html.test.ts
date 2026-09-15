import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { buildHtmlDocument, exportHtml } from './export-html';
import { type SubsetOptions, subsetFont } from './font-subset';
import { markdown } from './markdown';

// Subsetting is tested in font-subset.test.ts. Here a font's "subset" is its fetched bytes.
vi.mock('./font-subset', () => ({ subsetFont: vi.fn(async (bytes: Uint8Array) => bytes) }));

const fileName = (url: string) => url.slice(url.lastIndexOf('/') + 1);

/** A font file's bytes are its name. */
const fetch = vi.fn(async (url: string) => new Response(fileName(url)));

/** The names of the font files fetched, sorted. */
const fetchedFiles = () => fetch.mock.calls.map(([url]) => fileName(url)).sort();

/** The characters and subsetting options each font file was cut down with, by file name. */
function subsets(): Record<string, { text: string; options?: SubsetOptions }> {
  return Object.fromEntries(
    vi.mocked(subsetFont).mock.calls.map(([bytes, codePoints, options]) => [
      new TextDecoder().decode(bytes),
      { text: String.fromCodePoint(...codePoints), ...(options && Object.keys(options).length ? { options } : {}) },
    ]),
  );
}

beforeEach(() => {
  fetch.mockClear();
  // Back to the implementation in vi.mock.
  vi.mocked(subsetFont).mockReset();
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
    expect(css).toContain('.task-list-item-checkbox');
    // Only what the document needs: it has no code, and no maths for KaTeX's stylesheet.
    expect(css).not.toContain('.markdown pre');
    expect(css).not.toContain('.tok-string');
    expect(css).not.toContain('KaTeX_');
    const embedded = `data:font/woff;base64,${btoa('figtree-latin-wght-normal.woff2')}`;
    expect(css).toContain(`src: url(${embedded}) format('woff')`);
    expect(css).not.toContain('url(./files/');
    expect(subsets()).toEqual({
      'figtree-latin-wght-normal.woff2': { text: 'Helo' },
      'instrument-sans-latin-wdth-normal.woff2': { text: 'done', options: { pinnedAxes: { wdth: 96 } } },
    });
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
      'instrument-sans-latin-ext-wdth-normal.woff2',
      'instrument-sans-latin-wdth-normal.woff2',
      'jetbrains-mono-latin-wght-italic.woff2',
      'jetbrains-mono-latin-wght-normal.woff2',
    ]);
    expect(css.match(/@font-face/g)?.length).toBe(5 + 2);
    // Each face gets only the characters in its own unicode-range.
    expect(subsets()['instrument-sans-latin-ext-wdth-normal.woff2'].text).toBe('Łź');
    expect(subsets()['instrument-sans-latin-wdth-normal.woff2'].text).toBe('Plainód');
    expect(subsets()['jetbrains-mono-latin-wght-italic.woff2'].text).toBe('/coment');
  });

  test('leaves out a face whose font has none of its characters', async () => {
    vi.mocked(subsetFont).mockResolvedValueOnce(undefined);
    const css = parseDocument(await buildHtmlDocument('Text.md', 'Text')).querySelector('style')?.textContent;
    expect(fetchedFiles()).toEqual(['instrument-sans-latin-wdth-normal.woff2']);
    expect(css).not.toContain('data:font/woff');
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

  test('embeds KaTeX styles and the fonts its maths is shown in', async () => {
    const html = await buildHtmlDocument('Maths.md', 'Euler: $$\\mathbf{x} + \\sum e^{i\\pi}$$');

    expect(html).toContain('class="katex"');
    expect(html).toContain('.katex-display');
    expect(html).not.toContain('url(fonts/');
    // Only the characters shown count, not those in the MathML copy for screen readers.
    const { 'instrument-sans-latin-wdth-normal.woff2': _, ...maths } = subsets();
    expect(maths).toEqual({
      'KaTeX_Main-Bold.woff2': { text: 'x' },
      'KaTeX_Main-Regular.woff2': { text: '+' },
      'KaTeX_Math-Italic.woff2': { text: 'eiπ' },
      // The display sum is the larger of KaTeX's sizes.
      'KaTeX_Size2-Regular.woff2': { text: '∑' },
    });
    const embedded = [...html.matchAll(/@font-face \{[^}]*\}/g)]
      .filter(([rule]) => rule.includes('KaTeX_'))
      .map(([rule]) => /url\(data:font\/woff;base64,([^)]+)\)/.exec(rule)?.[1]);
    expect(embedded).toEqual(
      ['KaTeX_Main-Bold.woff2', 'KaTeX_Main-Regular.woff2', 'KaTeX_Math-Italic.woff2', 'KaTeX_Size2-Regular.woff2'].map(btoa),
    );
  });

  test('leaves out a KaTeX font without the characters', async () => {
    vi.mocked(subsetFont).mockImplementation(async (bytes) =>
      new TextDecoder().decode(bytes).startsWith('KaTeX_') ? undefined : bytes,
    );
    const html = await buildHtmlDocument('Maths.md', '$x$');
    expect(html).not.toMatch(/@font-face \{[^}]*KaTeX/);
    expect(html).toContain('.katex .mathnormal');
  });

  test('waits for code languages to load and highlights the code', async () => {
    const html = await buildHtmlDocument('Code.md', '```go\nconst x = "s"\n```');
    expect(html).toMatch(/<span class="tok-string">"s"<\/span>/);
  });

  test('keeps only the highlighting the theme colours', async () => {
    const html = await buildHtmlDocument('Code.md', '```js\nlet value = 1;\n```');
    const code = parseDocument(html).querySelector('pre code')!;

    // `let` and `value` are marked up by the highlighter, but the theme leaves them plain.
    expect(code.textContent).toBe('let value = 1;\n');
    expect([...code.querySelectorAll('span')].map((span) => `${span.className}:${span.textContent}`)).toEqual([
      'tok-variableDef:value',
      'tok-number:1',
      'tok-punctuation:;',
    ]);
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

  test('lets the browser paint after onBuild, before rendering', async () => {
    const handle = { name: 'Notes.html', createWritable: async () => ({ write: async () => {}, close: async () => {} }) };
    window.showSaveFilePicker = vi.fn(async () => handle as unknown as FileSystemFileHandle);
    const events: string[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      events.push('frame');
      callback(0);
      return 0;
    });
    const parse = markdown.parse.bind(markdown);
    vi.spyOn(markdown, 'parse').mockImplementation((...args) => {
      events.push('render');
      return parse(...args);
    });

    await exportHtml('Notes.md', '# Notes', { onBuild: () => events.push('build') });
    expect(events.slice(0, 3)).toEqual(['build', 'frame', 'render']);
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
