import { describe, expect, test } from 'vitest';
import { mergeById } from './merge';

interface Item {
  id: string;
  text: string;
  version: number;
}

const item = (id: string, text = id, version = text === id ? 0 : 1): Item => ({ id, text, version });
const sameText = (a: Item, b: Item) => a.text === b.text;
const latest = (a: Item, b: Item) => (b.version > a.version ? b : a);
const merge = (base: Item[], local: Item[], remote: Item[]) =>
  mergeById(base, local, remote, sameText, latest);

describe('mergeById', () => {
  test('keeps changes made to different items on each side', () => {
    const base = [item('a'), item('b')];
    expect(merge(base, [item('a', 'local'), item('b')], [item('a'), item('b', 'remote')])).toEqual([
      item('a', 'local'),
      item('b', 'remote'),
    ]);
  });

  test('takes the latest version of an item changed on both sides', () => {
    expect(merge([item('a')], [item('a', 'local', 1)], [item('a', 'remote', 2)])).toEqual([
      item('a', 'remote', 2),
    ]);
    expect(merge([item('a')], [item('a', 'local', 2)], [item('a', 'remote', 1)])).toEqual([
      item('a', 'local', 2),
    ]);
  });

  test('keeps the local version when the remote copy is behind', () => {
    const base = [item('a', 'newer', 2)];
    expect(merge(base, base, [item('a', 'older', 1)])).toEqual(base);
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

  test('takes the remote order when only the remote copy reordered the items', () => {
    const base = [item('a'), item('b'), item('c')];
    const local = [item('a', 'local'), item('b'), item('c'), item('d')];
    expect(merge(base, local, [item('c'), item('a'), item('b')])).toEqual([
      item('c'),
      item('a', 'local'),
      item('b'),
      item('d'),
    ]);
  });

  test('keeps the local order when the local copy reordered the items', () => {
    const base = [item('a'), item('b'), item('c')];
    const local = [item('b'), item('a'), item('c')];
    expect(merge(base, local, [item('c'), item('a'), item('b')])).toEqual(local);
    expect(merge(base, local, base)).toEqual(local);
  });
});
