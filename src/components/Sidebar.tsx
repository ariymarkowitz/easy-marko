import { createMemo, For, Loading, Show } from 'solid-js';
import { X } from 'lucide';
import { closeDocument, documentsState, hasUnsavedChanges, openRecentFile } from '../state/documents';
import { forgetFile, recentFiles } from '../state/recent-files';
import DocumentName from './DocumentName';
import IconButton from './IconButton';

export default function Sidebar() {
  return (
    <aside id="sidebar" class="sidebar" aria-labelledby="sidebar-heading">
      <h2 id="sidebar-heading" class="sidebar-heading">Documents</h2>
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
      {/* Shows the recent files once they've been read from IndexedDB. */}
      <Loading>
        <Show when={recentFiles().length > 0}>
          <h2 class="sidebar-heading">Recent files</h2>
          <ul class="document-list">
            <For each={recentFiles()}>
              {(file) => (
                <li class="document-item">
                  <button
                    type="button"
                    class="document-name"
                    title={file.name}
                    onClick={() => void openRecentFile(file.handle)}
                  >
                    {file.name}
                  </button>
                  <IconButton
                    icon={X}
                    label={`Remove ${file.name} from recent files`}
                    class="document-close"
                    onClick={() => void forgetFile(file.handle)}
                  />
                </li>
              )}
            </For>
          </ul>
        </Show>
      </Loading>
    </aside>
  );
}
