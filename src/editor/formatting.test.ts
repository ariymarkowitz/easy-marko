import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView, runScopeHandlers } from '@codemirror/view';
import { afterEach, describe, expect, test } from 'vitest';
import { editorExtensions } from './extensions';
import { isUrl } from './formatting';

let view: EditorView | undefined;

afterEach(() => {
  view?.destroy();
  view = undefined;
});

/**
 * An editor holding `doc`, where `|` marks a cursor and `<`…`>` a selection.
 * Several of either make several ranges.
 */
function editor(doc: string): EditorView {
  const ranges = [];
  let text = '';
  let start = -1;
  for (const char of doc) {
    if (char === '|') ranges.push(EditorSelection.cursor(text.length));
    else if (char === '<') start = text.length;
    else if (char === '>') ranges.push(EditorSelection.range(start, text.length));
    else text += char;
  }
  view = new EditorView({
    state: EditorState.create({
      doc: text,
      selection: EditorSelection.create(ranges),
      extensions: [editorExtensions, EditorState.allowMultipleSelections.of(true)],
    }),
    parent: document.body,
  });
  return view;
}

/** The document with its selection marked as `editor` takes it. */
function marked(target: EditorView): string {
  let doc = target.state.doc.toString();
  for (const range of [...target.state.selection.ranges].reverse()) {
    doc = range.empty
      ? `${doc.slice(0, range.from)}|${doc.slice(range.from)}`
      : `${doc.slice(0, range.from)}<${doc.slice(range.from, range.to)}>${doc.slice(range.to)}`;
  }
  return doc;
}

const isMac = /Mac/.test(navigator.platform);

function press(target: EditorView, key: string, shift = false): string {
  const event = new KeyboardEvent('keydown', { key, shiftKey: shift, metaKey: isMac, ctrlKey: !isMac });
  runScopeHandlers(target, event, 'editor');
  return marked(target);
}

/** Types `text` as CodeMirror's input handling would, through the input handlers first. */
function type(target: EditorView, text: string): string {
  const { from, to } = target.state.selection.main;
  const insert = () => target.state.update(target.state.replaceSelection(text));
  const handled = target.state.facet(EditorView.inputHandler).some((handler) => handler(target, from, to, text, insert));
  if (!handled) target.dispatch(insert());
  return marked(target);
}

function paste(target: EditorView, text: string): string {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { getData: () => text } });
  target.contentDOM.dispatchEvent(event);
  return marked(target);
}

describe('formatting shortcuts', () => {
  test.each([
    ['bold wraps a selection', 'a <b> c', 'b', false, 'a **<b>** c'],
    ['bold unwraps markers around the selection', 'a **<b>** c', 'b', false, 'a <b> c'],
    ['bold unwraps markers in the selection', 'a <**b**> c', 'b', false, 'a <b> c'],
    ['bold unwraps underscores', '__<b>__', 'b', false, '<b>'],
    ['bold inserts markers at a cursor', 'a |', 'b', false, 'a **|**'],
    ['bold removes empty markers', 'a **|**', 'b', false, 'a |'],
    ['bold leaves italic in bold italic', '***<b>***', 'b', false, '*<b>*'],
    ['italic wraps a selection', '<b>', 'i', false, '*<b>*'],
    ['italic wraps bold text', '**<b>**', 'i', false, '***<b>***'],
    ['italic unwraps markers', '*<b>*', 'i', false, '<b>'],
    ['italic leaves bold in bold italic', '<***b***>', 'i', false, '<**b**>'],
    ['italic unwraps underscores', '_<b>_', 'i', false, '<b>'],
    ['italic ignores intraword underscores', 'snake_<case>_name', 'i', false, 'snake_*<case>*_name'],
    ['strikethrough wraps a selection', '<b>', 'x', true, '~~<b>~~'],
    ['strikethrough unwraps markers', '~~<b>~~', 'x', true, '<b>'],
    ['each range toggles', '<a> **<b>**', 'b', false, '**<a>** <b>'],
  ])('%s', (_, doc, key, shift, expected) => {
    expect(press(editor(doc), key, shift)).toBe(expected);
  });

  test.each([
    ['links a selection, with the cursor for the URL', 'a <b> c', 'a [b](|) c'],
    ['inserts an empty link at a cursor', 'a |', 'a [|]()'],
    ['links a selected URL, with the cursor for the text', '<https://example.com>', '[|](https://example.com)'],
    ['unlinks selected link text', '[<b>](https://example.com) c', '<b> c'],
    ['unlinks a selected link', '<[b](https://example.com "Title")> c', '<b> c'],
  ])('link %s', (_, doc, expected) => {
    expect(press(editor(doc), 'k')).toBe(expected);
  });
});

describe('typing markers and brackets', () => {
  test.each([
    ['* wraps a selection', '<b>', '*', '*<b>*'],
    ['_ wraps a selection', '<b>', '_', '_<b>_'],
    ['` wraps a selection', '<b>', '`', '`<b>`'],
    ['` wraps backticks in a longer run', '<a`b>', '`', '``<a`b>``'],
    ['` pads text starting with a backtick', '<`a>', '`', '`` <`a> ``'],
    ['* at a cursor just types', 'a |', '*', 'a *|'],
    ['* in code replaces the selection', '`a <b> c`', '*', '`a *| c`'],
    ['( closes at a cursor', 'a |', '(', 'a (|)'],
    ['[ wraps a selection', '<b>', '[', '[<b>]'],
    ["' doesn't close in text", 'a |', "'", "a '|"],
  ])('%s', (_, doc, text, expected) => {
    expect(type(editor(doc), text)).toBe(expected);
  });
});

describe('pasting a URL', () => {
  test.each([
    ['links selected text', 'a <b> c', 'https://example.com', 'a [b](https://example.com)| c'],
    ['trims the URL', '<b>', ' https://example.com\n', '[b](https://example.com)|'],
    ['keeps balanced parentheses', '<b>', 'https://w.org/A_(b)', '[b](https://w.org/A_(b))|'],
    ['brackets unbalanced parentheses', '<b>', 'https://w.org/A)', '[b](<https://w.org/A)>)|'],
    ['links mailto URLs', '<me>', 'mailto:me@example.com', '[me](mailto:me@example.com)|'],
  ])('%s', (_, doc, url, expected) => {
    expect(paste(editor(doc), url)).toBe(expected);
  });

  test.each([
    ['nothing is selected', 'a |'],
    ['the clipboard is not a URL', 'a <b>', 'not a url'],
    ['the selection is a URL', '<https://a.com>'],
    ['the selection is in code', '`<b>`'],
    ['the selection spans lines', '<a\nb>'],
  ])('pastes as usual when %s', (_, doc, url = 'https://example.com') => {
    expect(paste(editor(doc), url)).not.toContain('](');
  });
});

test.each([
  ['https://example.com/a?b#c', true],
  ['HTTP://EXAMPLE.COM', true],
  ['mailto:a@b.c', true],
  ['https://', false],
  ['example.com', false],
  ['https://a.com and more', false],
  ['javascript:alert(1)', false],
])('isUrl(%j) is %s', (text, expected) => {
  expect(isUrl(text)).toBe(expected);
});
