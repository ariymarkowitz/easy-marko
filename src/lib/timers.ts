// Timers that return a function cancelling them, so no caller keeps a timer id.

/** Starts a deferred run of its argument and returns a function cancelling it. */
export type Wait = (run: () => void) => () => void;

/** Calls `fn` after `ms`. Returns a function cancelling the call. */
export function delay(fn: () => void, ms?: number): () => void {
  const id = setTimeout(fn, ms);
  return () => clearTimeout(id);
}

/** Waits `ms`. */
export const after =
  (ms?: number): Wait =>
  (run) =>
    delay(run, ms);

/** Waits for the next animation frame. */
export const nextFrame: Wait = (run) => {
  const id = requestAnimationFrame(run);
  return () => cancelAnimationFrame(id);
};

export interface Scheduler {
  /** Schedules a call, unless one is already scheduled. */
  schedule: () => void;
  /** Cancels the scheduled call, if there is one. */
  cancel: () => void;
}

/**
 * Calls `fn` once `wait` is over. Only one `fn` is scheduled at a time;
 * calling `schedule()` again does nothing until `fn` has been called.
 * `fn` may schedule the next call.
 */
export function scheduler(fn: () => void, wait: Wait): Scheduler {
  let cancel: (() => void) | undefined;
  return {
    schedule: () => {
      cancel ??= wait(() => {
        cancel = undefined;
        fn();
      });
    },
    cancel: () => {
      cancel?.();
      cancel = undefined;
    },
  };
}
