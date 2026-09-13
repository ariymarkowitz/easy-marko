import type { LanguageDescription } from '@codemirror/language';
import MarkdownIt from 'markdown-it';
import katexModule from '@vscode/markdown-it-katex';
import { findLanguage, highlight } from './highlight';
import { sanitizeHtml } from './sanitize';

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
  /** Sanitised HTML. */
  html: string;
}

// Raw HTML is allowed because every rendered block goes through sanitizeHtml.
export const markdown = new MarkdownIt({ html: true, linkify: true, typographer: true }).use(
  markdownItKatex,
  { throwOnError: false },
);

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

type CoreRule = Parameters<typeof markdown.core.ruler.push>[1];

const taskMarker = /^\[([ xX])\](?:[ \t]|$)/;

/**
 * GitHub-style task lists: a list item starting with `[ ]` or `[x]` gets a
 * read-only checkbox in place of the marker, including an item with no text. The raw content is checked as
 * well as the parsed text, so an escaped `\[ ]` stays text.
 */
const taskLists: CoreRule = (state) => {
  const { tokens } = state;
  for (let i = 2; i < tokens.length; i++) {
    const inline = tokens[i];
    if (inline.type !== 'inline' || tokens[i - 1].type !== 'paragraph_open') continue;
    if (tokens[i - 2].type !== 'list_item_open') continue;
    const marker = taskMarker.exec(inline.content);
    const children = inline.children ?? [];
    const text = children[0];
    if (!marker || text?.type !== 'text' || !text.content.startsWith(marker[0])) continue;

    text.content = text.content.slice(marker[0].length);
    const checkbox = new state.Token('task_checkbox', 'input', 0);
    checkbox.meta = { checked: marker[1] !== ' ' };
    children.unshift(checkbox);
    tokens[i - 2].attrJoin('class', 'task-list-item');
  }
};

markdown.core.ruler.push('task_lists', taskLists);

markdown.renderer.rules.task_checkbox = (tokens, idx) =>
  `<input class="task-list-item-checkbox" type="checkbox" disabled${tokens[idx].meta?.checked ? ' checked' : ''}>`;

const voidElements = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr',
]);

/** Elements that raw HTML opens without closing, less those it closes without opening. */
function unclosedElements(html: string): number {
  let depth = 0;
  const tags = html.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<(\/?)([a-z][\w-]*)(?:"[^"]*"|'[^']*'|[^'">])*?(\/?)>/gi);
  for (const [, closing, name, selfClosing] of tags) {
    if (selfClosing || voidElements.has(name.toLowerCase())) continue;
    depth += closing ? -1 : 1;
  }
  return depth;
}

interface BlockRange {
  /** Token indices: the block is tokens[start] up to (not including) tokens[end]. */
  start: number;
  end: number;
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

/** Splits a document's tokens into its top-level blocks, keeping markdown wrapped in raw HTML in one block. */
function topLevelBlocks(tokens: Token[]): BlockRange[] {
  const blocks: BlockRange[] = [];
  for (let start = 0; start < tokens.length; start = blocks[blocks.length - 1].end) {
    blocks.push({ start, end: blockEnd(tokens, start) });
  }
  return mergeOpenHtml(tokens, blocks);
}

/**
 * Joins a raw HTML block that leaves elements open with the blocks up to the
 * HTML block that closes them, so markdown wrapped in `<details>` and the like
 * renders inside it. Each preview block is parsed on its own, which would
 * otherwise close the element straight away. Unclosed elements that nothing
 * later closes are left alone.
 */
function mergeOpenHtml(tokens: Token[], blocks: BlockRange[]): BlockRange[] {
  const merged: BlockRange[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const first = tokens[blocks[i].start];
    let depth = first.type === 'html_block' ? unclosedElements(first.content) : 0;
    let last = i;
    for (let j = i + 1; depth > 0 && j < blocks.length; j++) {
      const token = tokens[blocks[j].start];
      if (token.type !== 'html_block') continue;
      depth += unclosedElements(token.content);
      if (depth <= 0) last = j;
    }
    merged.push({ start: blocks[i].start, end: blocks[last].end });
    i = last;
  }
  return merged;
}

interface BlockOutput {
  html: string;
  /** Languages of fenced code left unhighlighted because they hadn't loaded. */
  waitingFor: LanguageDescription[];
}

/** Renders tokens to sanitised HTML, highlighting code whose language has loaded. */
function renderTokens(tokens: Token[], env: Env): BlockOutput {
  const waitingFor = new Set<LanguageDescription>();
  const options = {
    ...markdown.options,
    // Returning '' makes markdown-it escape the code as plain text.
    highlight: (code: string, name: string) => {
      const language = findLanguage(name);
      if (!language) return '';
      if (!language.support) waitingFor.add(language);
      return highlight(code, language) ?? '';
    },
  };
  const html = sanitizeHtml(markdown.renderer.render(tokens, options, env));
  return { html, waitingFor: [...waitingFor] };
}

export interface MarkdownRendererOptions {
  /**
   * Called when fenced code needs a language that hasn't loaded, with a
   * promise that settles once it has loaded or failed to. Rendering again
   * after that highlights the code.
   */
  onLanguageLoad?: (loaded: Promise<void>) => void;
}

interface RenderEnv extends Env {
  /** Given the document's block tokens, returns the ones that still need parsing. */
  selectTokens?: (tokens: Token[]) => Token[];
}

// Runs after the document is split into blocks, before their inline content
// is parsed. createMarkdownRenderer uses it to drop the blocks it has cached
// HTML for, so they skip inline parsing and the core rules after it
// (linkify, typographer, task lists). Without selectTokens it does nothing.
markdown.core.ruler.before('inline', 'select_tokens', (state) => {
  const { selectTokens } = state.env as RenderEnv;
  if (selectTokens) state.tokens = selectTokens(state.tokens);
});

interface Block {
  line: number;
  endLine: number;
  /** The block's source, which keys the cache. Undefined if the block has no line map. */
  text?: string;
  tokens: Token[];
  /** The block's cached output, if it's still valid. */
  cached?: BlockOutput;
}

/**
 * Creates a renderer that splits a document into top-level blocks and caches
 * each block's HTML by its source text. An edit only parses the inline content
 * of, and renders (running KaTeX and the sanitiser for), the blocks it changed.
 * The whole document is still split into blocks each time. Blocks whose code
 * was waiting for a language re-render once it loads.
 */
export function createMarkdownRenderer(options: MarkdownRendererOptions = {}) {
  let cache = new Map<string, BlockOutput>();
  let references = '';
  const requested = new Set<LanguageDescription>();

  const load = (language: LanguageDescription) => {
    if (requested.has(language)) return;
    requested.add(language);
    options.onLanguageLoad?.(
      language.load().then(
        () => undefined,
        (error: unknown) => console.error(`Couldn't load ${language.name} highlighting`, error),
      ),
    );
  };

  /** Splits a document's block tokens into blocks, finding each one's cached output. */
  const splitBlocks = (source: string, tokens: Token[], env: RenderEnv): Block[] => {
    // Reference definitions can change the links in any block. Block parsing
    // has collected them all by now.
    const nextReferences = JSON.stringify(env.references ?? {});
    if (nextReferences !== references) {
      cache.clear();
      references = nextReferences;
    }

    // CodeMirror normalises line endings to \n, so line maps index into this.
    const lines = source.split('\n');
    return topLevelBlocks(tokens).map(({ start, end }) => {
      const blockTokens = tokens.slice(start, end);
      const firstMap = blockTokens[0].map;
      const lastMap = blockTokens.findLast((token) => token.level === 0 && token.map)?.map;
      const line = firstMap?.[0] ?? 0;
      const endLine = lastMap?.[1] ?? firstMap?.[1] ?? 0;
      const text = firstMap ? lines.slice(line, endLine).join('\n') : undefined;
      // Reuse a cached block unless a language it was waiting for has loaded since.
      const output = text === undefined ? undefined : cache.get(text);
      const cached = output?.waitingFor.every((language) => !language.support) ? output : undefined;
      return { line, endLine, text, tokens: blockTokens, cached };
    });
  };

  return (source: string): RenderedBlock[] => {
    let documentBlocks: Block[] = [];
    const env: RenderEnv = {
      selectTokens: (tokens) => {
        documentBlocks = splitBlocks(source, tokens, env);
        // The core rules after this one edit these token objects in place,
        // so each block's tokens are complete once parsing finishes.
        return documentBlocks.filter((block) => !block.cached).flatMap((block) => block.tokens);
      },
    };
    markdown.parse(source, env);

    const nextCache = new Map<string, BlockOutput>();
    const occurrences = new Map<string, number>();
    const blocks = documentBlocks.map((block, index): RenderedBlock => {
      const output = block.cached ?? renderTokens(block.tokens, env);
      if (block.text !== undefined) nextCache.set(block.text, output);
      output.waitingFor.forEach(load);

      const id = block.text ?? `\0block:${index}`;
      const seen = occurrences.get(id) ?? 0;
      occurrences.set(id, seen + 1);
      return {
        key: seen === 0 ? id : `${id}\0${seen}`,
        line: block.line,
        endLine: block.endLine,
        html: output.html,
      };
    });

    cache = nextCache;
    return blocks;
  };
}
