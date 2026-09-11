import { describe, expect, test } from 'vitest';
import { hashText } from './hash';

describe('hashText', () => {
  test('is stable for the same text', () => {
    expect(hashText('# Notes\n')).toBe(hashText('# Notes\n'));
  });

  test('changes when the text changes', () => {
    const hashes = new Set(['', ' ', '# Notes', '# Notes\n', '# notes', 'a'.repeat(10_000)].map(hashText));
    expect(hashes.size).toBe(6);
  });
});
