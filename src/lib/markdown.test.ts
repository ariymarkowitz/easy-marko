import { afterEach, describe, expect, test, vi } from 'vitest';
import { createMarkdownRenderer, markdown } from './markdown';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createMarkdownRenderer', () => {
  test('splits top-level blocks and records their source line', () => {
    const blocks = createMarkdownRenderer()('# Title\n\nSome *text*\n\n- a\n- b\n');
    expect(blocks.map((block) => block.line)).toEqual([0, 2, 4]);
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
