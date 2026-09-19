# Agent Guide

Easy Marko is a single-page, client-only Markdown editor that works offline and installs as a PWA. `FEATURES.md` lists what's built and the behaviour decisions behind each feature; `TODO.md` holds planned work.

This is a SolidJS 2.x project. Solid is not React: components run once (there is no re-render), reactivity is fine-grained through signals, and effects/memos have Solid-specific semantics. Do not port React patterns.

**Read `node_modules/solid-js/CHEATSHEET.md` before writing or changing Solid code.** For async code (anything that awaits and feeds the UI), follow `.claude/skills/solid-async/SKILL.md`. The Solid 2.0 RFCs are in `docs/solid-2.0/`.

## Commands

- `npm run dev`: dev server on http://localhost:3000
- `npm run build`: static build in `dist/client`; `npm run serve` previews it
- `npm test`: vitest (jsdom). Tests sit beside the code they cover.
- `npm run typecheck`, `npm run lint`
- `npm run status -- [dev|preview] [--wait]`, `npm run stop -- [dev|preview|<pid>]`: list or stop the servers running from this folder (see below)
- `npm run generate-logo`: regenerate all the logo artwork in `scripts/logo/` (see below)

## Instructions

- Run `npm run status` before testing with a server. Use an existing server if one exists. Otherwise start your own server, and stop it after testing with `npm run stop -- <pid>`.
- When merging, fast-forward if possible.
- Update FEATURES.md when adding or modify features. Keep the document concise but comprehensive.
- There's no formatter. Don't run Prettier; match the surrounding style by hand (single quotes, lines up to about 120 characters).

## Structure

- `src/App.tsx`: layout root. Calls each app-wide `use*` hook once.
- `src/Document.tsx`: the HTML shell (head tags, pre-paint theme script). Prerendered at build time; ships no JS.
- `src/app-info.ts`: the app's name and description, shared by `Document.tsx` and the manifest in `vite.config.ts`. Both read the page colour from `--color-bg` in `tokens.css` (`lib/css-tokens.ts`).
- `src/components/`: UI components.
- `src/state/`: app state as module-level signals and stores, action functions, and `use*` hooks for their effects (persistence, cross-tab backup sync, theme sync).
  - `notices.ts`: `showNotice()` for in-app messages and errors (no `alert()`), and `errorMessage()` to show a caught error. Rendered by `components/Notices.tsx`.
  - `granted-folders.ts`: the cached list of folders granted for local images, used by the preview and HTML export.
  - `stored-list.ts`: a list kept in IndexedDB, read as an async memo (recent files, granted folders).
  - `layout.ts`: what the layout shows, from the settings and window width (narrow windows overlay the sidebar and have no split view). Read `viewMode()`/`sidebarOpen()` from it, not the stored settings.
  - `pane-link.ts`: scroll sync and alt-click jumps between the source and preview. Relies on the preview blocks' `data-line`/`data-end-line` attributes.
  - `scroll-positions.ts`: each document's saved scroll position, which `pane-link.ts` restores.
- `src/editor/`: CodeMirror extensions/theme, plus the controller other modules use to reach the editor.
- `src/lib/`: framework-free helpers (Markdown rendering in `markdown.ts`, with syntax plugins (maths, task lists, footnotes, alerts) and top-level block splitting (`markdown-blocks.ts`) in `markdown-*.ts`, HTML sanitising, code highlighting, HTML export (fonts it embeds in `export-fonts.ts`, subset by `font-subset.ts`; the CSS it inlines is cut to what the document uses by `css-optimize.ts`), local images (`local-images.ts`), files, file handle permissions and identity (`file-access.ts`), storage (localStorage in `storage.ts`, IndexedDB stores in `database.ts`), backup merging, scroll mapping, text stats, pointer drags that outlive their element (`drag.ts`) and dragging list items to reorder them (`list-drag.ts`), `events.ts` for adding and removing a group of DOM listeners together, `timers.ts` for timers that return their own cancel function, and `scheduler` for a call that runs once however often it's scheduled while waiting).
- `src/reactive.ts`: Solid primitives with no app knowledge: `createMediaQuery` for a media query as a signal, `createAttachment` for publishing something a component mounts.
- `src/shortcuts.ts`: app-wide keyboard shortcuts. `src/pwa.ts`: service worker registration.
- `src/content/welcome.md`: the document opened on first run.
- `src/styles/`: `tokens.css` (palette, type, spacing, transitions), `base.css` (layout and controls), `editor.css` (syntax colours), `markdown.css` (preview typography), `fonts.css` (fallback faces; the web fonts are Fontsource imports in `App.tsx`).
- `public/`: static assets.
- `scripts/`: `server.mjs` lists and stops this folder's local servers. `logo/` generates all the logo artwork from Figtree outlines; run `npm run generate-logo` (`generate.mjs`) after changing the font, colours, or logo geometry, rather than its steps individually: `glyphs.mjs` (shared font-shaping helpers), `icon.mjs` (`public/icon.svg`), `wordmark.mjs` (the transparent wordmark `assets/banner.svg`), `app-icons.mjs` (the PWA's PNG icons, from `icon.svg`), `tiling.mjs` (the transparent tiling `assets/tiling.svg`), `banner.mjs` (layers `tiling.svg` and the wordmark into `public/banner.svg`, shown atop the welcome document), `og-image.mjs` (`public/og-image.png`, the link preview: the banner's layers over a larger tiling).

## Code conventions

- Solid 2 conventions are in the cheatsheet.
- Icons: import icon data from `lucide` and render it with `<Icon>`/`<IconButton>`.
- The UI is minimalist: greyscale plus one accent colour, and a small toolbar and status bar so the editor and preview are nearly fullscreen.
- CSS: use the tokens in `tokens.css` and add new ones only when needed. `markdown.css` is only for rendered Markdown (it's also used in exported HTML); app UI in or around the preview goes in `base.css`, and the sanitiser strips `base.css` classes and ids from Markdown. Prefer semantic class names; keep utility classes (like `.push-end`) for cases where they make the code simpler. Colours use `light-dark()`.
- The preview is written with `innerHTML` and Markdown may contain raw HTML: pass rendered HTML through `sanitizeHtml` (`src/lib/sanitize.ts`) before it's shown or exported.
- Feature-detect optional browser APIs by type (`typeof window.showOpenFilePicker === 'function'`), not truthiness: where a browser lacks one, an element in the preview with that id or name appears as `window.<name>`.
- Keep `AGENTS.md` short: only include locations of important files and instructions. No extraneous information.

## Versioned skills (in node_modules; read on demand)

- `node_modules/solid-js/skills/reactivity-diagnostics/SKILL.md`: repair guide mapping every dev-mode diagnostic code (e.g. `REACTIVE_WRITE_IN_OWNED_SCOPE`, `STRICT_READ_UNTRACKED`) to its prescribed fix. Read it whenever a Solid diagnostic code appears in test output or the browser console.
- `node_modules/@solidjs/diagnostics/skills/agent-loops/SKILL.md`: how to capture reactive evidence (which scopes re-ran and why, wasted recomputes, cost tables) and assert budgets, in tests and against live pages.
