# TODO

Feature checklist from `spec.md`. Ticked items are in the MVP.

## Project setup

- [x] Scaffold with the Solid CLI (`basic` template; router, meta and demo routes removed)
- [x] `.gitignore`, `AGENTS.md`, `CLAUDE.md` → `AGENTS.md`
- [x] Component tests for the editor/preview wiring
  - `src/App.test.tsx`. jsdom can't drive contenteditable input, so typing dispatches the transaction CodeMirror's input handling would; `vitest-setup.ts` stubs the layout APIs jsdom lacks.

## Layout

- [x] Collapsible sidebar listing open documents
- [x] Source, preview, and side-by-side views
- [x] Resizable sidebar and split panes
- [x] Small toolbar and status bar; editor/preview fill the rest
- [x] Keyboard-accessible resizers (arrow keys)
  - Focusable separators: Left/Right move a step, Shift+Left/Right a larger step, Home/End jump to the limits.
- [x] Narrow screens: sidebar as an overlay, no split view below ~700px
  - The sidebar opens over the workspace and closes on Escape, a click outside, or selecting a document. A stored split view shows the last single pane, and choosing a pane there keeps split view stored, so widening the window restores it.

## Presentation and style

- [x] System sans font for UI, system mono font for source
- [x] Lucide icons
- [x] Greyscale palette + accent; 0.15s text/icon and 0.25s background transitions
- [x] 760px max content width
- [x] Fluid preview type between 360px and 800px pane width (font size 1rem → 1.125rem, line height 1.4 → 1.6)
- [x] Source syntax highlighting, including fenced code languages
- [x] Highlight `$…$` / `$$…$$` maths in the source
  - `src/editor/math.ts` follows the preview's delimiter rules, quirks included: a `$$` block runs past blank lines to the next line containing `$$` (or the end of its container). One difference: in a blockquote the block ends with the last `>` line, where the preview also takes lazy unquoted lines.
- [x] Syntax highlighting for fenced code blocks in the preview
  - Same Lezer parsers and `tok-*` colours as the source. Code shows unhighlighted until its language loads, then only the blocks waiting for it re-render.

## Features

- [x] Undo/redo, with separate history per document
- [x] LaTeX via KaTeX
- [x] Light/dark toggle: stores an override only when it differs from the system preference
- [x] New, open, and save (File System Access API, with file input/download fallback)
- [x] Auto-backup of open documents to localStorage
- [x] Persist file handles in IndexedDB so Save writes to the same file after a reload
  - The first save to a restored handle asks for write permission, and asks where to save if it's refused. Tabs share the handles; closing a document in any tab removes its handle.
- [x] Unsaved-changes indicator (sidebar dot); confirm before closing unsaved documents
- [x] Avoid opening the same file twice (matched by file handle, so files opened without the File System Access API can't be matched)
- [x] Rename documents
  - Double-click a name in the sidebar, or press F2 on it. Enter or leaving the input renames; Escape cancels; empty names aren't allowed.
  - A renamed document is unlinked from its file: the next Save asks where to save it under the new name, and opening the old file opens a new document. Renaming it back to the file's name links it again. This leaves files on disk alone (`FileSystemHandle.move()` isn't widely supported for local files, and a sidebar rename that moves files would be surprising).
- [x] Sync scrolling between panes in split view, with a toggle
- [x] Alt-click in the preview jumps to the source, and vice versa
  - Opens split view when the other pane is hidden. Narrow screens switch to the other pane instead.
- [x] Cursor line and column
- [x] Word, character, and line counts
- [x] Incremental preview: per-block HTML cache and keyed DOM reuse
- [x] Skip inline parsing for unchanged blocks
  - The whole document is still split into blocks on each change; inline parsing and rendering only run for blocks that aren't cached.
- [x] Find and replace (CodeMirror search panel)
- [x] PWA: web manifest and precaching service worker
- [x] Open `.md` files from the OS when installed (manifest `file_handlers` + `launchQueue`)
  - `launch_handler` is `focus-existing`, so launched files open in an open window instead of a new one. Only the manifest and a fake queue are tested; the real launch needs the installed app.
- [x] PNG and maskable icons for wider install support
  - Generated from `public/icon.svg` by `node scripts/icons.mjs` (needs `rsvg-convert`); rerun it after changing the SVG.
- [x] Prompt to reload when a new version is available
  - A new service worker waits until Reload is clicked, then every open tab reloads. The documents backup syncs on `pagehide`, so unsaved edits survive. The app checks for updates hourly and when the page becomes visible, and says once when it's ready to work offline.
- [x] Drag and drop files to open them
  - Dropped files open with their handles where the browser gives them (Chromium), so Save writes back to them. Files that aren't text, and folders, are reported instead of opened. Dragged text still drops into the editor.
- [x] Display checkboxes using `- [ ]` (and its checked variant)
  - Read-only (disabled); clicking them doesn't edit the source.
- [x] Export as self-contained HTML document
  - Inlines the tokens, syntax and preview CSS; KaTeX's CSS and WOFF2 fonts (about 400 KB) only when the document has maths. Follows `prefers-color-scheme`.

## Hardening

- [x] Sanitise preview HTML, then allow raw HTML in markdown
  - DOMPurify, without `<style>` and `<form>`. The preview clips raw HTML (`contain: paint`), so inline `position: fixed` can't cover the app.
  - A raw HTML block that leaves elements open (like `<details>` around markdown) is grouped with the blocks up to the one that closes them.
- [x] Replace `alert()` error reporting with in-app notices
  - `showNotice` in `state/notices.ts`. Info notices close after 6s (paused while hovered or focused); errors stay until dismissed. The unsaved-changes `confirm()` stays.
- [x] Flush the pending auto-backup on `pagehide` (and when the page is hidden)
- [x] Share the auto-backup between tabs: each sync merges this tab's documents with the stored backup (three-way, by document id, against the backup as the tab last synced it), and `storage` events and page show/hide sync straight away, so tabs pick up each other's edits instead of overwriting them
