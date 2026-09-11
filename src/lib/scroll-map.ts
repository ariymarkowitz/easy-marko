/**
 * Matching vertical offsets in the source and preview panes, measured from the
 * top of each pane's scrollable content. Entries increase, so an offset in one
 * pane maps onto the other by interpolating between neighbouring entries.
 */
export interface ScrollMap {
  source: number[];
  preview: number[];
}

/**
 * Builds a map that runs from both panes' tops to `end`. Pairs that don't
 * increase on both sides, or that reach `end` on either side, are dropped.
 */
export function createScrollMap(
  pairs: Iterable<readonly [source: number, preview: number]>,
  end: readonly [source: number, preview: number],
): ScrollMap {
  const map: ScrollMap = { source: [0], preview: [0] };
  for (const [source, preview] of pairs) {
    const increases = source > map.source.at(-1)! && preview > map.preview.at(-1)!;
    if (!increases || source >= end[0] || preview >= end[1]) continue;
    map.source.push(source);
    map.preview.push(preview);
  }
  map.source.push(Math.max(end[0], 0));
  map.preview.push(Math.max(end[1], 0));
  return map;
}

/** Maps `offset` from one side of a scroll map (`from`) onto the other (`to`). */
export function mapOffset(offset: number, from: readonly number[], to: readonly number[]): number {
  const last = from.length - 1;
  if (offset <= from[0]) return to[0];
  if (offset >= from[last]) return to[last];

  // Find the segment with from[low] <= offset < from[low + 1].
  let low = 0;
  let high = last;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (from[middle] <= offset) low = middle;
    else high = middle;
  }
  const fraction = (offset - from[low]) / (from[high] - from[low]);
  return to[low] + fraction * (to[high] - to[low]);
}
