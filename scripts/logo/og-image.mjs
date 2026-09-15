// Generates public/og-image.png, the link preview image: the banner's layers
// (banner.mjs) filling a 1200×630 image on the dark theme's background, with a
// tiling (tiling.mjs) grown to cover it and the wordmark (assets/banner.svg,
// from wordmark.mjs) centred. One step of generate.mjs, run after
// wordmark.mjs has written that file.
//
// Needs rsvg-convert from librsvg (`brew install librsvg`).

import { execFileSync } from 'node:child_process';
import { lightDarkToken } from '../../src/lib/css-tokens.ts';
import { bannerLayers, bannerSize } from './banner.mjs';
import { projectPath, readProjectFile } from './files.mjs';
import { tilingSvg } from './tiling.mjs';

export function generateOgImage() {
  const wordmark = readProjectFile('assets/banner.svg');
  const tokens = readProjectFile('src/styles/tokens.css');

  const width = 1200;
  const height = 630;
  const background = lightDarkToken(tokens, '--color-bg').dark;
  /** The wordmark's scale from banner units; the tiling's cells scale with it. */
  const scale = 0.84;

  const x = +((width - bannerSize.width * scale) / 2).toFixed(1);
  const y = +((height - bannerSize.height * scale) / 2).toFixed(1);
  const tiling = tilingSvg({ width, height, cell: (bannerSize.height / 3) * scale });

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="${background}"/>
${bannerLayers({ width, height, tiling, wordmark, transform: `translate(${x} ${y}) scale(${scale})` })}
</svg>`;

  const path = 'public/og-image.png';
  execFileSync('rsvg-convert', ['--width', width, '--height', height, '--output', projectPath(path)], { input: svg });
  console.log(path);
}
