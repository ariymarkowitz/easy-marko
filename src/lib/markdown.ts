import MarkdownIt from 'markdown-it';
import katexModule from '@vscode/markdown-it-katex';

// The plugin is CommonJS with `exports.default`. Node unwraps that for a
// default import but Vite's dev pre-bundle doesn't, so accept either shape.
const markdownItKatex =
  (katexModule as unknown as { default?: typeof katexModule }).default ?? katexModule;

type Token = ReturnType<typeof markdown.parse>[number];
type Env = NonNullable<Parameters<typeof markdown.parse>[1]>;

export interface RenderedBlock {
  /** Stable identity for keyed rendering: the block's source, disambiguated when repeated. */
  key: string;
  /** Zero-based source line the block starts on. */
  line: number;
  /** Zero-based source line just past the block's end. */
  endLine: number;
  html: string;
}

// Raw HTML stays disabled until preview output is sanitised: opened files are untrusted.
export const markdown = new MarkdownIt({ linkify: true, typographer: true }).use(markdownItKatex, {
  throwOnError: false,
});

type InlineRule = Parameters<typeof markdown.inline.ruler.at>[1];

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
const inlineMath: InlineRule = (state, silent) => {
  const { src, pos } = state;
  if (src[pos] !== '$' || /\s/.test(src[pos + 1] ?? ' ')) return false;

  // `$$` never reaches here: the plugin's inline `$$…$$` rule runs first.
  for (let end = src.indexOf('$', pos + 2); end !== -1 && end < state.posMax; end = src.indexOf('$', end + 1)) {
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
};

markdown.inline.ruler.at('math_inline', inlineMath);

const renderLinkOpen =
  markdown.renderer.rules.link_open ??
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));

// External links open in a new tab so they never navigate away from the editor.
markdown.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  if (!String(token.attrGet('href')).startsWith('#')) {
    token.attrSet('target', '_blank');
    token.attrSet('rel', 'noopener noreferrer');
  }
  return renderLinkOpen(tokens, idx, options, env, self);
};

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
 * Creates a renderer that splits a document into top-level blocks and caches
 * each block's HTML by its source text, so an edit only re-renders (and re-runs
 * KaTeX for) the blocks it changed.
 */
export function createMarkdownRenderer() {
  let cache = new Map<string, string>();
  let references = '';

  return (source: string): RenderedBlock[] => {
    const env: Env = {};
    const tokens = markdown.parse(source, env);

    // Reference definitions can change the links in any block.
    const nextReferences = JSON.stringify(env.references ?? {});
    if (nextReferences !== references) {
      cache.clear();
      references = nextReferences;
    }

    // CodeMirror normalises line endings to \n, so line maps index into this.
    const lines = source.split('\n');
    const nextCache = new Map<string, string>();
    const occurrences = new Map<string, number>();
    const blocks: RenderedBlock[] = [];

    for (let start = 0; start < tokens.length; ) {
      const end = blockEnd(tokens, start);
      const map = tokens[start].map;
      const text = map ? lines.slice(map[0], map[1]).join('\n') : undefined;

      const html =
        (text !== undefined && cache.get(text)) ||
        markdown.renderer.render(tokens.slice(start, end), markdown.options, env);
      if (text !== undefined) nextCache.set(text, html);

      const id = text ?? `\0token:${start}`;
      const seen = occurrences.get(id) ?? 0;
      occurrences.set(id, seen + 1);

      blocks.push({
        key: seen === 0 ? id : `${id}\0${seen}`,
        line: map?.[0] ?? 0,
        endLine: map?.[1] ?? 0,
        html,
      });
      start = end;
    }

    cache = nextCache;
    return blocks;
  };
}
