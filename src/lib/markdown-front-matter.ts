// Front matter: a YAML block at the very top of the document, between `---`
// and a closing `---` or `...` line. It renders as a highlighted code block
// set apart from the content, instead of a rule and a setext heading.

import type { MarkdownIt, StateBlock } from 'markdown-it';
import { escapeHtml } from './escape-html';

function frontMatter(state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean {
  if (startLine !== 0 || state.parentType !== 'root') return false;
  /** Whether line `index` is unindented and, apart from trailing spaces, one of `markers`. */
  const isFence = (index: number, ...markers: string[]) =>
    state.tShift[index] === 0 && markers.includes(state.src.slice(state.bMarks[index], state.eMarks[index]).trimEnd());
  if (!isFence(0, '---')) return false;

  let close = 1;
  while (close < endLine && !isFence(close, '---', '...')) close++;
  if (close >= endLine) return false;
  if (silent) return true;

  const token = state.push('front_matter', 'pre', 0);
  token.markup = '---';
  token.map = [startLine, close + 1];
  token.content = state.getLines(startLine + 1, close, 0, true);
  state.line = close + 1;
  return true;
}

export function frontMatterBlock(md: MarkdownIt): void {
  md.block.ruler.before('table', 'front_matter', frontMatter);
  md.renderer.rules.front_matter = (tokens, idx, options) => {
    const { content } = tokens[idx];
    // `options.highlight` returns '' when YAML hasn't loaded, as for fenced code.
    const html = options.highlight?.(content, 'yaml', '') || escapeHtml(content);
    return `<pre class="front-matter"><code>${html}</code></pre>\n`;
  };
}
