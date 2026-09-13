// Small Solid primitives that aren't tied to any part of the app.

import { createRoot, createSignal, onCleanup, onSettled } from 'solid-js';
import { type ListenOptions, type Listeners, listen } from './lib/events';

/**
 * Whether `query` matches, as a signal, current from the moment it's created.
 */
export function createMediaQuery(query: string): () => boolean {
  const media = window.matchMedia(query);
  const [matches, setMatches] = createSignal(media.matches);

  // Its own root, so the cleanup has an owner even at module scope.
  createRoot(() => onCleanup(listen(media, { change: () => setMatches(media.matches) })));

  return matches;
}

/**
 * A signal holding something a component mounts, that needs to be cleared when
 * it unmounts. `attach` assigns the provided value and returns its disposal.
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

/**
 * Adds each listener to `target` once the current owner settles, and removes
 * them when it's disposed. Call from a component body or a `use*` hook; inside
 * an effect or onSettled callback, return `listen`'s result instead.
 */
export function useListeners<T extends EventTarget>(target: T, listeners: Listeners<T>, options?: ListenOptions): void {
  onSettled(() => listen(target, listeners, options));
}
