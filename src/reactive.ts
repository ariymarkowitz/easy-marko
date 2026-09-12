// Small Solid primitives that aren't tied to any part of the app.

import { createSignal, getOwner, onCleanup } from 'solid-js';

/**
 * Whether `query` matches, as a signal, current from the moment it's created.
 * Under an owner it stops following the query when that owner is disposed;
 * at module scope, where there's nothing to dispose it, it follows the query
 * for the life of the page.
 */
export function createMediaQuery(query: string): () => boolean {
  const media = window.matchMedia(query);
  const [matches, setMatches] = createSignal(media.matches);
  const update = () => setMatches(media.matches);
  media.addEventListener('change', update);
  // Guarded because onCleanup warns, rightly, that it can never run unowned.
  if (getOwner()) onCleanup(() => media.removeEventListener('change', update));
  return matches;
}

/**
 * A signal holding something a component mounts — a DOM element, an editor
 * view — for the rest of the app to read. `attach` publishes the value and
 * returns the cleanup that clears it: call it from the component's onSettled
 * and return the result. The clearing can't be registered here instead: it
 * belongs to the mounted value, not to the signal, and onSettled is one of
 * the scopes where onCleanup throws.
 */
export function createAttachment<T>(): [value: () => T | undefined, attach: (value: T) => () => void] {
  const [value, setValue] = createSignal<T>();
  const attach = (next: T) => {
    // Wrapped, so an attached value that's callable isn't taken for an updater.
    setValue(() => next);
    return () => setValue(undefined);
  };
  return [value, attach];
}
