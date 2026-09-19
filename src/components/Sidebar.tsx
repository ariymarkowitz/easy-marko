import { createMemo, createSignal, For, Loading, Show } from 'solid-js';
import { Ellipsis, X } from 'lucide';
import { CLICK_SLOP, HOLD_DELAY, TOUCH_SLOP, trackDrag } from '../lib/drag';
import { listen } from '../lib/events';
import { createMediaQuery } from '../reactive';
import { closeDocument, documentsState, hasUnsavedChanges, moveDocument, openRecentFile } from '../state/documents';
import { forgetFile, recentFiles } from '../state/recent-files';
import { settings } from '../state/settings';
import DocumentMenu, { type DocumentMenuTarget } from './DocumentMenu';
import DocumentName from './DocumentName';
import IconButton from './IconButton';

/** Touchscreens can't hover to show a document's close button, so they get a menu button instead. */
const noHover = createMediaQuery('(hover: none)');

/** How close, in pixels, a dragged document comes to the sidebar's top or bottom before the sidebar scrolls. */
const SCROLL_EDGE = 32;
/** How far, in pixels, the sidebar scrolls each frame while a dragged document is at its edge. */
const SCROLL_STEP = 6;

export default function Sidebar() {
  /** The document whose name is being dragged to a new place in the list. */
  const [dragged, setDragged] = createSignal<string>();
  /** The document whose menu is open. */
  const [menuTarget, setMenuTarget] = createSignal<DocumentMenuTarget>();

  /**
   * Follows a drag of a document's name, moving the document to where the
   * pointer is in the list. A touch drags only after it's held still for a
   * moment, so a swipe still scrolls; a touch held and released without moving
   * opens the document's menu.
   */
  function dragDocument(event: PointerEvent & { currentTarget: HTMLLIElement }, id: string, menu: () => void) {
    // The close button and the rename input don't start a drag.
    if (!(event.target as Element).closest('button.document-name')) return;
    const item = event.currentTarget;
    const list = item.parentElement!;
    const sidebar = list.closest<HTMLElement>('.sidebar')!;
    const touch = event.pointerType === 'touch';
    const start = { x: event.clientX, y: event.clientY };
    let moved = false;
    let pointerY = start.y;
    let frame = 0;

    /** Moves the document to its place among the other items: after those whose middle is above the pointer. */
    const place = () => {
      const others = [...list.children].filter((other) => other !== item);
      const index = others.filter((other) => {
        const bounds = other.getBoundingClientRect();
        return bounds.top + bounds.height / 2 < pointerY;
      }).length;
      moveDocument(id, index);
    };

    /** Scrolls the sidebar while the pointer is near its top or bottom, so the document can go anywhere in a long list. */
    const scroll = () => {
      const bounds = sidebar.getBoundingClientRect();
      const step =
        pointerY < bounds.top + SCROLL_EDGE ? -SCROLL_STEP : pointerY > bounds.bottom - SCROLL_EDGE ? SCROLL_STEP : 0;
      if (step) {
        const before = sidebar.scrollTop;
        sidebar.scrollTop += step;
        if (sidebar.scrollTop !== before) place();
      }
      frame = requestAnimationFrame(scroll);
    };

    trackDrag(event, {
      threshold: touch ? TOUCH_SLOP : CLICK_SLOP,
      hold: touch ? HOLD_DELAY : undefined,
      cursor: 'grabbing',
      onStart: () => {
        setDragged(id);
        if (touch && typeof navigator.vibrate === 'function') navigator.vibrate(10);
        frame = requestAnimationFrame(scroll);
      },
      onMove: (clientX, clientY) => {
        pointerY = clientY;
        moved ||= Math.hypot(clientX - start.x, clientY - start.y) >= TOUCH_SLOP;
        place();
      },
      onEnd: (released) => {
        cancelAnimationFrame(frame);
        setDragged(undefined);
        // Opened after the release has been handled, so the release doesn't count as a tap outside the menu.
        if (touch && released && !moved) setTimeout(menu);
      },
    });
  }

  /**
   * Keeps a touch that has lifted a document from scrolling the sidebar, and
   * a held touch from opening the browser's own menu. The listener is there from
   * the start, since a browser settles whether a touch can scroll when it starts.
   */
  function holdTouches(list: HTMLUListElement) {
    listen(list, { touchmove: (event) => dragged() && event.preventDefault() }, { passive: false });
    listen(list, {
      contextmenu: (event) => {
        if ((event as PointerEvent).pointerType === 'touch' || dragged()) event.preventDefault();
      },
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
      <ul class="document-list" ref={holdTouches}>
        <For each={documentsState.documents}>
          {(doc) => {
            const unsaved = createMemo(() => hasUnsavedChanges(doc), { name: 'unsaved' });
            let row: HTMLLIElement | undefined;
            let rename = () => {};
            const openMenu = () =>
              row &&
              setMenuTarget({
                name: doc.name,
                row,
                rename,
                close: () => closeDocument(doc.id),
              });
            return (
              <li
                ref={(element) => (row = element)}
                class={['document-item', { unsaved: unsaved(), dragged: dragged() === doc.id }]}
                onPointerDown={(event) => dragDocument(event, doc.id, openMenu)}
              >
                <DocumentName
                  doc={doc}
                  active={doc.id === documentsState.activeId}
                  renameRef={(start) => {
                    rename = start;
                  }}
                />
                <Show
                  when={noHover()}
                  fallback={
                    <IconButton
                      icon={X}
                      label={unsaved() ? `Close ${doc.name} (unsaved changes)` : `Close ${doc.name}`}
                      class="document-close"
                      onClick={() => closeDocument(doc.id)}
                    />
                  }
                >
                  <Show when={unsaved()}>
                    <span class="unsaved-dot" aria-hidden="true" />
                  </Show>
                  <IconButton
                    icon={Ellipsis}
                    label={unsaved() ? `Actions for ${doc.name} (unsaved changes)` : `Actions for ${doc.name}`}
                    class="document-more"
                    menuOpen={!!row && menuTarget()?.row === row}
                    onClick={openMenu}
                  />
                </Show>
              </li>
            );
          }}
        </For>
      </ul>
      <Show when={menuTarget()} keyed>
        {(target) => <DocumentMenu target={target} onClose={() => setMenuTarget(undefined)} />}
      </Show>
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
