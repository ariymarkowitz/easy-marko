// GitHub-style task lists: a list item starting with `[ ]` or `[x]` gets a
// read-only checkbox in place of the marker, including an item with no text.

import type { MarkdownIt, StateCore } from 'markdown-it';

const taskMarker = /^\[([ xX])\](?:[ \t]|$)/;

/** Checks the raw content as well as the parsed text, so an escaped `\[ ]` stays text. */
function taskItems(state: StateCore): void {
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
}

export function taskLists(md: MarkdownIt): void {
  // Last, once inline parsing has made the item's text token.
  md.core.ruler.push('task_lists', taskItems);
  md.renderer.rules.task_checkbox = (tokens, idx) =>
    `<input class="task-list-item-checkbox" type="checkbox" disabled${tokens[idx].meta?.checked ? ' checked' : ''}>`;
}
