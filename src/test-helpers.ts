// Helpers for tests that share the app's module state.

import { createRoot, flush } from 'solid-js';
import { closeDocument, documentsState } from './state/documents';
import { dismissNotice, notices } from './state/notices';

/** Runs `hooks` inside a root, flushes, and returns the root's dispose. */
export function mountHooks(...hooks: (() => void)[]): () => void {
  const dispose = createRoot((dispose) => {
    for (const hook of hooks) hook();
    return dispose;
  });
  flush();
  return dispose;
}

/** Dismisses every notice left over from another test file. */
export function clearNotices(): void {
  for (const notice of notices()) dismissNotice(notice.id);
  flush();
}

/** Closes every open document, as at the start of a test file sharing module state. */
export function closeAllDocuments(): void {
  // Ids first: closing a document removes it from the array being iterated.
  for (const id of documentsState.documents.map((doc) => doc.id)) {
    closeDocument(id);
    flush();
  }
}

/** Sets a media query's `matches` in the stand-in matchMedia in vitest-setup.ts, and dispatches its change event. */
export function setMediaMatches(query: string, matches: boolean): void {
  const list = window.matchMedia(query) as { matches: boolean } & EventTarget;
  list.matches = matches;
  list.dispatchEvent(new Event('change'));
  flush();
}
