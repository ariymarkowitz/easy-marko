import { afterEach, describe, expect, test, vi } from 'vitest';
import { createMarkdownRenderer, markdown } from './markdown';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createMarkdownRenderer', () => {
  test('splits top-level blocks and records their source line', () => {
    const blocks = createMarkdownRenderer()('# Title\n\nSome *text*\n\n- a\n- b\n');
    expect(blocks.map((block) => [block.line, block.endLine])).toEqual([
      [0, 1],
      [2, 3],
      [4, 6],
    ]);
    expect(blocks[0].html).toContain('<h1>Title</h1>');
    expect(blocks[1].html).toContain('<em>text</em>');
    expect(blocks[2].html).toContain('<ul>');
  });

  test('renders inline and display maths with KaTeX', () => {
    const [inline, display] = createMarkdownRenderer()('Euler: $e^{i\\pi}$\n\n$$\nx^2\n$$\n');
    expect(inline.html).toContain('class="katex"');
    expect(display.html).toContain('katex-display');
  });

  test.each([
    ['text follows the closing $', '$x$text'],
    ['punctuation follows the closing $', '$x$.'],
    ['text precedes the opening $', 'text$x$'],
  ])('renders inline maths when %s', (_, source) => {
    expect(createMarkdownRenderer()(source)[0].html).toContain('class="katex"');
  });

  test.each([
    ['dollar amounts', 'costs $5 and $10'],
    ['a space after the opening $', '$ x$'],
    ['a space before the closing $', '$x $'],
    ['a digit after the closing $', '$5$10'],
    ['escaped dollars', '\\$x\\$'],
  ])('leaves %s as text', (_, source) => {
    expect(createMarkdownRenderer()(source)[0].html).not.toContain('katex');
  });

  test('only re-renders blocks whose source changed', () => {
    const render = createMarkdownRenderer();
    render('# Heading\n\nFirst');
    const spy = vi.spyOn(markdown.renderer, 'render');
    const blocks = render('# Heading\n\nSecond');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(blocks[1].html).toContain('Second');
  });

  test('re-renders everything when reference definitions change', () => {
    const render = createMarkdownRenderer();
    render('[link][a]\n\n[a]: https://one.example');
    const blocks = render('[link][a]\n\n[a]: https://two.example');
    expect(blocks[0].html).toContain('https://two.example');
  });

  test('gives repeated blocks distinct keys', () => {
    const keys = createMarkdownRenderer()('same\n\nsame\n\nsame').map((block) => block.key);
    expect(new Set(keys).size).toBe(3);
  });

  test('opens external links in a new tab but keeps fragment links in place', () => {
    const [block] = createMarkdownRenderer()('[out](https://example.com) [in](#top)');
    expect(block.html).toContain('href="https://example.com" target="_blank"');
    expect(block.html).toContain('<a href="#top">');
  });
});

describe('task lists', () => {
  const render = (source: string) =>
    parse(
      createMarkdownRenderer()(source)
        .map((block) => block.html)
        .join(''),
    );

  test('renders read-only checkboxes for [ ] and [x] items', () => {
    const root = render('- [ ] todo\n- [x] done\n- [X] also done\n- plain\n');
    const items = root.querySelectorAll('li');
    const checkboxes = root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    expect(checkboxes).toHaveLength(3);
    expect([...checkboxes].map((box) => box.checked)).toEqual([false, true, true]);
    expect([...checkboxes].every((box) => box.disabled)).toBe(true);
    expect(items[0]).toHaveClass('task-list-item');
    expect(items[0]).toHaveTextContent(/^todo$/);
    expect(items[3]).not.toHaveClass('task-list-item');
  });

  test('works in ordered, loose and nested lists', () => {
    const root = render('1. [x] first\n\n2. [ ] second\n   - [x] nested\n');
    expect(root.querySelectorAll('.task-list-item')).toHaveLength(3);
    expect(root.querySelector('ol > li > p > input')).toBeChecked();
  });

  test.each([
    ['an escaped marker', '- \\[ ] text'],
    ['a marker without text', '- [ ]'],
    ['a marker outside a list', '[x] text'],
    ['a marker later in the item', '- text [x] text'],
  ])('leaves %s as text', (_, source) => {
    expect(render(source).querySelector('input')).toBeNull();
  });
});

/** Parses rendered HTML the way the preview's innerHTML does. */
function parse(html: string): HTMLElement {
  const container = document.createElement('div');
  container.innerHTML = html;
  return container;
}

describe('raw HTML', () => {
  test('renders HTML blocks and inline HTML with their source lines', () => {
    const blocks = createMarkdownRenderer()(
      '<div align="center">\n<b>Bold</b>\n</div>\n\nPress <kbd>Ctrl</kbd>\n',
    );
    expect(blocks.map((block) => [block.line, block.endLine])).toEqual([
      [0, 3],
      [4, 5],
    ]);
    expect(blocks[0].html).toBe('<div align="center">\n<b>Bold</b>\n</div>\n');
    expect(blocks[1].html).toBe('<p>Press <kbd>Ctrl</kbd></p>\n');
  });

  test('keeps markdown between an opening and closing HTML block in one block', () => {
    const blocks = createMarkdownRenderer()(
      '<details>\n<summary>More</summary>\n\nHidden *text*\n\n</details>\n\nAfter\n',
    );
    expect(blocks.map((block) => [block.line, block.endLine])).toEqual([
      [0, 6],
      [7, 8],
    ]);
    expect(parse(blocks[0].html).querySelector('details em')).toHaveTextContent('text');
  });

  test('leaves an unclosed HTML block on its own when nothing closes it', () => {
    const blocks = createMarkdownRenderer()('<div>\nopen\n\nParagraph\n');
    expect(blocks).toHaveLength(2);
  });

  test('opens raw HTML links in a new tab', () => {
    const [block] = createMarkdownRenderer()('<a href="https://example.com">out</a>');
    expect(parse(block.html).querySelector('a')).toHaveAttribute('rel', 'noopener noreferrer');
  });

  test.each([
    ['a script block', '<script>alert(1)</script>'],
    ['an inline script', 'text <script>alert(1)</script>'],
    ['an event handler', '<img src="x" onerror="alert(1)">'],
    ['an inline event handler', 'text <b onmouseover="alert(1)">b</b>'],
    ['a javascript: link in HTML', '<a href="javascript:alert(1)">x</a>'],
    ['an obfuscated javascript: link', '<a href="jav&#x09;ascript:alert(1)">x</a>'],
    ['a javascript: markdown link', '[x](javascript:alert(1))'],
    ['a javascript: markdown image', '![x](javascript:alert(1))'],
    ['a data: HTML link', '<a href="data:text/html,<script>alert(1)</script>">x</a>'],
    ['an SVG script', '<svg><script>alert(1)</script></svg>'],
    ['an SVG onload', '<svg onload="alert(1)"></svg>'],
    ['an iframe', '<iframe src="https://example.com"></iframe>'],
    ['an object', '<object data="https://example.com/x.swf"></object>'],
    ['a details ontoggle', '<details open ontoggle="alert(1)">x</details>'],
    ['MathML namespace confusion', '<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>'],
    ['a style element', '<style>body { display: none }</style>'],
    ['a form', '<form action="https://example.com"><button>Go</button></form>'],
    ['a meta refresh', '<meta http-equiv="refresh" content="0;url=https://example.com">'],
  ])('removes %s', (_, source) => {
    const html = createMarkdownRenderer()(source)
      .map((block) => block.html)
      .join('');
    const root = parse(html);
    expect(root.querySelector('script, iframe, object, style, form, meta')).toBeNull();
    for (const element of root.querySelectorAll('*')) {
      for (const { name, value } of element.attributes) {
        expect(name).not.toMatch(/^on/i);
        // Browsers ignore spaces and control characters inside a URL scheme.
        const url = [...value].filter((char) => char.charCodeAt(0) > 0x20).join('');
        expect(url).not.toMatch(/^(javascript|data:text\/html)/i);
      }
    }
  });

  test('keeps KaTeX markup: MathML, inline styles and SVG', () => {
    const [block] = createMarkdownRenderer()('$\\sqrt{x^2}$');
    const root = parse(block.html);
    expect(root.querySelector('math semantics annotation')).toHaveTextContent('\\sqrt{x^2}');
    expect(root.querySelector('.katex-html [style]')).not.toBeNull();
    expect(root.querySelector('.katex-html svg path')).not.toBeNull();
  });
});
