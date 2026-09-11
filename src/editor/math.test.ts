import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { highlightTree, tagHighlighter, tags } from '@lezer/highlight';
import { describe, expect, test } from 'vitest';
import welcome from '../content/welcome.md?raw';
import { markdown as preview } from '../lib/markdown';
import { mathSyntax, mathTag } from './math';

const parser = markdown({ base: markdownLanguage, extensions: mathSyntax }).language.parser;

/** The maths nodes and delimiters in `doc`, as `Name source`. */
function nodes(doc: string): string[] {
  const found: string[] = [];
  parser.parse(doc).iterate({
    enter: (node) => {
      if (/Math/.test(node.name)) found.push(`${node.name} ${doc.slice(node.from, node.to)}`);
    },
  });
  return found;
}

/** The source of each piece of maths in `doc`. */
function maths(doc: string): string[] {
  const found: string[] = [];
  parser.parse(doc).iterate({
    enter: (node) => {
      if (node.name === 'InlineMath' || node.name === 'BlockMath') found.push(doc.slice(node.from, node.to));
    },
  });
  return found;
}

describe('inline maths', () => {
  test('parses $…$ and marks its delimiters', () => {
    expect(nodes('Euler: $e^{i\\pi}$!')).toEqual(['InlineMath $e^{i\\pi}$', 'MathMark $', 'MathMark $']);
  });

  test.each([
    ['text touches the delimiters', 'a$x$b', ['$x$']],
    ['punctuation follows the closing $', '$x$.', ['$x$']],
    ['it contains an escaped $', '$x\\$y$', ['$x\\$y$']],
    ['it contains backticks', '$`a`$', ['$`a`$']],
    ['it spans lines of a paragraph', 'Some $a\nb$', ['$a\nb$']],
    ['it is inside emphasis', '*$x$*', ['$x$']],
    ['one closes where the next opens', '$x$$y$', ['$x$', '$y$']],
    ['a closing $ is skipped for a later one', '$5 and $10$', ['$5 and $10$']],
  ])('parses maths when %s', (_, doc, expected) => {
    expect(maths(doc)).toEqual(expected);
  });

  test.each([
    ['dollar amounts', 'costs $5 and $10'],
    ['an unclosed $', 'costs $5'],
    ['a space after the opening $', '$ x$'],
    ['a space before the closing $', '$x $'],
    ['a digit after the closing $', '$5$10'],
    ['escaped dollars', '\\$x\\$'],
    ['a code span', '`$x$` and `$$y$$`'],
    ['a fenced code block', '```\n$x$ and\n$$\ny\n$$\n```'],
    ['an indented code block', '    $x$\n    $$y$$'],
    ['an unclosed $$', 'a $$ x'],
    ['empty $$$$', 'a $$$$ b'],
  ])('leaves %s as text', (_, doc) => {
    expect(maths(doc)).toEqual([]);
  });

  test('takes $$…$$ inside a paragraph as display maths', () => {
    expect(nodes('a $$x$$ b')).toEqual(['InlineMath $$x$$', 'MathMark $$', 'MathMark $$']);
  });

  test('takes a line with several $$ pairs as inline maths', () => {
    expect(nodes('$$x$$ and $$y$$')).toEqual([
      'InlineMath $$x$$',
      'MathMark $$',
      'MathMark $$',
      'InlineMath $$y$$',
      'MathMark $$',
      'MathMark $$',
    ]);
  });
});

describe('block maths', () => {
  test('parses a $$ block and marks its delimiters', () => {
    expect(nodes('$$\nx^2\n$$\nafter')).toEqual(['BlockMath $$\nx^2\n$$', 'MathMark $$', 'MathMark $$']);
  });

  test('parses a block on one line', () => {
    expect(nodes('$$x$$')).toEqual(['BlockMath $$x$$', 'MathMark $$', 'MathMark $$']);
  });

  test('interrupts a paragraph', () => {
    expect(maths('Text\n$$\nx\n$$')).toEqual(['$$\nx\n$$']);
  });

  test('continues past blank lines and code fences', () => {
    expect(maths('$$\na\n\n```\nb\n$$\nafter')).toEqual(['$$\na\n\n```\nb\n$$']);
  });

  test('closes at the first line containing $$', () => {
    expect(maths('$$\na $$ b\nafter')).toEqual(['$$\na $$ b']);
  });

  test('runs to the end of the document when unclosed', () => {
    expect(maths('$$\na\n\n# b')).toEqual(['$$\na\n\n# b']);
  });

  test('ends with its blockquote', () => {
    const doc = '> $$\n> x\n\n$y$';
    expect(maths(doc)).toEqual(['$$\n> x', '$y$']);
    expect(nodes('> $$\n> x\n> $$')).toEqual(['BlockMath $$\n> x\n> $$', 'MathMark $$', 'MathMark $$']);
  });
});

describe('agreement with the preview', () => {
  /** The delimiter of each piece of maths the preview renders. */
  function previewDelimiters(doc: string): string[] {
    return preview
      .parse(doc, {})
      .flatMap((token) => [token, ...(token.children ?? [])])
      .filter((token) => token.type === 'math_inline' || token.type === 'math_block')
      .map((token) => token.markup);
  }

  /** The opening delimiter of each maths node in the source. */
  function sourceDelimiters(doc: string): string[] {
    const found: string[] = [];
    parser.parse(doc).iterate({
      enter: (node) => {
        const mark = node.node.getChild('MathMark');
        if (/^(Inline|Block)Math$/.test(node.name) && mark) found.push(doc.slice(mark.from, mark.to));
      },
    });
    return found;
  }

  test.each([
    'costs $5 and $10, or $x$ and $$y$$',
    'a$$$x$$ and $x\\$$y$',
    '$$x$$ text\n\nmore',
    'Text\n    $$x$$',
    '> $$\n> x\n> $$',
    '- $$\n  x\n  $$',
    '`$x$` $`y`$ $a `b$` c',
    '$$\na $$ b\n$x$',
    welcome,
  ])('finds the same maths in %j', (doc) => {
    expect(sourceDelimiters(doc)).toEqual(previewDelimiters(doc));
  });
});

test('styles maths content and delimiters apart', () => {
  const doc = 'a $x$';
  const highlighter = tagHighlighter([
    { tag: mathTag, class: 'math' },
    { tag: tags.processingInstruction, class: 'mark' },
  ]);
  const spans: string[] = [];
  highlightTree(parser.parse(doc), highlighter, (from, to, classes) => {
    spans.push(`${doc.slice(from, to)}:${classes}`);
  });
  expect(spans).toEqual(['$:mark', 'x:math', '$:mark']);
});
