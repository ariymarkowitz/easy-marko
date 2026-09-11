import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { bracketMatching, indentOnInput, syntaxHighlighting } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';
import type { Extension } from '@codemirror/state';
import { drawSelection, EditorView, highlightActiveLine, keymap } from '@codemirror/view';
import { classHighlighter, tagHighlighter, tags } from '@lezer/highlight';

// classHighlighter covers code in fenced blocks; this adds classes for the
// markdown syntax it doesn't know about. Colours live in styles/editor.css.
const markdownHighlighter = tagHighlighter([
  { tag: tags.processingInstruction, class: 'tok-mark' },
  { tag: tags.monospace, class: 'tok-code' },
  { tag: tags.quote, class: 'tok-quote' },
  { tag: tags.strikethrough, class: 'tok-strikethrough' },
]);

// Colours come from CSS custom properties, so the editor follows the app
// theme without being reconfigured.
const theme = EditorView.theme({
  '&': {
    height: '100%',
    color: 'var(--color-text)',
    backgroundColor: 'var(--color-bg)',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-editor)',
    lineHeight: '1.6',
  },
  '.cm-content': {
    maxWidth: 'var(--content-width)',
    marginInline: 'auto',
    padding: 'var(--space-6) var(--space-4)',
    caretColor: 'var(--color-accent)',
  },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--color-accent)' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
    { backgroundColor: 'var(--color-selection)' },
  '.cm-activeLine': { backgroundColor: 'var(--color-hover-soft)' },
  '.cm-selectionMatch, .cm-searchMatch': { backgroundColor: 'var(--color-accent-soft)' },
  '.cm-searchMatch-selected, .cm-searchMatch.cm-searchMatch-selected': {
    backgroundColor: 'var(--color-selection)',
  },
  '.cm-panels': {
    backgroundColor: 'var(--color-surface)',
    color: 'var(--color-text)',
    fontFamily: 'var(--font-sans)',
  },
  '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--color-border)' },
  '.cm-textfield, .cm-button': {
    font: 'inherit',
    color: 'inherit',
    backgroundColor: 'var(--color-bg)',
    backgroundImage: 'none',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius)',
  },
});

export const editorExtensions: Extension[] = [
  history(),
  drawSelection(),
  highlightActiveLine(),
  indentOnInput(),
  bracketMatching(),
  highlightSelectionMatches(),
  search({ top: true }),
  markdown({ base: markdownLanguage, codeLanguages: languages }),
  syntaxHighlighting(classHighlighter),
  syntaxHighlighting(markdownHighlighter),
  EditorView.lineWrapping,
  keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap, ...searchKeymap]),
  theme,
];
