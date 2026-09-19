// Shared font-shaping helpers for icon.mjs and wordmark.mjs: loading Figtree,
// shaping text with HarfBuzz, and the logo's custom E glyph. Text is shaped
// into outlines so the generated SVGs need no fonts to render.

import { readFileSync } from 'node:fs';
import * as hb from 'harfbuzzjs';
import decompressWoff2 from 'woff2-encoder/decompress';
import { projectPath } from './files.mjs';

const fontFile = projectPath('node_modules/@fontsource-variable/figtree/files/figtree-latin-wght-normal.woff2');

export const accent = '#4c7bf4';
export const light = '#fafafa';

export async function loadFont() {
  const face = new hb.Face(new hb.Blob(await decompressWoff2(readFileSync(fontFile))));
  return new hb.Font(face);
}

/**
 * The logo's E, in font units (y up) at weight 800: Figtree's E, with the top
 * and bottom bars the same length so they meet the M, and a shorter middle
 * bar ending in a point.
 */
export const E = {
  left: 68,
  stem: 160.8,
  /** The top and bottom bars' length and thickness. */
  width: 460,
  bar: 147.6,
  middle: { bottom: 280.8, top: 424.4 },
  /** Where the middle bar's point is, as a share of the width. */
  point: 0.8,
};

/** The E's outline as path commands, in font units. */
export function eCommands(x = 0) {
  const left = x + E.left;
  const right = left + E.width;
  const { bottom, top } = E.middle;
  const tip = left + E.width * E.point;
  const taper = (top - bottom) / 2;
  const points = [
    [left, 0],
    [left, 700],
    [right, 700],
    [right, 700 - E.bar],
    [left + E.stem, 700 - E.bar],
    [left + E.stem, top],
    [tip - taper, top],
    [tip, bottom + taper],
    [tip - taper, bottom],
    [left + E.stem, bottom],
    [left + E.stem, E.bar],
    [right, E.bar],
    [right, 0],
  ];
  return points.map(([px, py], i) => ({ type: i ? 'L' : 'M', values: [px, py] })).concat({ type: 'Z', values: [] });
}

export const round = (value) => +value.toFixed(2);

/** Path commands in font units as SVG path data, scaled by `size / 1000` with the baseline at `y`. */
export function pathData(commands, x, y, size) {
  const scale = size / 1000;
  return commands
    .map(({ type, values }) => {
      const coords = [];
      for (let i = 0; i < values.length; i += 2) {
        coords.push(round(x + values[i] * scale), round(y - values[i + 1] * scale));
      }
      return type + coords.join(' ');
    })
    .join('');
}

/**
 * Shapes `text` at a weight: each glyph's outline, pen position and ink extent
 * in font units. `shifts` moves glyphs of the given characters horizontally,
 * and carries forward to every glyph after them (so it also closes up or
 * opens up the gap to what follows, like a kerning adjustment).
 */
export function shape(font, text, weight, shifts = {}) {
  font.setVariations([new hb.Variation('wght', weight)]);
  const buffer = new hb.Buffer();
  buffer.addText(text);
  buffer.guessSegmentProperties();
  hb.shape(font, buffer);
  const positions = buffer.getGlyphPositions();
  let pen = 0;
  let inkLeft = Infinity;
  let inkRight = -Infinity;
  const glyphs = buffer.getGlyphInfos().map((info, i) => {
    const char = text[info.cluster];
    const commands = char === 'E' && weight === 800 ? eCommands() : font.glyphToJson(info.codepoint);
    const shift = shifts[char] ?? 0;
    const x = pen + positions[i].xOffset + shift;
    for (const { values } of commands) {
      for (let j = 0; j < values.length; j += 2) {
        inkLeft = Math.min(inkLeft, x + values[j]);
        inkRight = Math.max(inkRight, x + values[j]);
      }
    }
    pen += positions[i].xAdvance + shift;
    return { char, commands, x };
  });
  return { glyphs, inkLeft, inkRight };
}

/** A line of text as paths, its ink centred on `centre`, grouped by colour with `fill(char, index)`. */
export function textPaths(font, text, weight, size, centre, baseline, fill, shifts) {
  const { glyphs, inkLeft, inkRight } = shape(font, text, weight, shifts);
  const scale = size / 1000;
  const start = centre - ((inkLeft + inkRight) / 2) * scale;
  const groups = new Map();
  glyphs.forEach(({ commands, x }, i) => {
    if (!commands.length) return;
    const colour = fill(glyphs[i].char, i);
    groups.set(colour, (groups.get(colour) ?? '') + pathData(commands, start + x * scale, baseline, size));
  });
  return [...groups].map(([colour, d]) => `  <path ${colour} d="${d}"/>`).join('\n');
}
