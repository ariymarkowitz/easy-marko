// Small Solid primitives that aren't tied to any part of the app.

import { createRoot, createSignal, onCleanup, onSettled } from 'solid-js';
import { type ListenOptions, type Listeners, listen } from './lib/events';

/**
 * Whether `query` matches, as a signal, current from the moment it's created.
 */
export function createMediaQuery(query: string): () => boolean {
  const media = window.matchMedia(query);
  const [matches, setMatches] = createSignal(media.matches);

  // Its own root, so the cleanup has an owner to run it.
  createRoot(() => {
    const update = () => setMatches(media.matches);
    media.addEventListener('change', update);
    onCleanup(() => media.removeEventListener('change', update));
  });

  return matches;
}

/**
 * A signal holding something a component mounts — a DOM element, an editor
 * view — for the rest of the app to read. `attach` publishes the value and
 * returns the cleanup that clears it.
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
