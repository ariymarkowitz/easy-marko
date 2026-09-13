import type { LanguageDescription } from '@codemirror/language';
import MarkdownIt from 'markdown-it';
import katexModule from '@vscode/markdown-it-katex';
import { findLanguage, highlight } from './highlight';
import { githubAlerts } from './markdown-alerts';
import {
  footnoteId,
  footnoteMeta,
  footnoteRefId,
  footnotes,
  type FootnoteBackrefsMeta,
  type FootnoteDefMeta,
  type FootnoteEnv,
  type FootnoteRefMeta,
} from './markdown-footnotes';
import { sanitizeHtml } from './sanitize';
import { createSlugger, slugify } from './slug';

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
export const markdown = new MarkdownIt({ html: true, linkify: true, typographer: true })
  .use(markdownItKatex, { throwOnError: false })
  .use(footnotes)
  .use(githubAlerts);

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
    while (open.length > 0 && open[open.length - 1].depthBefore >= depth) closedBy[open.pop()!.index] = index;
  });

  const merged: BlockRange[] = [];
  for (let i = 0; i < blocks.length; i = closedBy[i] + 1) {
    merged.push({ start: blocks[i].start, end: blocks[closedBy[i]].end });
  }
  return merged;
}

/** What a block adds to the document's anchors. It depends only on the block's source. */
interface BlockAnchors {
  /** Slugs of its headings, before repeats are made unique. Empty for a heading with no slug. */
  headings: string[];
  /** Labels of its footnote references. */
  refs: string[];
  /** Labels of its footnote definitions. */
  defs: string[];
}

/** The document-wide ids a block renders with, in the order of its BlockAnchors. */
interface BlockIds {
  headings: string[];
  refs: [number: number, occurrence: number][];
  /** Each definition's note number (0 if the note isn't shown) and how many references it has. */
  defs: [number: number, references: number][];
}

interface AnchorVisitor {
  heading: (open: Token, inline: Token) => void;
  ref: (token: Token) => void;
  def: (open: Token) => void;
}

/** Visits a block's headings, footnote references and footnote definitions, each kind in source order. */
function visitAnchors(tokens: Token[], visit: AnchorVisitor): void {
  tokens.forEach((token, index) => {
    if (token.type === 'heading_open') visit.heading(token, tokens[index + 1]);
    else if (token.type === 'footnote_def_open') visit.def(token);
    else if (token.type === 'inline') {
      for (const child of token.children ?? []) if (child.type === 'footnote_ref') visit.ref(child);
    }
  });
}

/** The text a heading's slug comes from: markup is dropped, code and maths keep their source. */
function plainText(tokens: Token[]): string {
  return tokens
    .map((token) => (['text', 'code_inline', 'math_inline'].includes(token.type) ? token.content : ''))
    .join('');
}

function collectAnchors(tokens: Token[]): BlockAnchors {
  const anchors: BlockAnchors = { headings: [], refs: [], defs: [] };
  visitAnchors(tokens, {
    heading: (_, inline) => anchors.headings.push(slugify(plainText(inline.children ?? []))),
    ref: (token) => anchors.refs.push(footnoteMeta<FootnoteRefMeta>(token).label),
    def: (open) => anchors.defs.push(footnoteMeta<FootnoteDefMeta>(open).label),
  });
  return anchors;
}

/**
 * Gives each block's anchors their ids. Repeated heading slugs get GitHub's
 * numbered suffixes. Notes are numbered in the order they're first referenced,
 * and only a note's first definition is shown, only if it's referenced.
 */
function assignIds(blocks: BlockAnchors[]): BlockIds[] {
  const slug = createSlugger();
  const numbers = new Map<string, number>();
  const references = new Map<string, number>();
  const ids = blocks.map(
    (block): BlockIds => ({
      headings: block.headings.map((heading) => (heading ? slug(heading) : '')),
      refs: block.refs.map((label) => {
        if (!numbers.has(label)) numbers.set(label, numbers.size + 1);
        const occurrence = (references.get(label) ?? 0) + 1;
        references.set(label, occurrence);
        return [numbers.get(label)!, occurrence];
      }),
      defs: [],
    }),
  );
  const shown = new Set<string>();
  blocks.forEach((block, index) => {
    ids[index].defs = block.defs.map((label) => {
      const number = numbers.get(label);
      if (number === undefined || shown.has(label)) return [0, 0];
      shown.add(label);
      return [number, references.get(label)!];
    });
  });
  return ids;
}

/** Sets a block's ids on its tokens for rendering. */
function applyIds(tokens: Token[], ids: BlockIds): void {
  let heading = 0;
  let ref = 0;
  let def = 0;
  visitAnchors(tokens, {
    heading: (open) => {
      const id = ids.headings[heading++];
      if (id) open.attrSet('id', id);
    },
    ref: (token) => {
      const [number, occurrence] = ids.refs[ref++];
      Object.assign(footnoteMeta<FootnoteRefMeta>(token), { number, id: footnoteRefId(number, occurrence) });
    },
    def: (open) => {
      const [number, references] = ids.defs[def++];
      Object.assign(footnoteMeta<FootnoteDefMeta>(open), { number, references });
    },
  });
}

interface FootnoteDefinition {
  number: number;
  content: Token[];
}

/** Removes footnote definitions (including ones nested in them) from `tokens`, adding them to `definitions`. */
function extractFootnotes(tokens: Token[], definitions: FootnoteDefinition[]): Token[] {
  const body: Token[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const open = tokens[i];
    if (open.type !== 'footnote_def_open') {
      body.push(open);
      continue;
    }
    let close = i + 1;
    for (let depth = 1; ; close++) {
      if (tokens[close].type === 'footnote_def_open') depth++;
      else if (tokens[close].type === 'footnote_def_close' && --depth === 0) break;
    }
    const { number = 0, references = 0 } = footnoteMeta<FootnoteDefMeta>(open);
    const definition: FootnoteDefinition = { number, content: [] };
    definitions.push(definition);
    definition.content = extractFootnotes(tokens.slice(i + 1, close), definitions);
    const backrefs = definition.content.find((token) => token.type === 'footnote_backrefs');
    if (backrefs) backrefs.meta = { number, count: references } satisfies FootnoteBackrefsMeta;
    i = close;
  }
  return body;
}

interface RenderedFootnote {
  number: number;
  /** Sanitised HTML of the note's content. */
  html: string;
}

interface BlockOutput {
  html: string;
  /** The notes the block defines that are shown, for the footnotes list. */
  footnotes: RenderedFootnote[];
  /** Languages of fenced code left unhighlighted because they hadn't loaded. */
  waitingFor: LanguageDescription[];
  anchors: BlockAnchors;
  /** The ids the block was rendered with, serialised. */
  ids: string;
}

/** Renders a block's tokens to sanitised HTML, highlighting code whose language has loaded. */
function renderBlock(tokens: Token[], env: Env, ids: BlockIds): Pick<BlockOutput, 'html' | 'footnotes' | 'waitingFor'> {
  applyIds(tokens, ids);
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
  const render = (part: Token[]) => sanitizeHtml(markdown.renderer.render(part, options, env));

  // Notes render in the footnotes list at the end, not where they're defined.
  const definitions: FootnoteDefinition[] = [];
  const body = extractFootnotes(tokens, definitions);
  const footnotes = definitions
    .filter((definition) => definition.number > 0)
    .map((definition) => ({ number: definition.number, html: render(definition.content) }));
  return { html: render(body), footnotes, waitingFor: [...waitingFor] };
}

/** The footnotes list, placed after the last block. */
function footnotesBlock(footnotes: RenderedFootnote[], line: number): RenderedBlock {
  const items = footnotes
    .sort((a, b) => a.number - b.number)
    .map((note) => `<li id="${footnoteId(note.number)}">${note.html}</li>`)
    .join('');
  return {
    key: '\0footnotes',
    line,
    endLine: line,
    html: `<section class="footnotes" aria-label="Footnotes"><ol>${items}</ol></section>`,
  };
}

export interface MarkdownRendererOptions {
  /**
   * Called when fenced code needs a language that hasn't loaded, with a
   * promise that settles once it has loaded or failed to. Rendering again
   * after that highlights the code.
   */
  onLanguageLoad?: (loaded: Promise<void>) => void;
}

interface RenderEnv extends Env, FootnoteEnv {
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
  /** Valid cached outputs for the block's source, keyed by the ids they rendered with. Empty if it was parsed. */
  cached: Outputs;
}

/** A block source's outputs, keyed by their serialised ids. */
type Outputs = Map<string, BlockOutput>;

const noOutputs: Outputs = new Map();

/** Any of a block's cached outputs, for what depends only on its source. */
const anyOutput = (block: Block) => block.cached.values().next().value;

/**
 * Creates a renderer that splits a document into top-level blocks and caches
 * each block's HTML by its source text. An edit only parses the inline content
 * of, and renders (running KaTeX and the sanitiser for), the blocks it changed.
 * The whole document is still split into blocks each time. Blocks whose code
 * was waiting for a language re-render once it loads.
 *
 * Heading ids and footnote numbers depend on the blocks before them, so a
 * cached block also re-renders when its ids change. Each block's output
 * records its slugs and footnote labels, so ids can be assigned without
 * parsing cached blocks. The rare block whose ids changed is parsed in a
 * second pass.
 *
 * The cache holds one output for each source and set of ids, so copies of a
 * repeated block share it.
 */
export function createMarkdownRenderer(options: MarkdownRendererOptions = {}) {
  let cache = new Map<string, Outputs>();
  let definitions = '';
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

  /** Splits a document's block tokens into blocks, finding each one's cached outputs unless it's in `reparse`. */
  const splitBlocks = (source: string, tokens: Token[], env: RenderEnv, reparse: Set<number>): Block[] => {
    // Reference and footnote definitions can change the links in any block.
    // Block parsing has collected them all by now.
    const nextDefinitions = JSON.stringify([env.references ?? {}, [...(env.footnotes ?? [])]]);
    if (nextDefinitions !== definitions) {
      cache.clear();
      definitions = nextDefinitions;
    }

    // Skips cached outputs waiting for a language that has loaded since. Once for each source, not each copy.
    const valid = new Map<string, Outputs>();
    const validOutputs = (text: string): Outputs => {
      let outputs = valid.get(text);
      if (!outputs) {
        const entries = [...(cache.get(text) ?? noOutputs)];
        outputs = new Map(entries.filter(([, output]) => output.waitingFor.every((language) => !language.support)));
        valid.set(text, outputs);
      }
      return outputs;
    };

    // CodeMirror normalises line endings to \n, so line maps index into this.
    const lines = source.split('\n');
    return topLevelBlocks(tokens).map(({ start, end }, index) => {
      const blockTokens = tokens.slice(start, end);
      const firstMap = blockTokens[0].map;
      const lastMap = blockTokens.findLast((token) => token.level === 0 && token.map)?.map;
      const line = firstMap?.[0] ?? 0;
      const endLine = lastMap?.[1] ?? firstMap?.[1] ?? 0;
      const text = firstMap ? lines.slice(line, endLine).join('\n') : undefined;
      const cached = text === undefined || reparse.has(index) ? noOutputs : validOutputs(text);
      return { line, endLine, text, tokens: blockTokens, cached };
    });
  };

  /** Parses a document, skipping the inline content of blocks with cached output. */
  const parse = (source: string, reparse: Set<number>) => {
    let blocks: Block[] = [];
    const env: RenderEnv = {
      selectTokens: (tokens) => {
        blocks = splitBlocks(source, tokens, env, reparse);
        // The core rules after this one edit these token objects in place,
        // so each block's tokens are complete once parsing finishes.
        return blocks.filter((block) => block.cached.size === 0).flatMap((block) => block.tokens);
      },
    };
    markdown.parse(source, env);
    return { blocks, env };
  };

  return (source: string): RenderedBlock[] => {
    let parsed = parse(source, new Set());
    let anchors = parsed.blocks.map((block) => anyOutput(block)?.anchors ?? collectAnchors(block.tokens));
    const ids = assignIds(anchors).map((blockIds) => ({ ids: blockIds, key: JSON.stringify(blockIds) }));
    const stale = new Set(
      parsed.blocks.flatMap((block, index) => (block.cached.size > 0 && !block.cached.has(ids[index].key) ? [index] : [])),
    );
    if (stale.size > 0) {
      // Anchors come from the source alone, so the ids stay the same.
      parsed = parse(source, stale);
      anchors = parsed.blocks.map((block) => anyOutput(block)?.anchors ?? collectAnchors(block.tokens));
    }
    const { blocks, env } = parsed;

    const nextCache = new Map<string, Outputs>();
    const occurrences = new Map<string, number>();
    const footnotes: RenderedFootnote[] = [];
    const rendered = blocks.map((block, index): RenderedBlock => {
      const { ids: blockIds, key } = ids[index];
      const outputs = block.text === undefined ? undefined : (nextCache.get(block.text) ?? new Map());
      // An earlier copy of the block may have rendered it in this pass.
      const output =
        outputs?.get(key) ??
        block.cached.get(key) ??
        ({ ...renderBlock(block.tokens, env, blockIds), anchors: anchors[index], ids: key } satisfies BlockOutput);
      if (outputs) nextCache.set(block.text!, outputs.set(key, output));
      output.waitingFor.forEach(load);
      footnotes.push(...output.footnotes);

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
    if (footnotes.length > 0) rendered.push(footnotesBlock(footnotes, blocks.at(-1)!.endLine));
    return rendered;
  };
}
