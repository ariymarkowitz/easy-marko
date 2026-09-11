import { describe, expect, test } from 'vitest';
import { mergeById } from './merge';

interface Item {
  id: string;
  text: string;
}

const item = (id: string, text = id): Item => ({ id, text });
const sameText = (a: Item, b: Item) => a.text === b.text;
const merge = (base: Item[], local: Item[], remote: Item[]) =>
  mergeById(base, local, remote, sameText);

describe('mergeById', () => {
  test('keeps changes made to different items on each side', () => {
    const base = [item('a'), item('b')];
    expect(merge(base, [item('a', 'local'), item('b')], [item('a'), item('b', 'remote')])).toEqual([
      item('a', 'local'),
      item('b', 'remote'),
    ]);
  });

  test('prefers the local version of an item changed on both sides', () => {
    expect(merge([item('a')], [item('a', 'local')], [item('a', 'remote')])).toEqual([
      item('a', 'local'),
    ]);
  });

  test('keeps items added on either side, with remote additions last', () => {
    const base = [item('a')];
    expect(merge(base, [item('l'), item('a')], [item('a'), item('r')])).toEqual([
      item('l'),
      item('a'),
      item('r'),
    ]);
  });

  test('removes items removed on one side and unchanged on the other', () => {
    const base = [item('a'), item('b'), item('c')];
    expect(merge(base, [item('a'), item('c')], [item('a'), item('b')])).toEqual([item('a')]);
  });

  test('keeps items removed on one side but changed on the other', () => {
    const base = [item('a'), item('b')];
    expect(merge(base, [item('a', 'local')], [item('b', 'remote')])).toEqual([
      item('a', 'local'),
      item('b', 'remote'),
    ]);
  });
});
