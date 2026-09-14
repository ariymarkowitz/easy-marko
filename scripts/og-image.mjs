// Generates public/og-image.png, the link preview image, from public/banner.svg:
// the banner centred on a 1200×630 background. Run it after changing the
// banner, and commit the PNG.
//
//   node scripts/og-image.mjs
//
// Needs rsvg-convert from librsvg (`brew install librsvg`), and the Outfit font
// installed, since the banner's "#" and tagline are text.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const banner = readFileSync(`${publicDir}banner.svg`, 'utf8').replace(/^<\?xml[^>]*>\s*/, '');

const width = 1200;
const height = 630;
const background = '#1c1c1c';
/** The banner's size, and the centre of its artwork, in its own units. */
const bannerWidth = 1600;
const bannerHeight = 400;
const artworkCentre = { x: 800, y: 201.5 };
const scale = 0.84;

const x = +(width / 2 - artworkCentre.x * scale).toFixed(1);
const y = +(height / 2 - artworkCentre.y * scale).toFixed(1);
const nested = banner.replace(
  /<svg\b/,
  `<svg x="${x}" y="${y}" width="${bannerWidth * scale}" height="${bannerHeight * scale}"`,
);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="${background}"/>
  ${nested}
</svg>`;

execFileSync('rsvg-convert', ['--width', width, '--height', height, '--output', `${publicDir}og-image.png`], {
  input: svg,
});
console.log('public/og-image.png');
