// DOM listeners added and removed as a group, so a set of listeners has one
// teardown instead of one per listener.

type EventMapOf<T> = T extends Window
  ? WindowEventMap
  : T extends Document
    ? DocumentEventMap
    : T extends MediaQueryList
      ? MediaQueryListEventMap
      : T extends HTMLElement
        ? HTMLElementEventMap
        : Record<string, Event>;

/** Handlers for `target`'s events, keyed by event type. */
export type Listeners<T extends EventTarget> = {
  [K in keyof EventMapOf<T> & string]?: (event: EventMapOf<T>[K]) => void;
};

/** Options for `listen`. Its `signal` is used to remove the listeners. */
export type ListenOptions = Omit<AddEventListenerOptions, 'signal'>;

/**
 * Adds each listener to `target` and returns a function removing them all.
 * Return the result from onSettled or an effect to unbind on cleanup.
 */
export function listen<T extends EventTarget>(
  target: T,
  listeners: Listeners<T>,
  options?: ListenOptions,
): () => void {
  const controller = new AbortController();
  for (const [type, handler] of Object.entries(listeners)) {
    target.addEventListener(type, handler as EventListener, {
      ...options,
      signal: controller.signal,
    });
  }
  return () => controller.abort();
}
