// Maths syntax for the source editor: inline `$…$` and `$$…$$`, and `$$`
// blocks. The delimiter rules follow the preview (inlineMath in
// lib/markdown.ts and the rules of @vscode/markdown-it-katex), so the source
// highlights what the preview renders as maths.

import { Tag, tags } from '@lezer/highlight';
import type { BlockParser, InlineContext, InlineParser, Line, MarkdownConfig } from '@lezer/markdown';

/** Highlight tag for maths content. The delimiters are tagged like other Markdown marks. */
export const mathTag = Tag.define('math');

const DOLLAR = 36;
const BACKSLASH = 92;

const isSpace = (code: number) => /\s/.test(String.fromCharCode(code));
const isDigit = (code: number) => code >= 48 && code <= 57;

/** Document position of the next `search` at or after `from` in the inline section, or -1. */
function indexOf(cx: InlineContext, search: string, from: number): number {
  const index = cx.text.indexOf(search, from - cx.offset);
  return index === -1 ? -1 : index + cx.offset;
}

/** Whether an odd number of backslashes comes before `pos`. */
function isEscaped(cx: InlineContext, pos: number): boolean {
  let backslashes = 0;
  while (pos - backslashes > cx.offset && cx.char(pos - backslashes - 1) === BACKSLASH) backslashes++;
  return backslashes % 2 === 1;
}

function addInlineMath(cx: InlineContext, from: number, to: number, markLength: number): number {
  return cx.addElement(
    cx.elt('InlineMath', from, to, [
      cx.elt('MathMark', from, from + markLength),
      cx.elt('MathMark', to - markLength, to),
    ]),
  );
}

/** The plugin's test for a `$$` at `pos` that can open or close inline `$$…$$` maths. */
function isDisplayDelimiter(cx: InlineContext, pos: number): boolean {
  const before = cx.char(pos - 1);
  return before !== DOLLAR && before !== BACKSLASH && cx.char(pos + 2) !== DOLLAR;
}

/**
 * Inline `$$…$$` at `start`. Like the plugin, a `$$` that doesn't open maths
 * is consumed as text, so neither of its `$` can open `$…$` maths either.
 */
function parseInlineDisplayMath(cx: InlineContext, start: number): number {
  const contentStart = start + 2;
  if (!isDisplayDelimiter(cx, start)) return contentStart;
  let end = indexOf(cx, '$$', contentStart);
  while (end !== -1 && isEscaped(cx, end)) end = indexOf(cx, '$$', end + 2);
  if (end === -1 || !isDisplayDelimiter(cx, end)) return contentStart;
  return addInlineMath(cx, start, end + 2, 2);
}

/** Inline `$…$` with Pandoc's rules, as in the preview's inlineMath. */
const inlineMath: InlineParser = {
  name: 'InlineMath',
  after: 'Escape',
  parse(cx, next, start) {
    if (next !== DOLLAR) return -1;
    if (cx.char(start + 1) === DOLLAR) return parseInlineDisplayMath(cx, start);
    if (start + 1 >= cx.end || isSpace(cx.char(start + 1))) return -1;
    for (let end = indexOf(cx, '$', start + 2); end !== -1; end = indexOf(cx, '$', end + 1)) {
      if (isEscaped(cx, end) || isSpace(cx.char(end - 1)) || isDigit(cx.char(end + 1))) continue;
      return addInlineMath(cx, start, end + 1, 1);
    }
    return -1;
  },
};

/**
 * For a line that opens a `$$` block, the offset in the line of the `$$` that
 * closes it on the same line, or -1 if the block continues onto later lines.
 * Undefined if the line doesn't open a block. As in the plugin, a line with
 * several `$$` after the opener holds inline maths instead, and a single one
 * only closes the block at the very end of the line.
 */
function blockMathStart(line: Line): number | undefined {
  if (line.next !== DOLLAR || line.text.charCodeAt(line.pos + 1) !== DOLLAR) return undefined;
  const rest = line.text.slice(line.pos + 2);
  const closers = [...rest.matchAll(/\$\$/g)];
  if (closers.length > 1) return undefined;
  const close = closers[0]?.index;
  return close === rest.length - 2 ? line.pos + 2 + close : -1;
}

/**
 * The number of containers (blockquotes, list items) a line continues. Not in
 * the public typings; @lezer/markdown's own fenced code parser uses it to stop
 * at the end of its container.
 */
const lineDepth = (line: Line) => (line as Line & { depth: number }).depth;

/**
 * `$$` blocks. As in the plugin, they can interrupt a paragraph, blank lines
 * don't end them, and they close on the first later line containing `$$`,
 * or run to the end of their container.
 */
const blockMath: BlockParser = {
  name: 'BlockMath',
  after: 'Blockquote',
  parse(cx, line) {
    const close = blockMathStart(line);
    if (close === undefined) return false;
    const from = cx.lineStart + line.pos;
    const marks = [cx.elt('MathMark', from, from + 2)];
    if (close !== -1) {
      marks.push(cx.elt('MathMark', cx.lineStart + close, cx.lineStart + close + 2));
      cx.nextLine();
    } else {
      while (cx.nextLine() && lineDepth(line) >= cx.depth) {
        marks.push(...line.markers);
        const first = line.text.indexOf('$$', line.pos);
        if (first === -1) continue;
        const mark = /\$\$\s*$/.test(line.text) ? line.text.lastIndexOf('$$') : first;
        marks.push(cx.elt('MathMark', cx.lineStart + mark, cx.lineStart + mark + 2));
        cx.nextLine();
        break;
      }
    }
    cx.addElement(cx.elt('BlockMath', from, cx.prevLineEnd(), marks));
    return true;
  },
  endLeaf: (_cx, line) => blockMathStart(line) !== undefined,
};

/** Pass to `markdown({ extensions })`. */
export const mathSyntax: MarkdownConfig = {
  defineNodes: [
    { name: 'InlineMath', style: mathTag },
    { name: 'BlockMath', block: true, style: mathTag },
    { name: 'MathMark', style: tags.processingInstruction },
  ],
  parseInline: [inlineMath],
  parseBlock: [blockMath],
};
