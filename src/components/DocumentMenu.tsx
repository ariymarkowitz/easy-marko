import { onSettled } from 'solid-js';
import { closeDocument, type MarkdownDocument } from '../state/documents';

/** What the document menu acts on, and where it opens. */
export interface DocumentMenuTarget {
  doc: MarkdownDocument;
  /** The document's row in the sidebar. The menu opens below it, or above it near the window's bottom. */
  row: HTMLElement;
  /** Starts renaming the document in its row. */
  rename: () => void;
}

/** The gap, in pixels, between the menu and its row, and the least between the menu and the window's edges. */
const GAP = 4;

/**
 * A document's actions (Rename and Close), for touchscreens, which can't hover
 * to show the close button. It opens on showing, with focus on its first item,
 * and closes on picking an item, Escape, or a tap outside it. Up/Down, Home and
 * End move between the items.
 */
export default function DocumentMenu(props: { target: DocumentMenuTarget; onClose: () => void }) {
  let menu: HTMLDivElement | undefined;

  onSettled(() => {
    if (!menu) return;
    menu.showPopover();
    const row = props.target.row.getBoundingClientRect();
    const bounds = menu.getBoundingClientRect();
    const below = row.bottom + GAP;
    const top = below + bounds.height <= window.innerHeight - GAP ? below : row.top - GAP - bounds.height;
    menu.style.top = `${Math.max(GAP, top)}px`;
    menu.style.left = `${Math.max(GAP, row.right - bounds.width)}px`;
    items()[0]?.focus();
  });

  const items = () => [...(menu?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];

  /** Closes the menu, then runs `action`, which may move focus (as renaming does). */
  function pick(action: () => void) {
    menu?.hidePopover();
    action();
  }

  function onKeyDown(event: KeyboardEvent) {
    const all = items();
    const index = all.indexOf(document.activeElement as HTMLElement);
    // Where each key moves focus. Up and Down wrap around.
    const next = { ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: -1 }[event.key];
    if (next !== undefined) {
      event.preventDefault();
      all.at(next % all.length)?.focus();
    } else if (event.key === 'Escape') {
      // Handled here, so it doesn't also close the sidebar overlay. Hiding the menu returns focus to where it was.
      event.preventDefault();
      menu?.hidePopover();
    } else if (event.key === 'Tab') {
      menu?.hidePopover();
    }
  }

  return (
    <div
      ref={(element) => (menu = element)}
      popover="auto"
      role="menu"
      class="document-menu"
      aria-label={`Actions for ${props.target.doc.name}`}
      onKeyDown={onKeyDown}
      onToggle={(event) => {
        if (event.newState === 'closed') props.onClose();
      }}
    >
      <button type="button" role="menuitem" class="document-menu-item" onClick={() => pick(props.target.rename)}>
        Rename
      </button>
      <button type="button" role="menuitem" class="document-menu-item" onClick={() => pick(() => closeDocument(props.target.doc.id))}>
        Close
      </button>
    </div>
  );
}
