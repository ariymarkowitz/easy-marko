export interface TextChange {
  from: number;
  to: number;
  insert: string;
}

/**
 * The single replacement that turns `before` into `after`, trimmed to the
 * part that differs. Applying it to an editor keeps the cursor and undo
 * history outside that part.
 */
export function textChange(before: string, after: string): TextChange {
  const shorter = Math.min(before.length, after.length);
  let start = 0;
  while (start < shorter && before[start] === after[start]) start++;
  let end = 0;
  while (
    end < shorter - start &&
    before[before.length - 1 - end] === after[after.length - 1 - end]
  ) {
    end++;
  }
  return { from: start, to: before.length - end, insert: after.slice(start, after.length - end) };
}
