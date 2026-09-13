// Footnote syntax: `[^label]` references and `[^label]: text` definitions,
// whose indented continuation lines belong to the note. This only parses and
// renders the pieces. Numbering depends on the whole document, so the
// renderer in markdown.ts assigns it and gathers the notes into a list.

import type { MarkdownIt, StateBlock, StateInline, Token } from 'markdown-it';

export interface FootnoteEnv {
  /** Normalised labels of the document's footnote definitions, filled in by block parsing. */
  footnotes?: Set<string>;
}

/** Meta on `footnote_ref` tokens. The renderer adds the number and id before rendering. */
export interface FootnoteRefMeta {
  label: string;
  number?: number;
  /** The reference's element id: repeated references to one note get distinct ids. */
  id?: string;
}

/** Meta on `footnote_def_open` tokens. The renderer adds the number (0 if the note isn't shown) and reference count. */
export interface FootnoteDefMeta {
  label: string;
  number?: number;
  references?: number;
}

/** Meta on `footnote_backrefs` tokens, set by the renderer: links back to each of the note's references. */
export interface FootnoteBackrefsMeta {
  number: number;
  count: number;
}

export const footnoteMeta = <Meta extends FootnoteRefMeta | FootnoteDefMeta | FootnoteBackrefsMeta>(token: Token) =>
  token.meta as unknown as Meta;

/** The id of note `number` in the footnotes list. */
export const footnoteId = (number: number) => `fn-${number}`;

/** The id of the `occurrence`th (from 1) reference to note `number`. */
export const footnoteRefId = (number: number, occurrence: number) =>
  occurrence === 1 ? `fnref-${number}` : `fnref-${number}-${occurrence}`;

function footnoteDef(state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean {
  const { src } = state;
  const start = state.bMarks[startLine] + state.tShift[startLine];
  const max = state.eMarks[startLine];
  if (state.sCount[startLine] - state.blkIndent >= 4) return false;
  if (src.charCodeAt(start) !== 0x5b /* [ */ || src.charCodeAt(start + 1) !== 0x5e /* ^ */) return false;

  let pos = start + 2;
  while (pos < max && src.charCodeAt(pos) !== 0x5d /* ] */) {
    if (state.md.utils.isSpace(src.charCodeAt(pos))) return false;
    pos++;
  }
  if (pos === start + 2 || pos + 1 >= max || src.charCodeAt(pos + 1) !== 0x3a /* : */) return false;
  if (silent) return true;

  const label = state.md.utils.normalizeReference(src.slice(start + 2, pos));
  const env = state.env as FootnoteEnv;
  (env.footnotes ??= new Set()).add(label);

  const open = state.push('footnote_def_open', '', 1);
  open.meta = { label } satisfies FootnoteDefMeta;

  // Parse the rest of the line and the indented lines after it as the note's
  // blocks, the way a list item's content is parsed.
  pos += 2;
  const oldBMark = state.bMarks[startLine];
  const oldTShift = state.tShift[startLine];
  const oldSCount = state.sCount[startLine];
  const oldParentType = state.parentType;
  const contentStart = pos;
  const initial = state.sCount[startLine] + pos - start;
  let offset = initial;
  for (; pos < max; pos++) {
    const code = src.charCodeAt(pos);
    if (code === 0x09) offset += 4 - (offset % 4);
    else if (code === 0x20) offset++;
    else break;
  }
  state.bMarks[startLine] = contentStart;
  state.tShift[startLine] = pos - contentStart;
  state.sCount[startLine] = offset - initial;
  state.blkIndent += 4;
  state.parentType = 'footnote' as typeof state.parentType;
  if (state.sCount[startLine] < state.blkIndent) state.sCount[startLine] += state.blkIndent;

  state.md.block.tokenize(state, startLine, endLine);

  state.parentType = oldParentType;
  state.blkIndent -= 4;
  state.bMarks[startLine] = oldBMark;
  state.tShift[startLine] = oldTShift;
  state.sCount[startLine] = oldSCount;

  // Links back to the note's references go at the end of its last paragraph,
  // or in a paragraph of their own.
  const last = state.tokens.at(-1)!;
  if (last.type === 'paragraph_close' && last !== open) {
    const backrefs = new state.Token('footnote_backrefs', '', 0);
    backrefs.level = last.level + 1;
    state.tokens.splice(-1, 0, backrefs);
  } else {
    state.push('paragraph_open', 'p', 1).block = true;
    state.push('footnote_backrefs', '', 0);
    state.push('paragraph_close', 'p', -1).block = true;
  }

  open.map = [startLine, state.line];
  state.push('footnote_def_close', '', -1);
  return true;
}

function footnoteRef(state: StateInline, silent: boolean): boolean {
  const { src, pos, posMax } = state;
  if (src.charCodeAt(pos) !== 0x5b /* [ */ || src.charCodeAt(pos + 1) !== 0x5e /* ^ */) return false;
  const end = src.indexOf(']', pos + 2);
  if (end === -1 || end >= posMax || end === pos + 2) return false;
  const raw = src.slice(pos + 2, end);
  if (/\s/.test(raw)) return false;

  // A reference to a note that isn't defined stays text.
  const label = state.md.utils.normalizeReference(raw);
  if (!(state.env as FootnoteEnv).footnotes?.has(label)) return false;
  if (!silent) {
    const token = state.push('footnote_ref', '', 0);
    token.meta = { label } satisfies FootnoteRefMeta;
  }
  state.pos = end + 1;
  return true;
}

export function footnotes(md: MarkdownIt): void {
  md.block.ruler.before('reference', 'footnote_def', footnoteDef, { alt: ['paragraph', 'reference'] });
  md.inline.ruler.before('link', 'footnote_ref', footnoteRef);

  md.renderer.rules.footnote_ref = (tokens, idx) => {
    const { label, number, id } = footnoteMeta<FootnoteRefMeta>(tokens[idx]);
    if (number === undefined) return md.utils.escapeHtml(`[^${label}]`);
    return `<sup class="footnote-ref"><a href="#${footnoteId(number)}" id="${id}">${number}</a></sup>`;
  };

  md.renderer.rules.footnote_backrefs = (tokens, idx) => {
    const { number, count } = footnoteMeta<FootnoteBackrefsMeta>(tokens[idx]);
    let html = '';
    for (let occurrence = 1; occurrence <= count; occurrence++) {
      const label = count === 1 ? 'Back to reference' : `Back to reference ${occurrence}`;
      // U+FE0E keeps the arrow as text rather than an emoji.
      html += ` <a href="#${footnoteRefId(number, occurrence)}" class="footnote-backref" aria-label="${label}">↩︎${occurrence > 1 ? `<sup>${occurrence}</sup>` : ''}</a>`;
    }
    return html;
  };
}
