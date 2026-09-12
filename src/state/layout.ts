// What the layout shows, from the stored settings and the window width.
// Narrow windows have no room for the sidebar beside the workspace or for two
// panes side by side, so the sidebar overlays the workspace and one pane shows
// at a time. The stored settings are left as they are, so widening the window
// brings back the user's choices.

import { createEffect, createSignal, onSettled } from 'solid-js';
import { documentsState } from './documents';
import {
  type PanelMode,
  setLastPanel,
  setSidebarOpen,
  settings,
  setViewMode,
  type ViewMode,
} from './settings';

/** Windows narrower than this, in CSS pixels, get the narrow layout. */
export const NARROW_WIDTH = 700;

const narrowMedia = window.matchMedia(`(width < ${NARROW_WIDTH}px)`);
const [narrowScreen, setNarrowScreen] = createSignal(narrowMedia.matches);

/** Whether the sidebar is open over the workspace on a narrow screen. Starts closed. */
const [overlayOpen, setOverlayOpen] = createSignal(false);

export { narrowScreen };

/** The panes shown. Narrow screens show the last single-pane view instead of split view. */
export const viewMode = (): ViewMode =>
  narrowScreen() && settings.viewMode === 'split' ? settings.lastPanel : settings.viewMode;

/** Whether the sidebar is shown: beside the workspace, or over it on narrow screens. */
export const sidebarOpen = (): boolean => (narrowScreen() ? overlayOpen() : settings.sidebarOpen);

export function toggleSidebar(): void {
  if (narrowScreen()) setOverlayOpen(!overlayOpen());
  else setSidebarOpen(!settings.sidebarOpen);
}

/**
 * Handles a click on a view button. Clicking the active single-pane view
 * opens split view; clicking split view while active returns to the last
 * single-pane view. Narrow screens have no split view, and choosing a pane
 * there keeps a stored split view for when the window widens.
 */
export function selectViewMode(mode: ViewMode): void {
  const narrow = narrowScreen();
  if (mode === 'split') {
    if (!narrow) setViewMode(settings.viewMode === 'split' ? settings.lastPanel : 'split');
    return;
  }
  setLastPanel(mode);
  if (!narrow) setViewMode(settings.viewMode === mode ? 'split' : mode);
  else if (settings.viewMode !== 'split') setViewMode(mode);
}

/**
 * Shows `pane` after an alt-click in the other pane while it was hidden:
 * beside the other pane in split view, or in its place on narrow screens.
 */
export function revealPane(pane: PanelMode): void {
  if (narrowScreen()) selectViewMode(pane);
  else setViewMode('split');
}

/**
 * Follows the window width, and closes the sidebar overlay on Escape, on a
 * click outside it, and when a document is selected. Call once from the app root.
 */
export function useLayout(): void {
  onSettled(() => {
    const update = () => {
      setNarrowScreen(narrowMedia.matches);
      setOverlayOpen(false);
    };
    narrowMedia.addEventListener('change', update);
    return () => narrowMedia.removeEventListener('change', update);
  });

  createEffect(
    () => narrowScreen() && overlayOpen(),
    (open) => {
      if (!open) return;
      const onKeyDown = (event: KeyboardEvent) => {
        // Controls that handle Escape themselves, like CodeMirror's search panel, prevent the default.
        if (event.key !== 'Escape' || event.defaultPrevented) return;
        const hadFocus = document.getElementById('sidebar')?.contains(document.activeElement);
        setOverlayOpen(false);
        // Focus would otherwise be lost with the sidebar.
        if (hadFocus) document.querySelector<HTMLElement>('button[aria-controls="sidebar"]')?.focus();
      };
      // The sidebar toggle is left out, as its click closes the overlay itself.
      const onPointerDown = (event: PointerEvent) => {
        const target = event.target instanceof Element ? event.target : undefined;
        if (!target?.closest('#sidebar, [aria-controls="sidebar"]')) setOverlayOpen(false);
      };
      const controller = new AbortController();
      document.addEventListener('keydown', onKeyDown, { signal: controller.signal });
      document.addEventListener('pointerdown', onPointerDown, { signal: controller.signal });
      return () => controller.abort();
    },
    { name: 'sidebarOverlay' },
  );

  // Closing the active document also changes the active one, but the overlay
  // stays open for closing others.
  createEffect(
    () => ({
      activeId: documentsState.activeId,
      ids: documentsState.documents.map((doc) => doc.id),
    }),
    (current, previous) => {
      const selected =
        previous && current.activeId !== previous.activeId && current.ids.includes(previous.activeId);
      if (selected) setOverlayOpen(false);
    },
    { name: 'closeOverlayOnSelect' },
  );
}
