# Agent Guide

Easy Marko is a single-page, client-only markdown editor that works offline and installs as a PWA. `FEATURES.md` lists what's built and the behaviour decisions behind each feature; `TODO.md` holds planned work.

This is a SolidJS 2.x project. Solid is not React: components run once (there is no re-render), reactivity is fine-grained through signals, and effects/memos have Solid-specific semantics. Do not port React patterns.

**Read `node_modules/solid-js/CHEATSHEET.md` before writing or changing Solid code.**

## Commands

- `npm run dev`: dev server on http://localhost:3000
- `npm run build`: static build in `dist/client`; `npm run serve` previews it
- `npm test`: vitest (jsdom). Tests sit beside the code they cover.
- `npm run typecheck`, `npm run lint`
- `npm run status -- [dev|preview] [--wait]`, `npm run stop -- [dev|preview|<pid>]`: list or stop the servers running from this folder (see below)

## Tool conventions

- Run `npm run status` before testing with a server. Use an existing server if one exists. Otherwise start your own server, and stop it after testing with `npm run stop -- <pid>`.
- When merging, fast-forward if possible.

## Structure

- `src/App.tsx`: layout root. Calls each app-wide `use*` hook once.
- `src/Document.tsx`: the HTML shell (head tags, pre-paint theme script). Prerendered at build time; ships no JS.
- `src/components/`: UI components.
- `src/state/`: app state as module-level signals and stores, action functions, and `use*` hooks for their effects (persistence, cross-tab backup sync, theme sync).
  - `notices.ts`: `showNotice()` for in-app messages and errors (no `alert()`). Rendered by `components/Notices.tsx`.
  - `layout.ts`: what the layout shows, from the settings and window width (narrow windows overlay the sidebar and have no split view). Read `viewMode()`/`sidebarOpen()` from it, not the stored settings.
  - `pane-link.ts`: scroll sync and alt-click jumps between the source and preview. Relies on the preview blocks' `data-line`/`data-end-line` attributes.
- `src/editor/`: CodeMirror extensions/theme, plus the controller other modules use to reach the editor.
- `src/lib/`: framework-free helpers (markdown rendering in `markdown.ts` with syntax plugins in `markdown-*.ts`, HTML sanitising, code highlighting, HTML export, local images (`local-images.ts`), files, storage (localStorage in `storage.ts`, IndexedDB stores in `database.ts`), backup merging, scroll mapping, text stats, pointer drags that outlive their element (`drag.ts`), `events.ts` for adding and removing a group of DOM listeners together).
- `src/reactive.ts`: Solid primitives with no app knowledge: `createMediaQuery` for a media query as a signal, `createAttachment` for publishing something a component mounts, `useListeners` for DOM listeners that last as long as the current owner.
- `src/shortcuts.ts`: app-wide keyboard shortcuts. `src/pwa.ts`: service worker registration.
- `src/content/welcome.md`: the document opened on first run.
- `src/styles/`: `tokens.css` (palette, type, spacing, transitions), `base.css` (layout and controls), `editor.css` (syntax colours), `markdown.css` (preview typography).
- `public/`: static assets.
- `scripts/`: development scripts (`server.mjs` lists and stops this folder's local servers; `icons.mjs` regenerates the PNG icons from `public/icon.svg`).

## Code conventions

- Solid 2 conventions are in the cheatsheet.
- Icons: import icon data from `lucide` and render it with `<Icon>`/`<IconButton>`.
- The UI is minimalist: greyscale plus one accent colour, and a small toolbar and status bar so the editor and preview are nearly fullscreen.
- CSS: use the tokens in `tokens.css` and add new ones only when needed. `markdown.css` is only for rendered markdown (it's also used in exported HTML); app UI in or around the preview goes in `base.css`, and the sanitiser strips `base.css` classes and ids from markdown. Prefer semantic class names; keep utility classes (like `.spacer`) for cases where they make the code simpler. Colours use `light-dark()`.
- The preview is written with `innerHTML` and markdown may contain raw HTML: pass rendered HTML through `sanitizeHtml` (`src/lib/sanitize.ts`) before it's shown or exported.
- Feature-detect optional browser APIs by type (`typeof window.showOpenFilePicker === 'function'`), not truthiness: where a browser lacks one, an element in the preview with that id or name appears as `window.<name>`.
- Keep `AGENTS.md` short: only include locations of important files and instructions. No extraneous information.

## Versioned skills (in node_modules; read on demand)

- `node_modules/solid-js/skills/reactivity-diagnostics/SKILL.md`: repair guide mapping every dev-mode diagnostic code (e.g. `REACTIVE_WRITE_IN_OWNED_SCOPE`, `STRICT_READ_UNTRACKED`) to its prescribed fix. Read it whenever a Solid diagnostic code appears in test output or the browser console.
- `node_modules/@solidjs/diagnostics/skills/agent-loops/SKILL.md`: how to capture reactive evidence (which scopes re-ran and why, wasted recomputes, cost tables) and assert budgets, in tests and against live pages.
