# Agent Guide

Easy Marko is a single-page, client-only markdown editor that works offline and installs as a PWA. The product spec is in `spec.md`; feature status is tracked in `TODO.md`.

This is a SolidJS 2.x project. Solid is not React: components run once (there is no re-render), reactivity is fine-grained through signals, and effects/memos have Solid-specific semantics. Do not port React patterns.

**Read `node_modules/solid-js/CHEATSHEET.md` before writing or changing Solid code.** It matches the installed version and ends with the list of 2.0 changes that Solid 1.x habits get wrong.

## Commands

- `npm run dev`: dev server on http://localhost:3000
- `npm run build`: static build in `dist/client`; `npm run serve` previews it
- `npm test`: vitest (jsdom)
- `npm run typecheck`, `npm run lint`

## Structure

- `src/App.tsx`: layout root. Calls each app-wide `use*` hook once.
- `src/Document.tsx`: the HTML shell (head tags, pre-paint theme script). Prerendered at build time; ships no JS.
- `src/components/`: UI components.
- `src/state/`: app state as module-level signals and stores, action functions, and `use*` hooks for their effects (persistence, theme sync).
- `src/editor/`: CodeMirror extensions/theme, plus the controller the toolbar and status bar use to reach the editor.
- `src/lib/`: framework-free helpers (markdown rendering, files, storage, text stats). Unit tests sit beside them.
- `src/styles/`: `tokens.css` (palette, type, spacing, transitions), `base.css` (layout and controls), `editor.css` (syntax colours), `markdown.css` (preview typography).
- `public/`: static assets.

## Conventions

- Solid 2 specifics (details in the cheatsheet): `createEffect(compute, apply)` is two-phase. Read reactive values in `compute` only, never in `apply`. Use `onSettled` with a returned cleanup for component setup and teardown, not `onCleanup`. Setters apply on the next microtask, so don't read a value back straight after writing it. Never write signals in component bodies or memos.
- Effects need an owner: create them in components or in `use*` hooks called from components, never at module level.
- Icons: import icon data from `lucide` and render it with `<Icon>`/`<IconButton>`. `lucide-solid` only supports Solid 1.
- CSS: use the tokens in `tokens.css` and add new ones only when needed. Prefer semantic class names; keep utility classes (like `.spacer`) for cases where they make the code simpler. Colours use `light-dark()`; a theme override sets `data-theme` on `<html>`.
- The preview is written with `innerHTML`. Keep markdown-it's `html` option off unless the output is sanitised.

## Versioned skills (in node_modules; read on demand)

The installed packages ship agent references that match their exact installed versions:

- `node_modules/solid-js/CHEATSHEET.md`: one-page Solid 2.0 API reference plus the 1.x → 2.0 footgun list. Read it whenever generating Solid code.

- `node_modules/solid-js/skills/reactivity-diagnostics/SKILL.md`: repair guide mapping every dev-mode diagnostic code (e.g. `REACTIVE_WRITE_IN_OWNED_SCOPE`, `STRICT_READ_UNTRACKED`) to its prescribed fix. Read it whenever a Solid diagnostic code appears in test output or the browser console.
- `node_modules/@solidjs/diagnostics/skills/agent-loops/SKILL.md`: how to capture reactive evidence (which scopes re-ran and why, wasted recomputes, cost tables) and assert budgets, in tests and against live pages.

## Reactive diagnostics: capture evidence instead of guessing

Use these whenever you are debugging reactivity (something doesn't update, updates too often, or is slow) or verifying a change didn't regress update granularity:

- **In tests:** `captureArtifact()` from `@solidjs/diagnostics` wraps a scenario and returns a serializable artifact of diagnostics + rerun attribution; matchers from `@solidjs/diagnostics/vitest` (`toHaveNoDiagnostics`, `toStayWithinRerunBudget`, `toHaveNoWaste`, …) assert on it. No browser needed.
- **Against the running dev server** (`diagnostics: true` in vite.config.ts; dev-only, no-op in builds). Requires an open page connected to the dev server (e.g. via a browser tool):
  - `GET /__solid/diagnostics`: status and connected client count
  - `POST /__solid/diagnostics` with JSON `{"method":"begin"}` then `{"method":"end"}`: capture a session into an artifact
  - `{"method":"whyDidRun","params":{"name":"<scope name>"}}`: recorded re-runs of one named scope in the open session
  - `{"method":"costs"}`: running cost tables for the open session

Name your signals/memos/effects (the `{ name: "..." }` option); attribution reports scopes by name.
