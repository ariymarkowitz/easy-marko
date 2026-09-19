import { createMemo, refresh } from 'solid-js';

/**
 * A list kept in IndexedDB, which all tabs share, read when first needed.
 * Refresh it to pick up other tabs' changes. `update` changes the stored list,
 * and settles once the list shows the change.
 */
export function createStoredList<T>(
  read: () => Promise<readonly T[]>,
  write: (list: readonly T[]) => Promise<void>,
) {
  const list = createMemo(read, { lazy: true });

  // Each change reads the list and writes it back, so changes that overlap,
  // like remembering several dropped files, would drop each other's entries.
  // They take turns instead.
  let queue: Promise<unknown> = Promise.resolve();

  async function update(change: (list: readonly T[]) => Promise<readonly T[]>): Promise<void> {
    const turn = queue.then(async () => write(await change(await read())));
    queue = turn.catch(() => {});
    await turn;
    await refresh(list);
  }

  return [list, update] as const;
}
