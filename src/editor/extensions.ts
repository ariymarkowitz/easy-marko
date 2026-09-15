import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { yamlFrontmatter } from '@codemirror/lang-yaml';
import { bracketMatching, indentOnInput, syntaxHighlighting } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';
import type { Extension } from '@codemirror/state';
import { drawSelection, EditorView, highlightActiveLine, keymap } from '@codemirror/view';
import { classHighlighter, tagHighlighter, tags } from '@lezer/highlight';
import { carriesFiles } from '../lib/files';
import { codeHighlighter, yamlKeyHighlighter } from '../lib/highlight';
import { formattingExtensions } from './formatting';
import { mathSyntax, mathTag } from './math';
import { createSearchPanel } from './search-panel';

// classHighlighter covers code in fenced blocks; this adds classes for the
// Markdown syntax it doesn't know about. Colours live in styles/editor.css.
const markdownHighlighter = tagHighlighter([
  { tag: tags.processingInstruction, class: 'tok-mark' },
  { tag: mathTag, class: 'tok-math' },
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
    // The pane paints the background, inside its rounded border.
    backgroundColor: 'transparent',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: 'var(--font-mono)',
    fontVariantLigatures: 'none',
    fontSize: 'var(--text-editor)',
    lineHeight: '1.6',
  },
  '.cm-content': {
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
    fontSize: 'var(--text-ui)',
  },
  '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--color-border)' },
});

// Files dropped on the editor open as documents (see state/file-drop.ts), so
// don't insert their contents too. Dragged text still drops into the editor.
const ignoreFileDrops = EditorView.domEventHandlers({
  drop: (event) => carriesFiles(event.dataTransfer),
});

export const editorExtensions: Extension[] = [
  ignoreFileDrops,
  EditorView.contentAttributes.of({ 'aria-label': 'Markdown source' }),
  history(),
  drawSelection(),
  highlightActiveLine(),
  indentOnInput(),
  bracketMatching(),
  highlightSelectionMatches(),
  search({ top: true, createPanel: createSearchPanel }),
  // YAML front matter at the top parses as YAML, as the preview renders it.
  yamlFrontmatter({
    // Pasting a URL as a link is in ./formatting, which also trims and checks the URL.
    content: markdown({ base: markdownLanguage, codeLanguages: languages, extensions: mathSyntax, pasteURLAsLink: false }),
  }),
  syntaxHighlighting(classHighlighter),
  syntaxHighlighting(markdownHighlighter),
  syntaxHighlighting(codeHighlighter),
  syntaxHighlighting(yamlKeyHighlighter),
  EditorView.lineWrapping,
  // Before the default keymap, whose Mod-i selects the parent syntax node.
  formattingExtensions,
  keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap, ...searchKeymap]),
  theme,
];
