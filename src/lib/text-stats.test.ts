import { describe, expect, test } from 'vitest';
import { textStats } from './text-stats';

describe('textStats', () => {
  test('counts an empty document as one line', () => {
    expect(textStats('')).toEqual({ words: 0, characters: 0, lines: 1 });
  });

  test('ignores markdown punctuation when counting words', () => {
    expect(textStats('Hello, world!\nIt’s  **bold**')).toEqual({
      words: 4,
      characters: 28,
      lines: 2,
    });
  });

  test('counts astral characters once', () => {
    expect(textStats('👋 hi').characters).toBe(4);
  });
});
