import { createEffect, onSettled } from 'solid-js';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { attachEditor, detachEditor, syncEditorState } from '../editor/controller';
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
      if (update.docChanged || update.selectionSet) syncEditorState(update.state);
    }),
    EditorView.domEventHandlers({
      click: (event, target) => {
        if (!event.altKey) return false;
        const position = target.posAtCoords({ x: event.clientX, y: event.clientY });
        if (position === null) return false;
        const line = target.state.doc.lineAt(position).number - 1;
        jumpToPreview(line, event.clientY - target.scrollDOM.getBoundingClientRect().top);
        return false;
      },
    }),
  ];

  const view = new EditorView();
  onSettled(() => {
    attachEditor(view);
    return () => {
      detachEditor();
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
