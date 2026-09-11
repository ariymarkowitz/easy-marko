/**
 * Three-way merge of two edited copies of a list of items with ids, such as
 * the documents in two browser tabs. `base` is the list both copies started
 * from. An item changed in only one copy takes that change; an item changed in
 * both keeps the `local` version. An item removed from one copy is removed
 * only if the other copy didn't change it, so edits are never dropped.
 *
 * The result keeps the local order, with items added only in `remote` at the end.
 */
export function mergeById<T extends { id: string }>(
  base: readonly T[],
  local: readonly T[],
  remote: readonly T[],
  isEqual: (a: T, b: T) => boolean,
): T[] {
  const baseById = new Map(base.map((item) => [item.id, item]));
  const localIds = new Set(local.map((item) => item.id));
  const remoteById = new Map(remote.map((item) => [item.id, item]));
  const unchanged = (item: T) => {
    const original = baseById.get(item.id);
    return original !== undefined && isEqual(item, original);
  };

  const merged: T[] = [];
  for (const item of local) {
    const other = remoteById.get(item.id);
    if (other) merged.push(unchanged(item) ? other : item);
    else if (!unchanged(item)) merged.push(item);
  }
  for (const item of remote) {
    if (!localIds.has(item.id) && !unchanged(item)) merged.push(item);
  }
  return merged;
}
