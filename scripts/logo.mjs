// Generates public/icon.svg and assets/banner.svg from Figtree, the heading
// font: the logo's E and M, and the "#EASYMARKO" wordmark with the logo's E
// over "Markdown editor", on a transparent background. Text is outlined, so
// rendering needs no fonts. Run scripts/icons.mjs afterwards for the PNGs,
// and scripts/combine-banner.mjs and scripts/og-image.mjs to rebuild the
// banners that embed assets/banner.svg.
//
//   node scripts/logo.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as hb from 'harfbuzzjs';
import decompressWoff2 from 'woff2-encoder/decompress';

const root = new URL('../', import.meta.url);
const fontFile = fileURLToPath(
  new URL('node_modules/@fontsource-variable/figtree/files/figtree-latin-wght-normal.woff2', root),
);

const accent = '#4c7bf4';
const light = '#fafafa';
const background = '#1c1c1c';

const face = new hb.Face(new hb.Blob(await decompressWoff2(readFileSync(fontFile))));
const font = new hb.Font(face);

/**
 * The logo's E, in font units (y up) at weight 800: Figtree's E, with the top
 * and bottom bars the same length so they meet the M, and a shorter middle
 * bar ending in a point.
 */
const E = {
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
function eCommands(x = 0) {
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

const round = (value) => +value.toFixed(2);

/** Path commands in font units as SVG path data, scaled by `size / 1000` with the baseline at `y`. */
function pathData(commands, x, y, size) {
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
function shape(text, weight, shifts = {}) {
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
function textPaths(text, weight, size, centre, baseline, fill, shifts) {
  const { glyphs, inkLeft, inkRight } = shape(text, weight, shifts);
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

// The icon: the E and M 384 wide, centred on a 512 square. The E's bars end
// where the M's left stem begins.
const mCommands = shape('M', 800).glyphs[0].commands;
/** Figtree's M stems span 68 to 794.6. */
const mLeft = 68;
const mRight = 794.6;
const logoWidth = E.width + mRight - mLeft;
const iconScale = 384 / logoWidth;
const iconSize = iconScale * 1000;
const iconLeft = 256 - (logoWidth * iconScale) / 2;
const iconBaseline = 256 + (700 * iconScale) / 2;
const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <!-- Generated by scripts/logo.mjs. The E and M are 384 wide, leaving a 64 margin at the sides. -->
  <rect width="512" height="512" rx="96" fill="${background}"/>
  <path d="${pathData(eCommands(-E.left), iconLeft, iconBaseline, iconSize)}" fill="${accent}"/>
  <path d="${pathData(mCommands, iconLeft + (E.width - mLeft) * iconScale, iconBaseline, iconSize)}" fill="${light}"/>
</svg>
`;
writeFileSync(new URL('public/icon.svg', root), icon);
console.log('public/icon.svg');

// The banner: the wordmark over the tagline, centred on 1600×400.
const width = 1600;
const height = 400;
const titleSize = 177;
const taglineSize = 85;
/** From the title's baseline to the tagline's. */
const lineGap = 115;
const capHeight = 700;
const blockHeight = (capHeight * titleSize) / 1000 + lineGap;
const titleBaseline = round(height / 2 - blockHeight / 2 + (capHeight * titleSize) / 1000);

const title = textPaths('#EASYMARKO', 800, titleSize, width / 2, titleBaseline, (char, i) =>
  char === '#' ? `fill="${accent}" fill-opacity="0.5"` : i < 5 ? `fill="${accent}"` : `fill="${light}"`,
  // Figtree's K and O are set a little loose at this weight, and S and Y
  // leave an optical gap where their strokes converge.
  { Y: -22.6, O: -50 },
);
const tagline = textPaths('markdown editor', 500, taglineSize, width / 2, titleBaseline + lineGap, () => 'fill="#e5e5e5"');
const banner = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
  <!-- Generated by scripts/logo.mjs. The wordmark and tagline, transparent so callers can lay their own background behind it. -->
  <title>Easy Marko</title>
${title}
${tagline}
</svg>
`;
writeFileSync(new URL('assets/banner.svg', root), banner);
console.log('assets/banner.svg');
