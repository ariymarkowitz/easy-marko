// Splits a document's block tokens into top-level blocks for the preview,
// keeping Markdown wrapped in raw HTML in one block.

import type { Token } from 'markdown-it';

export interface BlockRange {
  /** Token indices: the block is tokens[start] up to (not including) tokens[end]. */
  start: number;
  end: number;
}

const voidElements = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr',
]);

const tagName = /<(\/?)([a-z][\w-]*)/iy;

/**
 * Elements that raw HTML opens without closing, less those it closes without
 * opening. Scans in one pass: a regex over tags backtracks through the rest of
 * the block at each `<` when a tag or quote isn't closed, which freezes the app
 * on a long crafted block. An unclosed comment, tag or quote hides the rest of
 * the block, as it does from the browser.
 */
function unclosedElements(html: string): number {
  let depth = 0;
  for (let index = html.indexOf('<'); index !== -1; index = html.indexOf('<', index)) {
    if (html.startsWith('<!--', index)) {
      const end = html.indexOf('-->', index + 4);
      if (end === -1) break;
      index = end + 3;
      continue;
    }
    tagName.lastIndex = index;
    const tag = tagName.exec(html);
    if (!tag) {
      index++;
      continue;
    }
    // Find the tag's `>`, skipping quoted attribute values.
    let end = tagName.lastIndex;
    while (end < html.length && html[end] !== '>') {
      end = html[end] === '"' || html[end] === "'" ? html.indexOf(html[end], end + 1) + 1 || html.length : end + 1;
    }
    if (end === html.length) break;
    const [, closing, name] = tag;
    if (html[end - 1] !== '/' && !voidElements.has(name.toLowerCase())) depth += closing ? -1 : 1;
    index = end + 1;
  }
  return depth;
}

/** Index one past the last token of the top-level block that starts at `start`. */
function blockEnd(tokens: Token[], start: number): number {
  if (tokens[start].nesting !== 1) return start + 1;
  let index = start + 1;
  while (index < tokens.length && !(tokens[index].level === 0 && tokens[index].nesting === -1)) {
    index++;
  }
  return index + 1;
}

/**
 * Joins a raw HTML block that leaves elements open with the blocks up to the
 * HTML block that closes them, so Markdown wrapped in `<details>` and the like
 * renders inside it. Each preview block is parsed on its own, which would
 * otherwise close the element straight away. Unclosed elements that nothing
 * later closes are left alone.
 *
 * Finds every closing block in one pass, so many unclosed blocks don't each
 * scan the rest of the document. Block i is closed by the first HTML block j
 * where the depth summed over blocks i to j drops to 0 or below.
 */
function mergeOpenHtml(tokens: Token[], blocks: BlockRange[]): BlockRange[] {
  const closedBy = blocks.map((_, index) => index);
  // Blocks still open, with the total depth before each. The totals increase up the stack.
  const open: { index: number; depthBefore: number }[] = [];
  let depth = 0;
  blocks.forEach((block, index) => {
    const token = tokens[block.start];
    if (token.type !== 'html_block') return;
    const change = unclosedElements(token.content);
    if (change > 0) open.push({ index, depthBefore: depth });
    depth += change;
    while (open.length > 0 && open.at(-1)!.depthBefore >= depth) closedBy[open.pop()!.index] = index;
  });

  const merged: BlockRange[] = [];
  for (let i = 0; i < blocks.length; i = closedBy[i] + 1) {
    merged.push({ start: blocks[i].start, end: blocks[closedBy[i]].end });
  }
  return merged;
}

/** Splits a document's tokens into its top-level blocks, keeping Markdown wrapped in raw HTML in one block. */
export function topLevelBlocks(tokens: Token[]): BlockRange[] {
  const blocks: BlockRange[] = [];
  for (let start = 0, end = 0; start < tokens.length; start = end) {
    end = blockEnd(tokens, start);
    blocks.push({ start, end });
  }
  return mergeOpenHtml(tokens, blocks);
}
