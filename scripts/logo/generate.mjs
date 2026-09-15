// Regenerates every logo asset, in dependency order: the icon and wordmark
// outlined from Figtree, the PNG app icons rasterised from the icon, the
// letter tiling, the combined welcome banner, and the link-preview image.
// Run after changing the font, colours, or logo geometry in this folder, and
// commit the results.
//
//   node scripts/logo/generate.mjs
//
// Needs rsvg-convert from librsvg (`brew install librsvg`).

import { generateAppIcons } from './app-icons.mjs';
import { generateBanner } from './banner.mjs';
import { generateIcon } from './icon.mjs';
import { generateOgImage } from './og-image.mjs';
import { generateTiling } from './tiling.mjs';
import { generateWordmark } from './wordmark.mjs';

await generateIcon();
await generateWordmark();
await generateAppIcons();
await generateTiling();
await generateBanner();
await generateOgImage();
