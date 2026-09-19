// Work that may still be loading: a value, or a promise of one. Staying
// synchronous when nothing is pending means readers don't wait a tick.

export type MaybePromise<T> = T | Promise<T>;

/** `fn` applied to `value`: straight away, or once it resolves. */
export function thenMaybe<T, U>(value: MaybePromise<T>, fn: (value: T) => U): MaybePromise<U> {
  return value instanceof Promise ? value.then(fn) : fn(value);
}

/** `values` as an array: straight away, or once they've all resolved if any is a promise. */
export function allMaybe<T>(values: readonly MaybePromise<T>[]): MaybePromise<T[]> {
  return values.some((value) => value instanceof Promise) ? Promise.all(values) : (values as T[]);
}
