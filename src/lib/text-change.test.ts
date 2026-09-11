import { describe, expect, test } from 'vitest';
import { textChange } from './text-change';

function apply(text: string, { from, to, insert }: ReturnType<typeof textChange>) {
  return text.slice(0, from) + insert + text.slice(to);
}

describe('textChange', () => {
  test('covers only the part that differs', () => {
    expect(textChange('# Title\nold line\nend', '# Title\nnew line\nend')).toEqual({
      from: 8,
      to: 11,
      insert: 'new',
    });
  });

  test('is empty for equal text', () => {
    expect(textChange('same', 'same')).toEqual({ from: 4, to: 4, insert: '' });
  });

  test.each([
    ['', 'added'],
    ['removed', ''],
    ['aaa', 'aa'],
    ['ab', 'aab'],
    ['start', 'restart'],
    ['finish', 'finished'],
  ])('turns %j into %j', (before, after) => {
    expect(apply(before, textChange(before, after))).toBe(after);
  });
});
