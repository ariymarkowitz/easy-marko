/**
 * Three-way merge of two edited copies of a list of items with ids, such as
 * the documents in two browser tabs. `base` is the list both copies started
 * from. An item in both copies takes the version `latest` picks, so a copy
 * that is behind never undoes a newer change. An item removed from one copy
 * is removed only if the other copy didn't change it, so edits are never dropped.
 *
 * The result keeps the local order, with items added only in `remote` at the
 * end, unless only `remote` reordered the items all three share: then those
 * items take the remote order, in the places they have locally.
 */
export function mergeById<T extends { id: string }>(
  base: readonly T[],
  local: readonly T[],
  remote: readonly T[],
  isEqual: (a: T, b: T) => boolean,
  latest: (a: T, b: T) => T,
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
    if (other) merged.push(latest(item, other));
    else if (!unchanged(item)) merged.push(item);
  }
  for (const item of remote) {
    if (!localIds.has(item.id) && !unchanged(item)) merged.push(item);
  }

  const shared = merged.filter((item) => baseById.has(item.id) && localIds.has(item.id) && remoteById.has(item.id));
  const sharedIds = new Set(shared.map((item) => item.id));
  const order = (list: readonly T[]) => list.flatMap((item) => (sharedIds.has(item.id) ? [item.id] : [])).join('\0');
  if (order(local) !== order(base) || order(remote) === order(base)) return merged;
  const byId = new Map(shared.map((item) => [item.id, item]));
  const remoteOrder = remote.filter((item) => sharedIds.has(item.id)).map((item) => byId.get(item.id)!);
  return merged.map((item) => (sharedIds.has(item.id) ? remoteOrder.shift()! : item));
}
