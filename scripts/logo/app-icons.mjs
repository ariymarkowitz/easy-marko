// Generates the PNG app icons in public/ from public/icon.svg (icon.mjs).
// One step of generate.mjs, run after icon.mjs has written that file.
//
// Needs rsvg-convert from librsvg (`brew install librsvg`).

import { execFileSync } from 'node:child_process';
import { projectPath, readProjectFile } from './files.mjs';

/**
 * The icon as a full square: the background rect without its rounded corners,
 * and the artwork on it scaled by `scale` about the centre. For platforms that
 * crop icons to their own shape.
 */
function fullBleed(svg, scale) {
  const match = svg.match(/^([\s\S]*?viewBox="0 0 (\d+) \d+"[\s\S]*?)(<rect[^>]*?) rx="\d+"([^>]*>)([\s\S]*)(<\/svg>\s*)$/);
  if (!match) throw new Error('icon.svg should be a background <rect rx="…"> followed by the artwork');
  const [, head, size, rectStart, rectEnd, artwork, tail] = match;
  const centre = Number(size) / 2;
  const transform = `translate(${centre} ${centre}) scale(${scale}) translate(${-centre} ${-centre})`;
  return `${head}${rectStart}${rectEnd}<g transform="${transform}">${artwork}</g>${tail}`;
}

function render(source, size, file) {
  const path = `public/${file}`;
  execFileSync('rsvg-convert', ['--width', size, '--height', size, '--output', projectPath(path)], { input: source });
  console.log(path);
}

export function generateAppIcons() {
  const svg = readProjectFile('public/icon.svg');

  render(svg, 192, 'icon-192.png');
  render(svg, 512, 'icon-512.png');
  // Maskable icons are cropped to as little as a centred circle 80% as wide
  // as the icon. The artwork's corners reach 44% of the width from the
  // centre, so at 80% scale (35%) they stay inside that circle's 40% radius.
  render(fullBleed(svg, 0.8), 512, 'icon-maskable-512.png');
  // iOS rounds the corners itself and fills transparent pixels with black.
  render(fullBleed(svg, 1), 180, 'apple-touch-icon.png');
}
