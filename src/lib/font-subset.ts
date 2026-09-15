// Subsets fonts for HTML exports to the characters a document shows, with
// HarfBuzz's hb-subset (WebAssembly), keeping every layout feature and the
// variation axes that aren't pinned. Exports import this module only when
// they're built, so the app doesn't load it on start.

import wasmUrl from 'harfbuzzjs/dist/harfbuzz-subset.wasm?url';
import decompressWoff2 from 'woff2-encoder/decompress';

/** hb-subset's exports, as far as they're used here. Pointers are addresses in `memory`. */
interface HarfBuzz {
  memory: WebAssembly.Memory;
  _initialize(): void;
  malloc(size: number): number;
  free(pointer: number): void;
  hb_blob_create(data: number, length: number, mode: number, userData: number, destroy: number): number;
  hb_blob_destroy(blob: number): void;
  hb_blob_get_data(blob: number, length: number): number;
  hb_blob_get_length(blob: number): number;
  hb_face_create(blob: number, index: number): number;
  hb_face_destroy(face: number): void;
  hb_face_reference_blob(face: number): number;
  hb_set_add(set: number, value: number): void;
  hb_set_clear(set: number): void;
  hb_set_invert(set: number): void;
  hb_subset_input_create_or_fail(): number;
  hb_subset_input_destroy(input: number): void;
  hb_subset_input_set(input: number, setType: number): number;
  hb_subset_input_unicode_set(input: number): number;
  hb_subset_input_pin_axis_location(input: number, face: number, axis: number, value: number): number;
  hb_subset_or_fail(face: number, input: number): number;
}

const HB_MEMORY_MODE_WRITABLE = 2;
const HB_SUBSET_SETS_LAYOUT_FEATURE_TAG = 6;

let harfBuzz: Promise<HarfBuzz> | undefined;

function loadHarfBuzz(): Promise<HarfBuzz> {
  harfBuzz ??= (async () => {
    const response = await fetch(wasmUrl);
    if (!response.ok) throw new Error(`Couldn't load ${wasmUrl} (${response.status})`);
    const { instance } = await WebAssembly.instantiate(await response.arrayBuffer());
    const exports = instance.exports as unknown as HarfBuzz;
    exports._initialize();
    return exports;
  })();
  // A failed load can be retried by the next export.
  harfBuzz.catch(() => (harfBuzz = undefined));
  return harfBuzz;
}

const tagNumber = (tag: string) => [...tag].reduce((value, char) => value * 256 + char.charCodeAt(0), 0);

interface SfntTable {
  tag: string;
  checksum: number;
  data: Uint8Array;
}

/** An OpenType or TrueType file's flavour and tables. */
function readSfnt(bytes: Uint8Array): { flavor: number; tables: SfntTable[] } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tables: SfntTable[] = [];
  for (let i = 0, count = view.getUint16(4); i < count; i++) {
    const entry = 12 + i * 16;
    const offset = view.getUint32(entry + 8);
    tables.push({
      tag: String.fromCharCode(...bytes.subarray(entry, entry + 4)),
      checksum: view.getUint32(entry + 4),
      data: bytes.subarray(offset, offset + view.getUint32(entry + 12)),
    });
  }
  return { flavor: view.getUint32(0), tables };
}

/** The number of glyphs in a font, from its maxp table. */
function glyphCount(tables: SfntTable[]): number {
  const maxp = tables.find((table) => table.tag === 'maxp');
  if (!maxp) throw new Error('Font has no maxp table');
  return new DataView(maxp.data.buffer, maxp.data.byteOffset, maxp.data.byteLength).getUint16(4);
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Response(bytes as Uint8Array<ArrayBuffer>).body!.pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const padded = (length: number) => (length + 3) & ~3;

/**
 * Packs an OpenType font as WOFF 1.0, each table compressed with zlib where
 * that makes it smaller. WOFF2 files would be about 20% smaller, but its
 * encoder is a much larger download than the CompressionStream this uses.
 */
export async function sfntToWoff(sfnt: Uint8Array): Promise<Uint8Array> {
  const { flavor, tables } = readSfnt(sfnt);
  // The directory is in tag order, as WOFF requires.
  tables.sort((a, b) => (a.tag < b.tag ? -1 : 1));
  const stored = await Promise.all(
    tables.map(async (table) => {
      const compressed = await deflate(table.data);
      return compressed.byteLength < table.data.byteLength ? compressed : table.data;
    }),
  );

  const headerSize = 44;
  const directorySize = tables.length * 20;
  const length = stored.reduce((total, data) => total + padded(data.byteLength), headerSize + directorySize);
  const sfntSize = tables.reduce((total, table) => total + padded(table.data.byteLength), 12 + tables.length * 16);
  const woff = new Uint8Array(length);
  const view = new DataView(woff.buffer);
  view.setUint32(0, tagNumber('wOFF'));
  view.setUint32(4, flavor);
  view.setUint32(8, length);
  view.setUint16(12, tables.length);
  view.setUint32(16, sfntSize);
  // The version, metadata and private data fields stay zero.

  let offset = headerSize + directorySize;
  tables.forEach((table, i) => {
    const entry = headerSize + i * 20;
    view.setUint32(entry, tagNumber(table.tag));
    view.setUint32(entry + 4, offset);
    view.setUint32(entry + 8, stored[i].byteLength);
    view.setUint32(entry + 12, table.data.byteLength);
    view.setUint32(entry + 16, table.checksum);
    woff.set(stored[i], offset);
    offset += padded(stored[i].byteLength);
  });
  return woff;
}

/** Runs hb-subset on an OpenType font, giving the subset font's bytes. */
function subsetSfnt(
  hb: HarfBuzz,
  sfnt: Uint8Array,
  codePoints: Iterable<number>,
  pinnedAxes: Record<string, number>,
): Uint8Array {
  const input = hb.hb_subset_input_create_or_fail();
  const pointer = hb.malloc(sfnt.byteLength);
  if (!input || !pointer) throw new Error('Font subsetting ran out of memory');
  new Uint8Array(hb.memory.buffer).set(sfnt, pointer);
  const blob = hb.hb_blob_create(pointer, sfnt.byteLength, HB_MEMORY_MODE_WRITABLE, 0, 0);
  const face = hb.hb_face_create(blob, 0);
  hb.hb_blob_destroy(blob);
  try {
    // Keep every layout feature, not just the ones HarfBuzz keeps by default.
    const features = hb.hb_subset_input_set(input, HB_SUBSET_SETS_LAYOUT_FEATURE_TAG);
    hb.hb_set_clear(features);
    hb.hb_set_invert(features);
    const unicodes = hb.hb_subset_input_unicode_set(input);
    for (const codePoint of codePoints) hb.hb_set_add(unicodes, codePoint);
    for (const [axis, value] of Object.entries(pinnedAxes)) {
      if (!hb.hb_subset_input_pin_axis_location(input, face, tagNumber(axis), value)) {
        throw new Error(`Couldn't pin the font's ${axis} axis`);
      }
    }

    const subset = hb.hb_subset_or_fail(face, input);
    if (!subset) throw new Error("Couldn't subset a font");
    const subsetBlob = hb.hb_face_reference_blob(subset);
    const data = hb.hb_blob_get_data(subsetBlob, 0);
    // Copied out, as HarfBuzz frees its memory below.
    const bytes = new Uint8Array(hb.memory.buffer, data, hb.hb_blob_get_length(subsetBlob)).slice();
    hb.hb_blob_destroy(subsetBlob);
    hb.hb_face_destroy(subset);
    return bytes;
  } finally {
    hb.hb_subset_input_destroy(input);
    hb.hb_face_destroy(face);
    hb.free(pointer);
  }
}

/**
 * A WOFF2 font cut down to the glyphs for `codePoints` (and the glyphs their
 * layout features reach), as a WOFF file, or undefined if the font has none
 * of them. `pinnedAxes` fixes variation axes at a value, like `{ wdth: 96 }`,
 * which drops their data.
 */
export async function subsetFont(
  woff2: Uint8Array,
  codePoints: Iterable<number>,
  pinnedAxes: Record<string, number> = {},
): Promise<Uint8Array | undefined> {
  const [hb, sfnt] = await Promise.all([loadHarfBuzz(), decompressWoff2(woff2)]);
  const subset = subsetSfnt(hb, sfnt, codePoints, pinnedAxes);
  // A font without the characters keeps only .notdef.
  if (glyphCount(readSfnt(subset).tables) <= 1) return undefined;
  return sfntToWoff(subset);
}
