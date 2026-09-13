// Bridge between the CodeMirror view (owned by <Editor>) and the rest of the
// app: toolbar commands and the cursor/history state shown in the UI.

import { createSignal } from 'solid-js';
import { redo, redoDepth, undo, undoDepth } from '@codemirror/commands';
import { closeSearchPanel, openSearchPanel, searchPanelOpen } from '@codemirror/search';
import type { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { createAttachment } from '../reactive';

/** The mounted editor. `attachEditor` returns the detach for <Editor>'s cleanup. */
const [editorView, attachEditor] = createAttachment<EditorView>();
const [cursor, setCursor] = createSignal({ line: 1, column: 1 });
const [canUndo, setCanUndo] = createSignal(false);
const [canRedo, setCanRedo] = createSignal(false);
const [findOpen, setFindOpen] = createSignal(false);

export { attachEditor, canRedo, canUndo, cursor, editorView, findOpen };

/** Publishes cursor position, undo/redo availability and whether the search panel is open. Call when the editor state changes. */
export function syncEditorState(state: EditorState): void {
  const head = state.selection.main.head;
  const line = state.doc.lineAt(head);
  setCursor({ line: line.number, column: head - line.from + 1 });
  setCanUndo(undoDepth(state) > 0);
  setCanRedo(redoDepth(state) > 0);
  setFindOpen(searchPanelOpen(state));
}

function run(command: (target: EditorView) => boolean, { focus = true } = {}): void {
  const view = editorView();
  if (!view) return;
  command(view);
  if (focus) view.focus();
}

export const editorCommands = {
  undo: () => run(undo),
  redo: () => run(redo),
  /** Opens the search panel, which focuses its own field, or closes it and returns to the editor. */
  toggleFind: () => {
    if (findOpen()) run(closeSearchPanel);
    else run(openSearchPanel, { focus: false });
  },
};
