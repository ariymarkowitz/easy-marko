import { createEffect, onSettled, untrack } from 'solid-js';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { attachEditor, syncEditorState } from '../editor/controller';
import { editorExtensions } from '../editor/extensions';
import { activeDocument, documentsState, updateContent } from '../state/documents';

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
  ];

  const view = new EditorView();
  onSettled(() => () => {
    attachEditor(undefined);
    view.destroy();
  });

  createEffect(
    () => {
      const doc = activeDocument();
      return {
        ids: documentsState.documents.map((d) => d.id),
        id: doc?.id,
        // Only seeds a new editor state, so typing shouldn't re-run this effect.
        content: untrack(() => doc?.content ?? ''),
      };
    },
    ({ ids, id, content }) => {
      if (documentId && ids.includes(documentId)) states.set(documentId, view.state);
      for (const key of states.keys()) {
        if (!ids.includes(key)) states.delete(key);
      }
      if (!id || id === documentId) return;
      view.setState(states.get(id) ?? EditorState.create({ doc: content, extensions }));
      documentId = id;
      attachEditor(view);
    },
  );

  return <div class="editor">{view.dom}</div>;
}
