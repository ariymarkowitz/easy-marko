// Bridge between the CodeMirror view (owned by <Editor>) and the rest of the
// app: toolbar commands and the cursor/history state shown in the UI.

import { createSignal } from 'solid-js';
import { redo, redoDepth, undo, undoDepth } from '@codemirror/commands';
import { openSearchPanel } from '@codemirror/search';
import type { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

const [editorView, setEditorView] = createSignal<EditorView>();
const [cursor, setCursor] = createSignal({ line: 1, column: 1 });
const [canUndo, setCanUndo] = createSignal(false);
const [canRedo, setCanRedo] = createSignal(false);

export { canRedo, canUndo, cursor, editorView };

export function attachEditor(next: EditorView): void {
  setEditorView(next);
}

export function detachEditor(): void {
  setEditorView(undefined);
}

/** Publishes cursor position and undo/redo availability. Call when the editor state changes. */
export function syncEditorState(state: EditorState): void {
  const head = state.selection.main.head;
  const line = state.doc.lineAt(head);
  setCursor({ line: line.number, column: head - line.from + 1 });
  setCanUndo(undoDepth(state) > 0);
  setCanRedo(redoDepth(state) > 0);
}

function run(command: (target: EditorView) => boolean): void {
  const view = editorView();
  if (!view) return;
  command(view);
  view.focus();
}

export const editorCommands = {
  undo: () => run(undo),
  redo: () => run(redo),
  find: () => run(openSearchPanel),
};
