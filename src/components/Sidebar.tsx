import { createMemo, createSignal, For, Loading, Show } from 'solid-js';
import { X } from 'lucide';
import { CLICK_SLOP, trackDrag } from '../lib/drag';
import { closeDocument, documentsState, hasUnsavedChanges, moveDocument, openRecentFile } from '../state/documents';
import { forgetFile, recentFiles } from '../state/recent-files';
import { settings } from '../state/settings';
import DocumentName from './DocumentName';
import IconButton from './IconButton';

export default function Sidebar() {
  /** The document whose name is being dragged to a new place in the list. */
  const [dragged, setDragged] = createSignal<string>();

  /** Follows a drag of a document's name, moving the document to where the pointer is in the list. */
  function dragDocument(event: PointerEvent & { currentTarget: HTMLLIElement }, id: string) {
    // The close button and the rename input don't start a drag.
    if (!(event.target as Element).closest('button.document-name')) return;
    const item = event.currentTarget;
    const list = item.parentElement!;
    trackDrag(event, {
      threshold: CLICK_SLOP,
      cursor: 'grabbing',
      onMove: (_clientX, clientY) => {
        setDragged(id);
        // Its place is after the other items whose middle is above the pointer.
        const others = [...list.children].filter((other) => other !== item);
        const index = others.filter((other) => {
          const bounds = other.getBoundingClientRect();
          return bounds.top + bounds.height / 2 < clientY;
        }).length;
        moveDocument(id, index);
      },
      onEnd: () => setDragged(undefined),
    });
  }

  return (
    // The width is set here rather than higher up, where a change would restyle the whole page.
    <aside
      id="sidebar"
      class="sidebar"
      aria-labelledby="sidebar-heading"
      style={{ '--sidebar-width': `${settings.sidebarWidth}px` }}
    >
      <h2 id="sidebar-heading" class="sidebar-heading">Documents</h2>
      <ul class="document-list">
        <For each={documentsState.documents}>
          {(doc) => {
            const unsaved = createMemo(() => hasUnsavedChanges(doc), { name: 'unsaved' });
            return (
              <li
                class={['document-item', { unsaved: unsaved(), dragged: dragged() === doc.id }]}
                onPointerDown={(event) => dragDocument(event, doc.id)}
              >
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
