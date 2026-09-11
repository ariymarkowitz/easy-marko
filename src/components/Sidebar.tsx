import { createMemo, For } from 'solid-js';
import { X } from 'lucide';
import { closeDocument, documentsState, hasUnsavedChanges } from '../state/documents';
import DocumentName from './DocumentName';
import IconButton from './IconButton';

export default function Sidebar() {
  return (
    <aside class="sidebar" aria-label="Documents">
      <h2 class="sidebar-heading">Documents</h2>
      <ul class="document-list">
        <For each={documentsState.documents}>
          {(doc) => {
            const unsaved = createMemo(() => hasUnsavedChanges(doc), { name: 'unsaved' });
            return (
              <li class={['document-item', { unsaved: unsaved() }]}>
                <DocumentName doc={doc} active={doc.id === documentsState.activeId} />
                <IconButton
                  icon={X}
                  label={unsaved() ? `Close ${doc.name} (unsaved changes)` : `Close ${doc.name}`}
                  class="document-close"
                  onClick={() => closeDocument(doc.id)}
                />
              </li>
            );
          }}
        </For>
      </ul>
    </aside>
  );
}
