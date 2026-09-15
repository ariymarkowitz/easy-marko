// Generates public/og-image.png, the link preview image, from assets/banner.svg
// (the wordmark, from wordmark.mjs): the banner centred on a 1200×630
// background. One step of generate.mjs, run after wordmark.mjs has written
// that file.
//
// Needs rsvg-convert from librsvg (`brew install librsvg`).

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const publicDir = fileURLToPath(new URL('../../public/', import.meta.url));
const bannerFile = fileURLToPath(new URL('../../assets/banner.svg', import.meta.url));

export function generateOgImage() {
  const banner = readFileSync(bannerFile, 'utf8').replace(/^<\?xml[^>]*>\s*/, '');

  const width = 1200;
  const height = 630;
  const background = '#1c1c1c';
  /** The banner's size in its own units. Its artwork is centred. */
  const bannerWidth = 1600;
  const bannerHeight = 400;
  const scale = 0.84;

  const x = +((width - bannerWidth * scale) / 2).toFixed(1);
  const y = +((height - bannerHeight * scale) / 2).toFixed(1);
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
}
