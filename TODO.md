# TODO
- [x] Create branch with a dev tool to try different fonts for the headers
  - Done on the `heading-fonts` branch (toolbar Fonts panel: Google and local families, sizes, weights, variable axes, Copy CSS).
- [x] Implement the fonts chosen with the `heading-fonts` tool
- [ ] Subset fonts in HTML exports to the glyphs the document uses
  - Exports embed whole Fontsource subset files (`src/lib/export-fonts.ts`), typically 60–250 KB.
  - Subset at export time with HarfBuzz's `hb-subset` (`harfbuzzjs`, WebAssembly, loaded only when exporting), keeping layout features, then compress to WOFF2, or WOFF1 with `CompressionStream('deflate')`. About 30–80 KB for five faces. The same would shrink KaTeX's 400 KB.
  - Browser print-to-PDF already subsets and embeds web fonts, if PDF export is added.
