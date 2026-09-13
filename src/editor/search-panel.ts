// The find and replace panel, in place of CodeMirror's default one: icon
// toggles inside the find field, a match count, and icon buttons.

import {
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  replaceAll,
  replaceNext,
  SearchQuery,
  selectMatches,
  setSearchQuery,
} from '@codemirror/search';
import type { EditorState } from '@codemirror/state';
import { type EditorView, type Panel, runScopeHandlers, type ViewUpdate } from '@codemirror/view';
import { CaseSensitive, ChevronDown, ChevronUp, type IconNode, Regex, Replace, ReplaceAll, WholeWord, X } from 'lucide';
import { iconSvg } from '../lib/icon-markup';

/** Counting stops here, so a search in a long document stays quick. */
const COUNT_LIMIT = 1000;

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { class?: string },
  children: Node[] = [],
): HTMLElementTagNameMap[K] {
  const { class: className, ...rest } = props;
  const node = Object.assign(document.createElement(tag), rest);
  if (className) node.className = className;
  node.append(...children);
  return node;
}

function iconButton(icon: IconNode, label: string, onClick: () => void, className = ''): HTMLButtonElement {
  const button = element('button', { type: 'button', title: label, class: `icon-button ${className}`.trim() });
  button.setAttribute('aria-label', label);
  button.innerHTML = iconSvg(icon, 'icon');
  button.addEventListener('click', onClick);
  return button;
}

/** "3 of 12", or why there's no count. */
function matchCount(state: EditorState, query: SearchQuery): string {
  if (!query.search) return '';
  if (!query.valid) return 'Invalid';
  const { from, to } = state.selection.main;
  const cursor = query.getCursor(state);
  let total = 0;
  let current = 0;
  for (let next = cursor.next(); !next.done; next = cursor.next()) {
    total++;
    if (next.value.from === from && next.value.to === to) current = total;
    if (total >= COUNT_LIMIT) return `${COUNT_LIMIT}+`;
  }
  if (total === 0) return 'No results';
  if (current) return `${current} of ${total}`;
  return total === 1 ? '1 match' : `${total} matches`;
}

export function createSearchPanel(view: EditorView): Panel {
  let query = getSearchQuery(view.state);

  const searchField = element('input', { class: 'search-field', placeholder: 'Find', value: query.search });
  const replaceField = element('input', { class: 'search-field', placeholder: 'Replace', value: query.replace });
  searchField.setAttribute('aria-label', 'Find');
  replaceField.setAttribute('aria-label', 'Replace');
  // openSearchPanel focuses and selects the element with this attribute.
  searchField.setAttribute('main-field', 'true');

  const toggles = {
    caseSensitive: iconButton(CaseSensitive, 'Match case', () => toggle('caseSensitive'), 'search-toggle'),
    wholeWord: iconButton(WholeWord, 'Match whole word', () => toggle('wholeWord'), 'search-toggle'),
    regexp: iconButton(Regex, 'Use regular expression', () => toggle('regexp'), 'search-toggle'),
  };
  const count = element('span', { class: 'search-count' });
  count.setAttribute('aria-live', 'polite');

  const commit = (changes: Partial<SearchQuery> = {}) => {
    const next = new SearchQuery({
      search: searchField.value,
      replace: replaceField.value,
      caseSensitive: query.caseSensitive,
      wholeWord: query.wholeWord,
      regexp: query.regexp,
      ...changes,
    });
    if (next.eq(query)) return;
    query = next;
    view.dispatch({ effects: setSearchQuery.of(next) });
  };

  const toggle = (option: keyof typeof toggles) => {
    commit({ [option]: !query[option] });
  };

  const show = () => {
    // Only when changed: assigning a value moves the caret to the end.
    if (searchField.value !== query.search) searchField.value = query.search;
    if (replaceField.value !== query.replace) replaceField.value = query.replace;
    for (const [option, button] of Object.entries(toggles)) {
      button.setAttribute('aria-pressed', String(query[option as keyof typeof toggles]));
    }
    searchField.classList.toggle('invalid', !!query.search && !query.valid);
    count.textContent = matchCount(view.state, query);
  };

  searchField.addEventListener('input', () => commit());
  replaceField.addEventListener('input', () => commit());

  // A row for find and a row for replace, with the count at the end of the
  // replace row. The panel is a container, so styles/base.css can drop parts
  // of it when it's narrow.
  const readOnly = view.state.readOnly;
  const replaceControls = [
    element('div', { class: 'search-input' }, [replaceField]),
    iconButton(Replace, 'Replace', () => replaceNext(view)),
    iconButton(ReplaceAll, 'Replace all', () => replaceAll(view)),
  ];
  for (const control of replaceControls) control.hidden = readOnly;
  const grid = element('div', { class: 'search-grid' }, [
    element('div', { class: 'search-row' }, [
      element('div', { class: 'search-input' }, [searchField, ...Object.values(toggles)]),
      iconButton(ChevronUp, 'Previous match', () => findPrevious(view)),
      iconButton(ChevronDown, 'Next match', () => findNext(view)),
      iconButton(X, 'Close', () => closeSearchPanel(view)),
    ]),
    element('div', { class: 'search-row' }, [...replaceControls, count]),
  ]);
  const dom = element('div', { class: 'search-panel' }, [grid]);

  dom.addEventListener('keydown', (event) => {
    if (runScopeHandlers(view, event, 'search-panel')) {
      event.preventDefault();
    } else if (event.key !== 'Enter' || event.isComposing) {
      return;
    } else if (event.target === searchField) {
      event.preventDefault();
      if (event.altKey) selectMatches(view);
      else (event.shiftKey ? findPrevious : findNext)(view);
    } else if (event.target === replaceField) {
      event.preventDefault();
      (event.metaKey || event.ctrlKey ? replaceAll : replaceNext)(view);
    }
  });

  show();

  return {
    dom,
    top: true,
    mount: () => searchField.select(),
    update: (update: ViewUpdate) => {
      let changed = update.docChanged || update.selectionSet;
      for (const transaction of update.transactions) {
        for (const effect of transaction.effects) {
          if (!effect.is(setSearchQuery)) continue;
          changed = true;
          if (!effect.value.eq(query)) query = effect.value;
        }
      }
      if (changed) show();
    },
  };
}
