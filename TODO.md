# TODO
- [x] Create branch with a dev tool to try different fonts for the headers
  - Done on the `heading-fonts` branch (toolbar Fonts panel: Google and local families, sizes, weights, variable axes, Copy CSS).
- [x] Implement the fonts chosen with the `heading-fonts` tool
- [x] Subset fonts in HTML exports to the glyphs the document uses
  - Browser print-to-PDF already subsets and embeds web fonts, if PDF export is added.
- [ ] Put a `<Loading>` boundary around the preview, so it shows that it's loading on first load
  - Local image access (`src/state/local-images.ts`) is an async memo, and without a boundary the app's root mount waits for it (dev warns `ASYNC_OUTSIDE_LOADING_BOUNDARY`).
