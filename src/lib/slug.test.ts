import { describe, expect, test } from 'vitest';
import { createSlugger, slugify } from './slug';

describe('slugify', () => {
  test.each([
    ['Hello World', 'hello-world'],
    ["Don't panic!", 'dont-panic'],
    ['snake_case and kebab-case', 'snake_case-and-kebab-case'],
    ['a -- b', 'a----b'],
    ['Café über 2', 'café-über-2'],
    ['  spaced  ', '--spaced--'],
    ['?!', ''],
  ])('%j → %j', (text, slug) => {
    expect(slugify(text)).toBe(slug);
  });
});

describe('createSlugger', () => {
  test('numbers repeated slugs, skipping ones already taken', () => {
    const slug = createSlugger();
    expect(['a', 'a', 'a-1', 'a', 'b'].map(slug)).toEqual(['a', 'a-1', 'a-1-1', 'a-2', 'b']);
  });
});
