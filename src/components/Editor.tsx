import { createEffect, onSettled } from 'solid-js';
import { searchPanelOpen } from '@codemirror/search';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { attachEditor, syncEditorState } from '../editor/controller';
import { editorExtensions } from '../editor/extensions';
import { textChange } from '../lib/text-change';
import { activeDocument, documentsState, updateContent } from '../state/documents';
import { jumpToPreview } from '../state/pane-link';

export default function Editor() {
  /** One state per document, so each keeps its own undo history and selection. */
  const states = new Map<string, EditorState>();
  let documentId: string | undefined;

  const extensions = [
    editorExtensions,
    EditorView.updateListener.of((update) => {
      if (update.docChanged && documentId) {
        updateContent(documentId, update.state.doc.toString());
      }
      const findToggled = searchPanelOpen(update.state) !== searchPanelOpen(update.startState);
      if (update.docChanged || update.selectionSet || findToggled) syncEditorState(update.state);
    }),
    EditorView.domEventHandlers({
      click: (event, editor) => {
        if (!event.altKey) return false;
        const position = editor.posAtCoords({ x: event.clientX, y: event.clientY });
        if (position === null) return false;
        const line = editor.state.doc.lineAt(position).number - 1;
        jumpToPreview(line, event.clientY - editor.scrollDOM.getBoundingClientRect().top);
        return false;
      },
    }),
  ];

  const view = new EditorView();
  onSettled(() => {
    const detach = attachEditor(view);
    return () => {
      detach();
      view.destroy();
    };
  });

  createEffect(
    () => {
      const doc = activeDocument();
      return {
        ids: documentsState.documents.map((d) => d.id),
        id: doc?.id,
        content: doc?.content ?? '',
      };
    },
    ({ ids, id, content }) => {
      for (const key of states.keys()) {
        if (!ids.includes(key)) states.delete(key);
      }
      if (!id) return;
      if (id !== documentId) {
        if (documentId && ids.includes(documentId)) states.set(documentId, view.state);
        view.setState(states.get(id) ?? EditorState.create({ doc: content, extensions }));
        documentId = id;
        // setState doesn't notify update listeners.
        syncEditorState(view.state);
      }
      // Equal after typing. They differ when another tab changed the document,
      // even while it wasn't active here.
      const current = view.state.doc.toString();
      if (content !== current) view.dispatch({ changes: textChange(current, content) });
    },
  );

  return <div class="editor">{view.dom}</div>;
}
