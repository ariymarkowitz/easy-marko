import { createMemo, For } from 'solid-js';
import { X } from 'lucide';
import {
  closeDocument,
  documentsState,
  hasUnsavedChanges,
  selectDocument,
} from '../state/documents';
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
                <button
                  type="button"
                  class="document-name"
                  aria-current={doc.id === documentsState.activeId ? 'true' : undefined}
                  onClick={() => selectDocument(doc.id)}
                >
                  {doc.name}
                </button>
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
