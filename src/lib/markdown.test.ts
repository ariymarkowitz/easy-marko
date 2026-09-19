import { afterEach, describe, expect, test, vi } from 'vitest';
import { createMarkdownRenderer, markdown, type RenderedBlock } from './markdown';
import { sanitizeHtml } from './sanitize';

afterEach(() => {
  vi.restoreAllMocks();
});

const joined = (blocks: RenderedBlock[]) => blocks.map((block) => block.html).join('');

/** Parses rendered HTML the way the preview's innerHTML does. */
function parse(html: string | Promise<string>): HTMLElement {
  if (typeof html !== 'string') throw new Error('The HTML is waiting for a code language');
  const container = document.createElement('div');
  container.innerHTML = html;
  return container;
}

describe('createMarkdownRenderer', () => {
  test('splits top-level blocks and records their source line', () => {
    const blocks = createMarkdownRenderer()('# Title\n\nSome *text*\n\n- a\n- b\n');
    expect(blocks.map((block) => [block.line, block.endLine])).toEqual([
      [0, 1],
      [2, 3],
      [4, 6],
    ]);
    expect(blocks[0].html).toContain('<h1 id="title">Title</h1>');
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

describe('incremental parsing', () => {
  const source = [
    '# A "quoted" title',
    '',
    'Some *text* -- with (c) and https://example.com',
    '',
    '- [x] a task',
    '- a [reference link][ref]',
    '',
    '| a | b |',
    '| - | - |',
    '| 1 | 2 |',
    '',
    '> A quote with $x^2$',
    '',
    '$$',
    'y',
    '$$',
    '',
    '<details>',
    '<summary>Summary</summary>',
    '',
    'Inside',
    '',
    '</details>',
    '',
    '```',
    'code',
    '```',
    '',
    '[ref]: https://example.com/ref',
    '',
  ].join('\n');

  test('renders the same HTML as markdown-it, with heading ids', () => {
    const full = sanitizeHtml(markdown.render(source)).replace('<h1>', '<h1 id="a-quoted-title">');
    expect(joined(createMarkdownRenderer()(source))).toBe(full);
  });

  test('renders the same HTML as a full render after an edit', () => {
    const render = createMarkdownRenderer();
    render(source);
    const edited = source.replace('Some *text*', 'Some **edited** "text"').replace('A quote', 'A new quote');
    expect(joined(render(edited))).toBe(joined(createMarkdownRenderer()(edited)));
  });

  test("doesn't parse the inline content of unchanged blocks", () => {
    const render = createMarkdownRenderer();
    render('# Heading\n\nFirst *paragraph*\n\n- item\n');
    const spy = vi.spyOn(markdown.inline, 'parse');
    render('# Heading\n\nSecond *paragraph*\n\n- item\n');
    expect(spy.mock.calls.map(([content]) => content)).toEqual(['Second *paragraph*']);
  });

  test('parses every block again when reference definitions change', () => {
    const render = createMarkdownRenderer();
    render('# Heading\n\n[link][a]\n\n[a]: https://one.example');
    const spy = vi.spyOn(markdown.inline, 'parse');
    render('# Heading\n\n[link][a]\n\n[a]: https://two.example');
    expect(spy.mock.calls.map(([content]) => content)).toEqual(['Heading', '[link][a]']);
  });

  test('renders copies of a block once when they have the same ids', () => {
    const spy = vi.spyOn(markdown.renderer, 'render');
    const blocks = createMarkdownRenderer()('Same\n\nSame\n\n# Title\n\n# Title\n\nSame\n');
    expect(blocks.map((block) => block.html)).toEqual([
      '<p>Same</p>\n',
      '<p>Same</p>\n',
      '<h1 id="title">Title</h1>\n',
      '<h1 id="title-1">Title</h1>\n',
      '<p>Same</p>\n',
    ]);
    expect(spy).toHaveBeenCalledTimes(3);
  });

  test('renders copies of a heading with their ids after an edit renumbers them', () => {
    const render = createMarkdownRenderer();
    render('# A\n\n# A\n\n# A\n');
    expect(joined(render('# A\n\nText\n\n# A\n\n# A\n\n# A\n'))).toBe(
      '<h1 id="a">A</h1>\n<p>Text</p>\n<h1 id="a-1">A</h1>\n<h1 id="a-2">A</h1>\n<h1 id="a-3">A</h1>\n',
    );
  });

  test('re-renders a block repeated many times in linear time', () => {
    const render = createMarkdownRenderer();
    const source = 'Text\n\n'.repeat(5_000);
    render(source);
    const start = performance.now();
    render(`${source}x`);
    // Keeping an output for every copy takes over a second.
    expect(performance.now() - start).toBeLessThan(300);
  });
});

describe('code highlighting', () => {
  // Languages stay loaded for the whole test run, so each test uses its own.
  test('renders a block once the language of its code loads, and keeps it for later renders', async () => {
    const render = createMarkdownRenderer();
    const source = '# Title\n\n```python\nimport os\n```\n';

    const [title, code] = render(source);
    expect(title.html).toBe('<h1 id="title">Title</h1>\n');
    expect(code.html).toBeInstanceOf(Promise);
    const html = await code.html;
    expect(html).toContain('<span class="tok-keyword">import</span>');

    const spy = vi.spyOn(markdown.renderer, 'render');
    expect(render(source)[1].html).toBe(html);
    expect(spy).not.toHaveBeenCalled();
  });

  test('renders the footnotes list once the languages of its notes load', async () => {
    const blocks = createMarkdownRenderer()('Text[^1]\n\n[^1]: Note\n\n    ```go\n    package main\n    ```\n');
    const list = blocks.at(-1)!;
    expect(list.key).toBe('\0footnotes');
    expect(await list.html).toContain('<span class="tok-keyword">package</span>');
  });

  test('escapes highlighted code', async () => {
    const [block] = createMarkdownRenderer()('```ruby\nputs "<b>&</b>"\n```');
    const html = await block.html;
    expect(html).toContain('tok-');
    expect(parse(html).querySelector('b')).toBeNull();
    expect(parse(html)).toHaveTextContent('puts "<b>&</b>"');
  });

  test('leaves code in unknown languages as plain text', () => {
    const [block] = createMarkdownRenderer()('```not-a-language\n<b>x</b>\n```');
    expect(block.html).toBe('<pre tabindex="0"><code class="language-not-a-language">&lt;b&gt;x&lt;/b&gt;\n</code></pre>\n');
  });
});

describe('task lists', () => {
  const render = (source: string) => parse(joined(createMarkdownRenderer()(source)));

  test('renders read-only checkboxes for [ ] and [x] items', () => {
    const root = render('- [ ] todo\n- [x] done\n- [X] also done\n- plain\n');
    const items = root.querySelectorAll('li');
    const checkboxes = root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    expect(checkboxes).toHaveLength(3);
    expect([...checkboxes].map((box) => box.checked)).toEqual([false, true, true]);
    expect([...checkboxes].every((box) => box.disabled)).toBe(true);
    expect(items[0]).toHaveClass('task-list-item');
    expect(items[0]).toHaveTextContent(/^todo$/);
    expect(checkboxes[0].labels?.[0]).toHaveTextContent(/^todo$/);
    expect(items[3]).not.toHaveClass('task-list-item');
  });

  test.each([
    ['nothing after it', '- [ ]'],
    ['a trailing space', '- [ ] '],
    ['a checked marker', '- [x]'],
  ])('renders a checkbox with no text for a marker with %s', (_, source) => {
    const item = render(source).querySelector('li');
    expect(item?.querySelector('input[type="checkbox"]')).not.toBeNull();
    expect(item).toHaveTextContent(/^$/);
  });

  test('leaves a marker followed by other text as text', () => {
    expect(render('- [ ]x').querySelector('input')).toBeNull();
  });

  test('works in ordered, loose and nested lists', () => {
    const root = render('1. [x] first\n\n2. [ ] second\n   - [x] nested\n');
    expect(root.querySelectorAll('.task-list-item')).toHaveLength(3);
    expect(root.querySelector('ol > li > p > label > input')).toBeChecked();
  });

  test.each([
    ['an escaped marker', '- \\[ ] text'],
    ['a marker outside a list', '[x] text'],
    ['a marker later in the item', '- text [x] text'],
  ])('leaves %s as text', (_, source) => {
    expect(render(source).querySelector('input')).toBeNull();
  });
});

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

  test('keeps Markdown between an opening and closing HTML block in one block', () => {
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

  test('merges up to the block that closes the outermost element', () => {
    const blocks = createMarkdownRenderer()('<div>\n\nA\n\n<div>\n\nB\n\n</div>\n\nC\n\n</div>\n\nD\n');
    expect(blocks.map((block) => [block.line, block.endLine])).toEqual([
      [0, 13],
      [14, 15],
    ]);
  });

  test('merges an unclosed block with nothing, and a later block with the block that closes it', () => {
    const blocks = createMarkdownRenderer()('<div>\n\nA\n\n<div>\n\nB\n\n</div>\n');
    expect(blocks.map((block) => [block.line, block.endLine])).toEqual([
      [0, 1],
      [2, 3],
      [4, 9],
    ]);
  });

  test('ignores tags in comments and > in quoted attributes', () => {
    const blocks = createMarkdownRenderer()('<div title="a>b"><!-- <div> -->\n\nA\n\n</div>\n\nB\n');
    expect(blocks.map((block) => [block.line, block.endLine])).toEqual([
      [0, 5],
      [6, 7],
    ]);
  });

  test.each([
    ['a tag', '<div ' + '<a'.repeat(100_000)],
    ['a quote', '<div ' + '<a "'.repeat(50_000)],
    ['a comment', '<div>' + '<!--'.repeat(50_000)],
  ])('splits blocks in linear time with unclosed %s', (_, source) => {
    const start = performance.now();
    createMarkdownRenderer()(source);
    // Quadratic splitting takes minutes on these.
    expect(performance.now() - start).toBeLessThan(3000);
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
    ['a javascript: Markdown link', '[x](javascript:alert(1))'],
    ['a javascript: Markdown image', '![x](javascript:alert(1))'],
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
    const root = parse(joined(createMarkdownRenderer()(source)));
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

describe('heading anchors', () => {
  const render = (source: string) => parse(joined(createMarkdownRenderer()(source)));
  const ids = (root: HTMLElement) => [...root.querySelectorAll('h1, h2, h3, h4, h5, h6')].map((heading) => heading.id);

  test('gives headings GitHub-style ids from their text', () => {
    const root = render('# Getting *started*\n\n## Use `npm` & $x$\n\nSetext\n---\n\n> ### Quoted\n');
    expect(ids(root)).toEqual(['getting-started', 'use-npm--x', 'setext', 'quoted']);
  });

  test('numbers repeated headings', () => {
    expect(ids(render('# Notes\n\n## Notes\n\n### Notes'))).toEqual(['notes', 'notes-1', 'notes-2']);
  });

  test('keeps ids that name document properties', () => {
    expect(ids(render('# Title\n\n## Links\n\n## Cookie'))).toEqual(['title', 'links', 'cookie']);
  });

  test('leaves a heading with no slug without an id', () => {
    expect(render('# ?!').querySelector('h1')).not.toHaveAttribute('id');
  });

  test('updates later ids when an earlier heading is added, without reparsing unchanged blocks', () => {
    const renderer = createMarkdownRenderer();
    renderer('Intro\n\n# Notes\n\nText');
    const spy = vi.spyOn(markdown.inline, 'parse');
    const edited = '# Notes\n\nIntro\n\n# Notes\n\nText';
    const html = joined(renderer(edited));
    // The new heading reuses the cached `# Notes`, so only the one whose id changed is parsed.
    expect(spy.mock.calls.map(([content]) => content)).toEqual(['Notes']);
    expect(ids(parse(html))).toEqual(['notes', 'notes-1']);
    expect(html).toBe(joined(createMarkdownRenderer()(edited)));
  });

  test('reuses repeated blocks with different ids', () => {
    const renderer = createMarkdownRenderer();
    const source = '# Notes\n\nText\n\n# Notes';
    renderer(source);
    const spy = vi.spyOn(markdown.inline, 'parse');
    expect(ids(parse(joined(renderer(source))))).toEqual(['notes', 'notes-1']);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('footnotes', () => {
  const render = (source: string) => parse(joined(createMarkdownRenderer()(source)));

  test('links references and notes both ways, numbering notes by first reference', () => {
    const root = render('First[^b], second[^a], again[^b].\n\n[^a]: Note A.\n[^b]: Note B.\n');
    const refs = [...root.querySelectorAll('sup.footnote-ref a')];
    expect(refs.map((ref) => [ref.textContent, ref.getAttribute('href'), ref.id])).toEqual([
      ['1', '#fn-1', 'fnref-1'],
      ['2', '#fn-2', 'fnref-2'],
      ['1', '#fn-1', 'fnref-1-2'],
    ]);
    const notes = [...root.querySelectorAll('section.footnotes li')];
    expect(notes.map((note) => note.id)).toEqual(['fn-1', 'fn-2']);
    expect(notes[0].querySelector('p')).toHaveTextContent('Note B.');
    expect([...notes[0].querySelectorAll('.footnote-backref')].map((link) => link.getAttribute('href'))).toEqual([
      '#fnref-1',
      '#fnref-1-2',
    ]);
  });

  test('puts the list after the last block, and definitions render nothing in place', () => {
    const blocks = createMarkdownRenderer()('Text[^1]\n\n[^1]: Note\n\nAfter\n');
    expect(blocks.map((block) => [(block.html as string).slice(0, 8), block.line, block.endLine])).toEqual([
      ['<p>Text<', 0, 1],
      ['', 2, 4],
      ['<p>After', 4, 5],
      ['<section', 5, 5],
    ]);
  });

  test('parses indented lines as part of the note', () => {
    const note = render('Text[^note]\n\n[^note]: First paragraph\n    continued.\n\n    - a list\n\nNot in the note\n')
      .querySelector('.footnotes li');
    expect(note?.querySelectorAll('p')[0]).toHaveTextContent('First paragraph continued.');
    expect(note?.querySelector('ul')).toHaveTextContent('a list');
    expect(note).not.toHaveTextContent('Not in the note');
    // A note that doesn't end in a paragraph gets its backlink in one.
    expect(note?.lastElementChild?.matches('p')).toBe(true);
    expect(note?.lastElementChild?.querySelector('.footnote-backref')).not.toBeNull();
  });

  test('matches labels case-insensitively and uses the first definition', () => {
    const root = render('Text[^Note]\n\n[^note]: One\n\n[^NOTE]: Two\n');
    expect(root.querySelectorAll('.footnotes li')).toHaveLength(1);
    expect(root.querySelector('.footnotes li')).toHaveTextContent('One');
  });

  test.each([
    ['an undefined note', 'Text[^missing]'],
    ['a label with a space', 'Text[^a b]\n\n[^a b]: Note'],
    ['a reference in code', '`[^1]`\n\n[^1]: Note'],
    ['an escaped reference', '\\[^1]\n\n[^1]: Note'],
  ])('leaves %s as text', (_, source) => {
    const root = render(source);
    expect(root.querySelector('.footnote-ref, .footnotes')).toBeNull();
  });

  test("doesn't show notes that aren't referenced", () => {
    expect(render('Text\n\n[^1]: Note').querySelector('.footnotes')).toBeNull();
  });

  test('renumbers notes when a reference is added before them, matching a full render', () => {
    const renderer = createMarkdownRenderer();
    renderer('Intro\n\nLater[^b]\n\n[^a]: A\n\n[^b]: B');
    const edited = 'Intro[^a]\n\nLater[^b]\n\n[^a]: A\n\n[^b]: B';
    const html = joined(renderer(edited));
    expect(html).toBe(joined(createMarkdownRenderer()(edited)));
    expect(parse(html).querySelector('.footnotes li:last-child')).toHaveTextContent('B');
    expect(parse(html).querySelectorAll('.footnote-ref a')[1]).toHaveTextContent('2');
  });

  test('renders references again when a definition is added', () => {
    const renderer = createMarkdownRenderer();
    renderer('Text[^1]');
    expect(parse(joined(renderer('Text[^1]\n\n[^1]: Note'))).querySelector('.footnote-ref')).not.toBeNull();
  });
});

describe('GitHub alerts', () => {
  const render = (source: string) => parse(joined(createMarkdownRenderer()(source)));

  test.each(['note', 'tip', 'important', 'warning', 'caution'])('renders a %s alert', (type) => {
    const alert = render(`> [!${type.toUpperCase()}]\n> Some *text*`).querySelector(`.markdown-alert-${type}`);
    expect(alert?.matches('div.markdown-alert')).toBe(true);
    expect(alert?.querySelector('.markdown-alert-title svg')).not.toBeNull();
    expect(alert?.querySelector('.markdown-alert-title')).toHaveTextContent(new RegExp(`^${type}$`, 'i'));
    expect(alert?.querySelector('p:not(.markdown-alert-title) em')).toHaveTextContent('text');
    expect(alert?.querySelector('blockquote')).toBeNull();
  });

  test('accepts any case and content that starts after a blank line', () => {
    const alert = render('> [!Tip]\n>\n> Paragraph\n>\n> - list').querySelector('.markdown-alert-tip');
    expect(alert?.children).toHaveLength(3);
    expect(alert?.querySelector('ul')).not.toBeNull();
  });

  test('keeps nested blockquotes', () => {
    const alert = render('> [!NOTE]\n> Text\n> > Quoted').querySelector('.markdown-alert');
    expect(alert?.querySelector('blockquote')).toHaveTextContent('Quoted');
  });

  test.each([
    ['a marker with nothing after it', '> [!NOTE]'],
    ['text on the marker line', '> [!NOTE] Text'],
    ['an unknown type', '> [!DANGER]\n> Text'],
    ['a marker after other text', '> Text\n> [!NOTE]'],
    ['a nested blockquote', '- > [!NOTE]\n  > Text'],
  ])('leaves %s as a blockquote', (_, source) => {
    const root = render(source);
    expect(root.querySelector('.markdown-alert')).toBeNull();
    expect(root.querySelector('blockquote')).not.toBeNull();
  });
});

describe('front matter', () => {
  test('renders a YAML block at the top of the document as its own block', async () => {
    const blocks = createMarkdownRenderer()('---\ntitle: <Hi>\ntags: [a]\n---\n# Heading\n');
    expect(blocks.map((block) => [block.line, block.endLine])).toEqual([
      [0, 4],
      [4, 5],
    ]);
    const pre = parse(await blocks[0].html).querySelector('pre.front-matter')!;
    expect(pre.textContent).toBe('title: <Hi>\ntags: [a]\n');
    expect(blocks[1].html).toContain('<h1');
  });

  test('accepts `...` as the closing line, and empty front matter', () => {
    expect(joined(createMarkdownRenderer()('---\na: 1\n...\ntext\n'))).toContain('class="front-matter"');
    expect(joined(createMarkdownRenderer()('---\n---\ntext\n'))).toContain('class="front-matter"');
  });

  test.each([
    ['not at the top', 'text\n\n---\na: 1\n---\n'],
    ['never closed', '---\na: 1\n'],
    ['indented', ' ---\na: 1\n---\n'],
    ['inside a blockquote', '> ---\n> a: 1\n> ---\n'],
  ])('is ordinary Markdown when %s', (_, source) => {
    expect(joined(createMarkdownRenderer()(source))).not.toContain('front-matter');
  });
});
