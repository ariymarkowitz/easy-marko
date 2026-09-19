import type { LanguageDescription } from '@codemirror/language';
import MarkdownIt, { type Env, type StateCore, type Token } from 'markdown-it';
import { findLanguage, highlight } from './highlight';
import { githubAlerts } from './markdown-alerts';
import { topLevelBlocks } from './markdown-blocks';
import {
  extractFootnotes,
  footnoteMeta,
  footnoteRefId,
  footnotes,
  footnotesListHtml,
  type FootnoteDefMeta,
  type FootnoteEnv,
  type FootnoteRefMeta,
} from './markdown-footnotes';
import { frontMatterBlock } from './markdown-front-matter';
import { maths } from './markdown-math';
import { taskLists } from './markdown-tasks';
import { allMaybe, type MaybePromise, thenMaybe } from './maybe-promise';
import { sanitizeHtml } from './sanitize';
import { createSlugger, slugify } from './slug';

export interface RenderedBlock {
  /** Stable identity for keyed rendering: the block's source, disambiguated when repeated. */
  key: string;
  /** Zero-based source line the block starts on. */
  line: number;
  /** Zero-based source line just past the block's end. */
  endLine: number;
  /** Sanitised HTML, or a promise of it while the languages of its code load. */
  html: MaybePromise<string>;
}

interface RenderEnv extends Env, FootnoteEnv {
  /** Given the document's block tokens, returns the ones that still need parsing. */
  selectTokens?: (tokens: Token[]) => Token[];
}

// Runs after the document is split into blocks, before their inline content
// is parsed. createMarkdownRenderer uses it to drop the blocks it has cached
// HTML for, so they skip inline parsing and the core rules after it
// (linkify, typographer, task lists). Without selectTokens it does nothing.
function selectTokens(state: StateCore): void {
  const { selectTokens } = state.env as RenderEnv;
  if (selectTokens) state.tokens = selectTokens(state.tokens);
}

// Raw HTML is allowed because every rendered block goes through sanitizeHtml.
export const markdown = new MarkdownIt({ html: true, linkify: true, typographer: true })
  .use(frontMatterBlock)
  .use(maths)
  .use(footnotes)
  .use(githubAlerts)
  .use(taskLists)
  .use((md) => md.core.ruler.before('inline', 'select_tokens', selectTokens));

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

const sourceTokens = new Set(['text', 'code_inline', 'math_inline']);

/** The text a heading's slug comes from: markup is dropped, code and maths keep their source. */
function plainText(tokens: Token[]): string {
  return tokens.map((token) => (sourceTokens.has(token.type) ? token.content : '')).join('');
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
  const withoutDefs = blocks.map((block): Omit<BlockIds, 'defs'> => ({
    headings: block.headings.map((heading) => (heading ? slug(heading) : '')),
    refs: block.refs.map((label) => {
      if (!numbers.has(label)) numbers.set(label, numbers.size + 1);
      const occurrence = (references.get(label) ?? 0) + 1;
      references.set(label, occurrence);
      return [numbers.get(label)!, occurrence];
    }),
  }));
  // Definitions need every reference counted, including ones after them.
  const shown = new Set<string>();
  return blocks.map((block, index) => ({
    ...withoutDefs[index],
    defs: block.defs.map((label) => {
      const number = numbers.get(label);
      if (number === undefined || shown.has(label)) return [0, 0];
      shown.add(label);
      return [number, references.get(label)!];
    }),
  }));
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

interface RenderedFootnote {
  number: number;
  /** Sanitised HTML of the note's content. */
  html: string;
}

interface Rendered {
  html: string;
  /** The notes the block defines that are shown, for the footnotes list. */
  footnotes: RenderedFootnote[];
}

interface BlockOutput {
  /** A promise while the languages of the block's code load. */
  rendered: MaybePromise<Rendered>;
  anchors: BlockAnchors;
}

/** Loads of code languages, started once each. Each settles when its language has loaded or failed to. */
const languageLoads = new Map<LanguageDescription, Promise<void>>();

function loadLanguage(language: LanguageDescription): Promise<void> {
  let load = languageLoads.get(language);
  if (!load) {
    load = language.load().then(
      () => undefined,
      (error: unknown) => console.error(`Couldn't load ${language.name} highlighting`, error),
    );
    languageLoads.set(language, load);
  }
  return load;
}

/**
 * Renders a block's tokens to sanitised HTML with its code highlighted. A
 * promise if a language of its code hasn't loaded, which renders the block
 * again once it has. Code in a language that failed to load stays plain.
 */
function renderBlock(tokens: Token[], env: RenderEnv, ids: BlockIds, wait = true): MaybePromise<Rendered> {
  applyIds(tokens, ids);
  const loads = new Set<Promise<void>>();
  const options = {
    ...markdown.options,
    // Returning '' makes markdown-it escape the code as plain text.
    highlight: (code: string, name: string) => {
      const language = findLanguage(name);
      if (!language) return '';
      if (wait && !language.support) loads.add(loadLanguage(language));
      return highlight(code, language) ?? '';
    },
  };
  const render = (part: Token[]) => sanitizeHtml(markdown.renderer.render(part, options, env));

  // Notes render in the footnotes list at the end, not where they're defined.
  const { body, notes } = extractFootnotes(tokens);
  const footnotes = notes.map((note) => ({ number: note.number, html: render(note.content) }));
  const html = render(body);
  if (loads.size === 0) return { html, footnotes };
  return Promise.all(loads).then(() => renderBlock(tokens, env, ids, false));
}

/** A block's output, which is kept once its rendering settles, so later renders use it straight away. */
function blockOutput(rendered: MaybePromise<Rendered>, anchors: BlockAnchors): BlockOutput {
  const output = { rendered, anchors };
  if (rendered instanceof Promise) void rendered.then((settled) => (output.rendered = settled));
  return output;
}

/** The footnotes list of the blocks' notes, placed after the last block. */
function footnotesBlock(blocks: MaybePromise<Rendered>[], line: number): RenderedBlock {
  const html = thenMaybe(allMaybe(blocks), (all) => footnotesListHtml(all.flatMap((block) => block.footnotes)));
  return { key: '\0footnotes', line, endLine: line, html };
}

interface Block {
  line: number;
  endLine: number;
  /** The block's source, which keys the cache. Undefined if the block has no line map. */
  text?: string;
  tokens: Token[];
  /** Cached outputs for the block's source, keyed by the ids they rendered with. Empty if it was parsed. */
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
 * The whole document is still split into blocks each time. A block with code
 * in a language that hasn't loaded has HTML that's a promise until it has.
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
export function createMarkdownRenderer() {
  let cache = new Map<string, Outputs>();
  let definitions = '';

  /** Splits a document's block tokens into blocks, finding each one's cached outputs unless it's in `reparse`. */
  const splitBlocks = (source: string, tokens: Token[], env: RenderEnv, reparse: Set<number>): Block[] => {
    // Reference and footnote definitions can change the links in any block.
    // Block parsing has collected them all by now.
    const nextDefinitions = JSON.stringify([env.references ?? {}, [...(env.footnotes ?? [])]]);
    if (nextDefinitions !== definitions) {
      cache.clear();
      definitions = nextDefinitions;
    }

    // CodeMirror normalises line endings to \n, so line maps index into this.
    const lines = source.split('\n');
    return topLevelBlocks(tokens).map(({ start, end }, index) => {
      const blockTokens = tokens.slice(start, end);
      const firstMap = blockTokens[0].map;
      const lastMap = blockTokens.findLast((token) => token.level === 0 && token.map)?.map;
      const line = firstMap?.[0] ?? 0;
      const endLine = lastMap?.[1] ?? firstMap?.[1] ?? 0;
      const text = firstMap ? lines.slice(line, endLine).join('\n') : undefined;
      const cached = text === undefined || reparse.has(index) ? noOutputs : (cache.get(text) ?? noOutputs);
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
    const anchors = parsed.blocks.map((block) => anyOutput(block)?.anchors ?? collectAnchors(block.tokens));
    const ids = assignIds(anchors).map((blockIds) => ({ ids: blockIds, key: JSON.stringify(blockIds) }));
    const stale = new Set(
      parsed.blocks.flatMap((block, index) => (block.cached.size > 0 && !block.cached.has(ids[index].key) ? [index] : [])),
    );
    // Anchors come from the source alone, so reparsing leaves them and the ids the same.
    if (stale.size > 0) parsed = parse(source, stale);
    const { blocks, env } = parsed;

    const nextCache = new Map<string, Outputs>();
    const occurrences = new Map<string, number>();
    const outputs: BlockOutput[] = [];
    const rendered = blocks.map((block, index): RenderedBlock => {
      const { ids: blockIds, key } = ids[index];
      const textOutputs = block.text === undefined ? undefined : (nextCache.get(block.text) ?? new Map());
      // An earlier copy of the block may have rendered it in this pass.
      const output: BlockOutput =
        textOutputs?.get(key) ??
        block.cached.get(key) ??
        blockOutput(renderBlock(block.tokens, env, blockIds), anchors[index]);
      if (textOutputs) nextCache.set(block.text!, textOutputs.set(key, output));
      outputs.push(output);

      const id = block.text ?? `\0block:${index}`;
      const seen = occurrences.get(id) ?? 0;
      occurrences.set(id, seen + 1);
      return {
        key: seen === 0 ? id : `${id}\0${seen}`,
        line: block.line,
        endLine: block.endLine,
        html: thenMaybe(output.rendered, (rendered) => rendered.html),
      };
    });

    cache = nextCache;
    // Whether a note is shown depends only on the ids, so this is known before every block has rendered.
    if (ids.some(({ ids: blockIds }) => blockIds.defs.some(([number]) => number > 0))) {
      rendered.push(footnotesBlock(outputs.map((output) => output.rendered), blocks.at(-1)!.endLine));
    }
    return rendered;
  };
}
