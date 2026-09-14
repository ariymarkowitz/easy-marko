// Where each document's panes were scrolled to. Saved to localStorage, so
// documents reopen where they were after a reload.

import { createEffect } from 'solid-js';
import { readJSON, STORAGE_KEYS, writeText } from '../lib/storage';
import { documentsState } from './documents';
import type { PanelMode } from './settings';

/**
 * Where a document's panes were scrolled to: the source line at the top of
 * each pane, fractional for a place partway through, and the pane scrolled
 * last.
 */
export interface ScrollPosition {
  pane: PanelMode;
  source: number;
  preview: number;
}

const topPosition: ScrollPosition = { pane: 'source', source: 0, preview: 0 };

function isScrollPosition(value: unknown): value is ScrollPosition {
  const position = value as ScrollPosition;
  return (
    (position?.pane === 'source' || position?.pane === 'preview') &&
    Number.isFinite(position.source) &&
    Number.isFinite(position.preview)
  );
}

/** Each document's scroll position, by id. */
const scrollPositions = new Map(
  Object.entries(readJSON<Record<string, unknown>>(STORAGE_KEYS.scrollPositions, {})).filter(
    (entry): entry is [string, ScrollPosition] => isScrollPosition(entry[1]),
  ),
);

let saveTimer: ReturnType<typeof setTimeout> | undefined;

/** Saves the scroll positions of open documents, at most twice a second. */
function saveScrollPositions(): void {
  if (saveTimer !== undefined) return;
  saveTimer = setTimeout(() => {
    saveTimer = undefined;
    const ids = new Set(documentsState.documents.map((doc) => doc.id));
    for (const id of scrollPositions.keys()) if (!ids.has(id)) scrollPositions.delete(id);
    writeText(STORAGE_KEYS.scrollPositions, JSON.stringify(Object.fromEntries(scrollPositions)));
  }, 500);
}

/** Where the active document's panes were scrolled to: the top if they haven't been. */
export const activeScrollPosition = (): ScrollPosition => scrollPositions.get(documentsState.activeId) ?? topPosition;

/** Records where the active document's panes are scrolled to. */
export function setActiveScrollPosition(position: ScrollPosition): void {
  scrollPositions.set(documentsState.activeId, position);
  saveScrollPositions();
}

/** Drops closed documents' scroll positions from storage. Call once from the app root. */
export function useScrollPositions(): void {
  createEffect(
    () => documentsState.documents.map((doc) => doc.id).join(),
    () => saveScrollPositions(),
    { name: 'pruneScrollPositions' },
  );
}
