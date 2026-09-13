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

  test('skips a suffix taken after the slug was last numbered', () => {
    const slug = createSlugger();
    expect(['a', 'a', 'a-2', 'a'].map(slug)).toEqual(['a', 'a-1', 'a-2', 'a-3']);
  });

  test('numbers a slug repeated many times in linear time', () => {
    const slug = createSlugger();
    const start = performance.now();
    for (let i = 0; i < 10_000; i++) slug('a');
    // Retrying every suffix takes seconds.
    expect(performance.now() - start).toBeLessThan(250);
    expect(slug('a')).toBe('a-10000');
  });
});
