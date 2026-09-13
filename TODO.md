# TODO
- [ ] Make find/replace panel more aesthetic?
- [ ] Bug: first quote in quote pair 'curls' the wrong way
- [ ] Make inline code radius in em, so it scales with font size (for header)
- [ ] Generate `--color-surface` and `--color-bg` from `src/app-info.ts` with a small Vite plugin, so `tokens.css` doesn't repeat the theme colours
  - Serve a virtual CSS module (e.g. `virtual:app-colors.css`) imported before `tokens.css`; the HTML export inlines CSS with `?raw`, so it needs the module too

- File options (when hovering over the file?):
  - [ ] Is it possible for the app to launch a new instance? If so, support opening a file in a new window
    - Drag a file out of the window to open it in a new window?
  - [ ] Reveal in native file manager?
- [ ] Render a preamble
  - Make it a clear separator with its own style (full-width code block?)
- [ ] Disambiguate files with the same name
  - Prepent file path up to unique directory