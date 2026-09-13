// Maths: KaTeX's `$…$` and `$$…$$` syntax, with Pandoc's rules for inline
// `$…$` delimiters.

import type { MarkdownIt, StateInline } from 'markdown-it';
import katexModule from '@vscode/markdown-it-katex';

// The plugin is CommonJS with `exports.default`. Node unwraps that for a
// default import but Vite's dev pre-bundle doesn't, so accept either shape.
const markdownItKatex =
  (katexModule as unknown as { default?: typeof katexModule }).default ?? katexModule;

function isEscaped(src: string, index: number): boolean {
  let backslashes = 0;
  while (src[index - 1 - backslashes] === '\\') backslashes++;
  return backslashes % 2 === 1;
}

/**
 * Inline `$…$` maths with Pandoc's delimiter rules: the opening `$` can't be
 * followed by whitespace, and the closing `$` can't be preceded by whitespace
 * or followed by a digit. The plugin's own rule also rejects letters touching
 * the delimiters, so `$x$th` stayed text; amounts like `$5 and $10` still do.
 * Emits the plugin's `math_inline` token, so its renderer is unchanged.
 */
function inlineMath(state: StateInline, silent: boolean): boolean {
  const { src, pos } = state;
  if (src[pos] !== '$' || /\s/.test(src[pos + 1] ?? ' ')) return false;

  // `$$` never reaches here: the plugin's inline `$$…$$` rule runs first.
  let end = src.indexOf('$', pos + 2);
  for (; end !== -1 && end < state.posMax; end = src.indexOf('$', end + 1)) {
    if (isEscaped(src, end) || /\s/.test(src[end - 1]) || /\d/.test(src[end + 1] ?? '')) continue;
    if (!silent) {
      const token = state.push('math_inline', 'math', 0);
      token.markup = '$';
      token.content = src.slice(pos + 1, end);
    }
    state.pos = end + 1;
    return true;
  }
  return false;
}

export function maths(md: MarkdownIt): void {
  md.use(markdownItKatex, { throwOnError: false });
  // Replaces the rule the plugin just added.
  md.inline.ruler.at('math_inline', inlineMath);
}
