// Markdown editing helpers: formatting shortcuts, wrapping a selection in a
// typed marker, pasting a URL over selected text as a link, and bracket
// auto-closing.

import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { markdownLanguage } from '@codemirror/lang-markdown';
import { syntaxTree } from '@codemirror/language';
import { EditorSelection, type EditorState, type Extension, type SelectionRange } from '@codemirror/state';
import { EditorView, keymap, type Command } from '@codemirror/view';

/** Edits each selection range as one transaction, scrolled into view. */
function editRanges(view: EditorView, userEvent: string, edit: Parameters<EditorState['changeByRange']>[0]): void {
  view.dispatch(view.state.changeByRange(edit), { scrollIntoView: true, userEvent });
}

interface Format {
  /** The marker characters that make this format; the first is used to add it. */
  chars: string[];
  /** Markers per side. */
  width: number;
  /** Whether a run of `run` marker characters on both sides includes this format. */
  wraps: (run: number) => boolean;
}

// `***x***` is bold and italic, so italic is an odd run and bold at least two.
const italic: Format = { chars: ['*', '_'], width: 1, wraps: (run) => run % 2 === 1 };
const bold: Format = { chars: ['*', '_'], width: 2, wraps: (run) => run >= 2 };
const strikethrough: Format = { chars: ['~'], width: 2, wraps: (run) => run >= 2 };

const isWordChar = (char: string) => /[\p{L}\p{N}]/u.test(char);

/** How many `char`s are next to `pos`, looking forwards (`dir` 1) or backwards (-1), up to `limit`. */
function runLength(state: EditorState, pos: number, char: string, dir: 1 | -1, limit = Infinity): number {
  let count = 0;
  while (count < limit) {
    const at = dir === 1 ? pos + count : pos - count - 1;
    if (at < 0 || at >= state.doc.length || state.sliceDoc(at, at + 1) !== char) break;
    count++;
  }
  return count;
}

/**
 * Where `format`'s markers around `from`–`to` are, as the positions of the
 * opening and closing markers to remove, or null when they aren't there.
 * Intraword underscores aren't emphasis, so `_` needs a non-word character (or
 * nothing) outside it.
 */
function findMarkers(
  state: EditorState,
  from: number,
  to: number,
  format: Format,
): { open: number; close: number } | null {
  for (const char of format.chars) {
    const flanked = (open: number, close: number) =>
      char !== '_' || !(isWordChar(state.sliceDoc(open - 1, open)) || isWordChar(state.sliceDoc(close, close + 1)));
    // Markers just outside the selection.
    const outside = Math.min(runLength(state, from, char, -1), runLength(state, to, char, 1));
    if (outside > 0 && format.wraps(outside) && flanked(from - outside, to + outside)) {
      return { open: from - format.width, close: to };
    }
    // Markers at the ends of the selection.
    const half = Math.floor((to - from) / 2);
    const inside = Math.min(runLength(state, from, char, 1, half), runLength(state, to, char, -1, half));
    if (inside > 0 && format.wraps(inside) && flanked(from, to)) {
      return { open: from + inside - format.width, close: to - inside };
    }
  }
  return null;
}

/** Wraps or unwraps each selection range in `format`'s markers, keeping the text between them selected. */
function toggleFormat(format: Format): Command {
  return (view) => {
    const { state } = view;
    const w = format.width;
    editRanges(view, 'input.format', (range) => {
      const markers = findMarkers(state, range.from, range.to, format);
      if (markers) {
        const changes = state.changes([
          { from: markers.open, to: markers.open + w },
          { from: markers.close, to: markers.close + w },
        ]);
        return {
          changes,
          range: EditorSelection.range(changes.mapPos(range.from, 1), changes.mapPos(range.to, -1)),
        };
      }
      const marker = format.chars[0].repeat(w);
      return {
        changes: [
          { from: range.from, insert: marker },
          { from: range.to, insert: marker },
        ],
        range: EditorSelection.range(range.from + w, range.to + w),
      };
    });
    return true;
  };
}

/** Whether `text` is a single web or mail URL. */
export function isUrl(text: string): boolean {
  return /^(?:https?:\/\/[^\s/?#]+[^\s]*|mailto:[^\s@]+@[^\s@]+)$/i.test(text);
}

/** `url` as a link destination: in angle brackets when its parentheses don't balance. */
function linkDestination(url: string): string {
  let depth = 0;
  for (const char of url) {
    if (char === '(') depth++;
    else if (char === ')' && --depth < 0) break;
  }
  return depth === 0 && !/[<>]/.test(url) ? url : `<${url.replace(/[<>]/g, encodeURIComponent)}>`;
}

/** A link's `(destination "optional title")`, as regex source. */
const linkTarget = String.raw`\((?:<[^>\n]*>|[^\s)]*(?:\([^\s)]*\)[^\s)]*)*)(?:\s+"[^"\n]*")?\)`;
/** What follows a link's text: `](destination)`. */
const linkAfterText = new RegExp(String.raw`^\]${linkTarget}`);
/** A whole link, capturing its text. */
const wholeLink = new RegExp(String.raw`^\[([^\]\n]*)\]${linkTarget}$`);

/**
 * Makes each selection range a link, with the cursor where the URL goes (or in
 * the link text when the selection is a URL). Unlinks a range that is a link's
 * text or a whole link.
 */
const toggleLink: Command = (view) => {
  const { state } = view;
  editRanges(view, 'input.format', (range) => {
    const text = state.sliceDoc(range.from, range.to);
    const rest = linkAfterText.exec(state.sliceDoc(range.to, state.doc.lineAt(range.to).to));
    if (state.sliceDoc(range.from - 1, range.from) === '[' && rest && !text.includes(']')) {
      return {
        changes: [
          { from: range.from - 1, to: range.from },
          { from: range.to, to: range.to + rest[0].length },
        ],
        range: EditorSelection.range(range.from - 1, range.to - 1),
      };
    }
    const whole = wholeLink.exec(text);
    if (whole) {
      return {
        changes: [{ from: range.from, to: range.to, insert: whole[1] }],
        range: EditorSelection.range(range.from, range.from + whole[1].length),
      };
    }
    if (isUrl(text)) {
      return {
        changes: [{ from: range.from, to: range.to, insert: `[](${linkDestination(text)})` }],
        range: EditorSelection.cursor(range.from + 1),
      };
    }
    const cursor = range.empty ? range.from + 1 : range.to + 3;
    return {
      changes: [
        { from: range.from, insert: '[' },
        { from: range.to, insert: ']()' },
      ],
      range: EditorSelection.cursor(cursor),
    };
  });
  return true;
};

// Markdown text isn't code, so quotes (apostrophes) don't auto-close there.
// Fenced code keeps its own language's brackets.
const markdownBrackets = markdownLanguage.data.of({ closeBrackets: { brackets: ['(', '[', '{'] } });

const codeNodes = new Set([
  'FencedCode',
  'CodeBlock',
  'InlineCode',
  'CodeText',
  'HTMLBlock',
  'CommentBlock',
  'FrontmatterContent',
]);

/** Whether `pos` is in code, where Markdown markers are literal. */
function inCode(state: EditorState, pos: number): boolean {
  const cursor = syntaxTree(state).cursorAt(pos, -1);
  do {
    if (codeNodes.has(cursor.name)) return true;
  } while (cursor.parent());
  return false;
}

const wrapMarkers = new Set(['*', '_', '`', '~']);

/**
 * The opening marker that wraps `text` in `marker`; the closing one is its
 * reverse. Code spans need a backtick run longer than any inside, padded when
 * the text starts or ends with a backtick.
 */
function wrapping(text: string, marker: string): string {
  if (marker !== '`') return marker;
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  return '`'.repeat(longest + 1) + (/^`|`$/.test(text) ? ' ' : '');
}

/** Typing `*`, `_`, `~` or `` ` `` over selected text wraps it instead of replacing it. */
const wrapSelection = EditorView.inputHandler.of((view, from, to, text) => {
  const { state } = view;
  if (view.composing || !wrapMarkers.has(text) || state.readOnly) return false;
  if (state.selection.ranges.every((range) => range.empty)) return false;
  if (from !== state.selection.main.from || to !== state.selection.main.to) return false;
  if (state.selection.ranges.some((range) => !range.empty && inCode(state, range.from))) return false;
  editRanges(view, 'input.type', (range) => {
    if (range.empty) {
      return { changes: [{ from: range.from, insert: text }], range: EditorSelection.cursor(range.from + 1) };
    }
    const selected = state.sliceDoc(range.from, range.to);
    const open = wrapping(selected, text);
    const close = [...open].reverse().join('');
    return {
      changes: [
        { from: range.from, insert: open },
        { from: range.to, insert: close },
      ],
      range: EditorSelection.range(range.from + open.length, range.to + open.length),
    };
  });
  return true;
});

/** Pasting a URL over selected text (outside code) links the text to it. */
const pasteLink = EditorView.domEventHandlers({
  paste: (event, view) => {
    const url = event.clipboardData?.getData('text/plain').trim() ?? '';
    const { state } = view;
    if (!isUrl(url) || state.readOnly) return false;
    const linkable = (range: SelectionRange) => {
      const text = state.sliceDoc(range.from, range.to);
      return !range.empty && !text.includes('\n') && !isUrl(text.trim()) && !inCode(state, range.from);
    };
    if (!state.selection.ranges.every(linkable)) return false;
    const destination = linkDestination(url);
    editRanges(view, 'input.paste', (range) => {
      const insert = `[${state.sliceDoc(range.from, range.to)}](${destination})`;
      return {
        changes: [{ from: range.from, to: range.to, insert }],
        range: EditorSelection.cursor(range.from + insert.length),
      };
    });
    event.preventDefault();
    return true;
  },
});

const formattingKeymap = keymap.of([
  { key: 'Mod-b', run: toggleFormat(bold) },
  { key: 'Mod-i', run: toggleFormat(italic) },
  { key: 'Mod-k', run: toggleLink },
  { key: 'Mod-Shift-x', run: toggleFormat(strikethrough) },
]);

export const formattingExtensions: Extension[] = [
  markdownBrackets,
  closeBrackets(),
  keymap.of(closeBracketsKeymap),
  wrapSelection,
  pasteLink,
  formattingKeymap,
];
