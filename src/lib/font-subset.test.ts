import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { sfntToWoff, subsetFont } from './font-subset';

const packageFile = (path: string) => new Uint8Array(readFileSync(join('node_modules', path)));

const instrumentSans = () => packageFile('@fontsource-variable/instrument-sans/files/instrument-sans-latin-wdth-normal.woff2');

const codePoints = (text: string) => [...text].map((char) => char.codePointAt(0)!);

beforeEach(() => {
  // Serves the WebAssembly from node_modules, where its URL points in tests.
  vi.stubGlobal('fetch', async (url: string) => new Response(readFileSync(join('.', url))));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A WOFF file's flavour and tables, decompressed, checking the parts browsers validate. */
function readWoff(woff: Uint8Array) {
  const view = new DataView(woff.buffer, woff.byteOffset, woff.byteLength);
  expect(String.fromCharCode(...woff.subarray(0, 4))).toBe('wOFF');
  expect(view.getUint32(8)).toBe(woff.byteLength);
  const tables = new Map<string, Uint8Array>();
  let sfntSize = 12;
  let previousTag = '';
  for (let i = 0, count = view.getUint16(12); i < count; i++) {
    const entry = 44 + i * 20;
    const tag = String.fromCharCode(...woff.subarray(entry, entry + 4));
    expect(tag > previousTag).toBe(true);
    previousTag = tag;
    const offset = view.getUint32(entry + 4);
    expect(offset % 4).toBe(0);
    const stored = woff.subarray(offset, offset + view.getUint32(entry + 8));
    const length = view.getUint32(entry + 12);
    const data = stored.byteLength < length ? new Uint8Array(inflateSync(stored)) : stored;
    expect(data.byteLength).toBe(length);
    tables.set(tag, data);
    sfntSize += 16 + ((length + 3) & ~3);
  }
  expect(view.getUint32(16)).toBe(sfntSize);
  return { flavor: view.getUint32(4), tables };
}

/** The tags of a font's variation axes, from its fvar table. */
function axisTags(fvar: Uint8Array | undefined): string[] {
  if (!fvar) return [];
  const view = new DataView(fvar.buffer, fvar.byteOffset, fvar.byteLength);
  const first = view.getUint16(4);
  return Array.from({ length: view.getUint16(8) }, (_, i) =>
    String.fromCharCode(...fvar.subarray(first + i * 20, first + i * 20 + 4)),
  );
}

const glyphCount = (maxp: Uint8Array) => new DataView(maxp.buffer, maxp.byteOffset).getUint16(4);

describe('subsetFont', () => {
  test('keeps only the glyphs for the characters, as a WOFF file', async () => {
    const woff = await subsetFont(instrumentSans(), codePoints('Hello'));
    const { tables } = readWoff(woff!);

    // .notdef, H, e, l and o, and whatever the layout features reach from them.
    expect(glyphCount(tables.get('maxp')!)).toBeGreaterThanOrEqual(5);
    expect(glyphCount(tables.get('maxp')!)).toBeLessThan(20);
    expect(tables.has('GSUB')).toBe(true);
    expect(axisTags(tables.get('fvar'))).toEqual(['wdth', 'wght']);
    expect(woff!.byteLength).toBeLessThan(instrumentSans().byteLength / 4);
  });

  test('drops a pinned axis', async () => {
    const { tables } = readWoff((await subsetFont(instrumentSans(), codePoints('Hello'), { pinnedAxes: { wdth: 96 } }))!);
    expect(axisTags(tables.get('fvar'))).toEqual(['wght']);
  });

  test('gives undefined for a font with none of the characters', async () => {
    expect(await subsetFont(instrumentSans(), codePoints('日本'))).toBeUndefined();
  });
});

test('sfntToWoff keeps the tables and their checksums', async () => {
  // A font with two tables: one that compresses, and one too short to.
  const sfnt = new Uint8Array(12 + 2 * 16 + 400 + 4);
  const view = new DataView(sfnt.buffer);
  view.setUint32(0, 0x00010000);
  view.setUint16(4, 2);
  const tables = [
    { tag: 'zzzz', checksum: 1, offset: 44, data: new Uint8Array(400).fill(7) },
    { tag: 'aaaa', checksum: 2, offset: 444, data: new Uint8Array([1, 2, 3]) },
  ];
  tables.forEach((table, i) => {
    sfnt.set(codePoints(table.tag), 12 + i * 16);
    view.setUint32(12 + i * 16 + 4, table.checksum);
    view.setUint32(12 + i * 16 + 8, table.offset);
    view.setUint32(12 + i * 16 + 12, table.data.byteLength);
    sfnt.set(table.data, table.offset);
  });

  const woff = await sfntToWoff(sfnt);
  const { flavor, tables: read } = readWoff(woff);
  expect(flavor).toBe(0x00010000);
  expect([...read.keys()]).toEqual(['aaaa', 'zzzz']);
  expect(read.get('aaaa')).toEqual(tables[1].data);
  expect(read.get('zzzz')).toEqual(tables[0].data);
  // The long table is stored compressed.
  expect(woff.byteLength).toBeLessThan(200);
  expect(new DataView(woff.buffer).getUint32(44 + 16)).toBe(2);
});
