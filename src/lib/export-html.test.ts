import { afterEach, describe, expect, test, vi } from 'vitest';
import { buildHtmlDocument, exportHtml } from './export-html';
import { markdown } from './markdown';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete window.showSaveFilePicker;
});

const parseDocument = (html: string) => new DOMParser().parseFromString(html, 'text/html');

describe('buildHtmlDocument', () => {
  test('builds a standalone, sanitised document titled after the document', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
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
    expect(css).not.toContain('@font-face');
    expect(fetch).not.toHaveBeenCalled();
  });

  test('embeds KaTeX styles and fonts when the document has maths', async () => {
    const fetch = vi.fn(async () => new Response(new Uint8Array([1, 2, 3])));
    vi.stubGlobal('fetch', fetch);
    const html = await buildHtmlDocument('Maths.md', 'Euler: $e^{i\\pi}$');

    expect(html).toContain('class="katex"');
    expect(html).toContain('.katex-display');
    expect(html).toContain('src:url(data:font/woff2;base64,AQID) format("woff2")');
    expect(html).not.toContain('url(fonts/');
    expect(fetch).toHaveBeenCalledTimes(20);
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
