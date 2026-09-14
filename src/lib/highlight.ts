// Syntax highlighting for fenced code in the preview. Uses the same lazily
// loaded Lezer parsers as the source pane and the same tok-* classes, so code
// is coloured alike in both (styles/editor.css).

import { yamlLanguage } from '@codemirror/lang-yaml';
import { LanguageDescription } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { classHighlighter, highlightCode, tagHighlighter, tags } from '@lezer/highlight';
import { escapeHtml } from './escape-html';

/**
 * Adds `tok-yamlKey` to YAML keys, so they carry the highlighting: YAML leaves
 * plain values untyped. Scoped to YAML, since other languages have property
 * names too.
 */
export const yamlKeyHighlighter = tagHighlighter([{ tag: tags.propertyName, class: 'tok-yamlKey' }], {
  scope: (node) => node === yamlLanguage.parser.topNode,
});

/** The language a fence names. Matches fuzzily, like the source pane, so `js` finds JavaScript. */
export function findLanguage(name: string): LanguageDescription | undefined {
  if (!name) return undefined;
  return LanguageDescription.matchLanguageName(languages, name, true) ?? undefined;
}

/** `code` as highlighted HTML, or undefined if its language hasn't loaded yet. */
export function highlight(code: string, language: LanguageDescription): string | undefined {
  if (!language.support) return undefined;
  let html = '';
  highlightCode(
    code,
    language.support.language.parser.parse(code),
    [classHighlighter, yamlKeyHighlighter],
    (text, classes) => {
      html += classes ? `<span class="${classes}">${escapeHtml(text)}</span>` : escapeHtml(text);
    },
    () => {
      html += '\n';
    },
  );
  return html;
}
