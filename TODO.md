# TODO

Feature checklist from `spec.md`. Ticked items are in the MVP.

## Project setup

- [x] Scaffold with the Solid CLI (`basic` template; router, meta and demo routes removed)
- [x] `.gitignore`, `AGENTS.md`, `CLAUDE.md` → `AGENTS.md`
- [ ] Component tests for the editor/preview wiring

## Layout

- [x] Collapsible sidebar listing open documents
- [x] Source, preview, and side-by-side views
- [x] Resizable sidebar and split panes
- [x] Small toolbar and status bar; editor/preview fill the rest
- [ ] Keyboard-accessible resizers (arrow keys)
- [ ] Narrow screens: sidebar as an overlay, no split view below ~700px

## Presentation and style

- [x] System sans font for UI, system mono font for source
- [x] Lucide icons
- [x] Greyscale palette + accent; 0.15s text/icon and 0.25s background transitions
- [x] 760px max content width
- [x] Fluid preview type between 360px and 800px pane width (line height 1.4 → 1.6)
  - Font size range isn't given in the spec; using 1rem → 1.125rem. **Confirm.**
- [x] Source syntax highlighting, including fenced code languages
- [ ] Highlight `$…$` / `$$…$$` maths in the source
- [ ] Syntax highlighting for fenced code blocks in the preview

## Features

- [x] Undo/redo, with separate history per document
- [x] LaTeX via KaTeX
- [x] Light/dark toggle: stores an override only when it differs from the system preference
- [x] New, open, and save (File System Access API, with file input/download fallback)
- [x] Auto-backup of open documents to localStorage
- [ ] Persist file handles in IndexedDB so Save writes to the same file after a reload
- [x] Unsaved-changes indicator (sidebar dot); confirm before closing unsaved documents
- [x] Avoid opening the same file twice (only detectable while the file handle is held; see IndexedDB item)
- [ ] Rename documents
- [x] Sync scrolling between panes in split view, with a toggle
- [x] Alt-click in the preview jumps to the source, and vice versa
  - Opens split view when the other pane is hidden.
- [x] Cursor line and column
- [x] Word, character, and line counts
- [x] Incremental preview: per-block HTML cache and keyed DOM reuse
- [ ] Skip inline parsing for unchanged blocks (the whole document is still tokenised on each change)
- [x] Find and replace (CodeMirror search panel)
- [x] PWA: web manifest and precaching service worker
- [ ] Open `.md` files from the OS when installed (manifest `file_handlers` + `launchQueue`)
- [ ] PNG and maskable icons for wider install support
- [ ] Prompt to reload when a new version is available
- [ ] Drag and drop files to open them
- [ ] Display checkboxes using `- [ ]` (and its checked variant)
- [ ] Export as self-contained HTML document

## Hardening

- [ ] Sanitise preview HTML, then allow raw HTML in markdown
- [ ] Replace `alert()` error reporting with in-app notices
- [x] Flush the pending auto-backup on `pagehide` (and when the page is hidden)
