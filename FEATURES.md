# Features

Everything Easy Marko does, with the behaviour decisions behind it.

## Layout

- Toolbar, sidebar, workspace and status bar. The editor and preview take up nearly the whole window.
- The toolbar, sidebar and status bar share the page background with no dividers. The source and preview panes are bordered boxes with rounded corners, a shade darker than the page (exported HTML uses the same shade), and the find panel sits on the page above the source pane's border, separated by a 5px gap that is also the resizer. Edge buttons join the pane beside them like tabs.
- Three views: source, preview, or side by side. Settings (view, sidebar width, split ratio, scroll sync) persist in localStorage.
- The sidebar lists open documents and recent files. It can be resized and collapsed.
- Resizers for the sidebar and split panes. They're focusable separators: Left/Right move a step, Shift+Left/Right a larger step, Home/End jump to the limits.
- Hide a panel by dragging its edge. Dragging the sidebar resizer below half its minimum width closes the sidebar. Dragging a split pane closer to the edge than half its minimum hides that pane. Dragging back in the same drag shows it again, and a hidden panel keeps its earlier size.
- Buttons appear on edges after the pointer rests near them for 0.2s (inside a resizer's hit area, or within 16px of the window's left or right edge). They hide once the pointer is 20px away or leaves the window. Resizers get a hide button for each collapsible side. Window edges and the sidebar resizer get a show button for each panel hidden on that side. Clicking a button runs it, and dragging it drags the edge, so a hidden panel can be pulled open. These buttons aren't in the tab order, since the toolbar has the same controls.
- Narrow windows (below about 700px) show the sidebar as an overlay, which closes on Escape, an outside click, or picking a document. Split view isn't available there. A stored split view shows the last single pane, and picking a pane keeps split view stored, so widening the window brings it back. Narrow windows have no edge buttons.
- The window title shows the active document's name, followed by the app's name except in the installed app, whose window already shows it first.

## Presentation

- System sans font for the UI. The preview uses Instrument Sans for text (97% size, 96% width, 5% extra word spacing), Figtree for headings, and JetBrains Mono (ligatures off) for code, which the source uses too. Lucide icons.
- Fonts are self-hosted variable fonts (Fontsource), split into subsets by `unicode-range`, so a document downloads only the subsets it uses. The service worker precaches Latin and Latin Extended and caches other subsets when first used. Only the body font's Latin file is preloaded. Until the fonts load, text shows in Arial scaled to the web fonts' widths and vertical metrics, so the swap barely moves it. Scripts Instrument Sans and Figtree don't cover fall back to the system font. The editor measures its text again when a font loads.
- Greyscale palette plus one accent. Text and icons ease over 0.15s, backgrounds over 0.25s.
- Light and dark themes follow the system. The toggle stores an override only when it differs from the system preference, and a script in the page head applies it before first paint.
- The preview is at most 800px wide and the source fills its pane. Preview type scales between 360px and 800px of pane width (font size 1rem to 1.125rem, line height 1.4 to 1.6). Body text is 97% of that size and the rest of the preview's em sizes follow it, except code, which is 85% of the unscaled size, and footnotes' line height. Front matter is 0.9em of the text around it. These factors are tokens in `tokens.css`.
- Status bar: cursor line and column, and word, character and line counts.

## Documents and files

- Several open documents, each with its own undo history. New documents are named `Untitled.md`. First run opens a welcome document. The About button (info icon) opens a fresh copy of it, or switches to an open copy that's unedited and not linked to a file.
- New, open and save use the File System Access API, falling back to a file input and download. Open accepts `.md`, `.markdown`, `.mdown` and `.txt`. Shortcuts: Cmd/Ctrl+O opens, Cmd/Ctrl+S saves.
- IndexedDB stores file handles, so Save writes to the same file after a reload. The first save to a restored handle asks for write permission, and asks where to save if that's refused. Tabs share handles, and closing a document in any tab removes its handle.
- The same file won't open twice. Matching uses file handles, so files opened without the File System Access API can't be matched.
- A dot in the sidebar marks unsaved documents. Closing one asks for confirmation.
- Rename by double-clicking a name in the sidebar or pressing F2 on it. Enter or blur renames, Escape cancels, and empty names aren't allowed. Renaming unlinks the document from its file, so the next Save asks where to save. Renaming it back links it again. Files on disk are never moved.
- Drop files on the window to open them. Chromium provides handles for dropped files, so Save writes back to them. Folders and non-text files get reported instead. Dragged text still drops into the editor.
- Recent files: the sidebar lists the 10 files opened or saved most recently, newest first. Clicking one opens it, or switches to it if it's already open, asking for read permission after a reload. Moved or deleted files get reported and removed, and the X button removes one by hand. Only files with handles appear (Chromium). The list lives in IndexedDB, is shared by tabs, and reloads when the window gains focus.
- File changes on disk: while the page is visible, the app checks linked files every 2s and on window focus, reading a file only when its modification time changes. A file counts as changed when it matches neither the saved nor the current content. A file that now matches the document marks it saved. The notice offers Reload and says when reloading discards unsaved changes. Reload goes through the editor, so it can be undone. A dismissed notice returns only after another change, and it closes when the document is closed or renamed. Handles restored after a reload aren't checked until permission is granted again by saving.
- Export as a self-contained HTML file. It inlines the app's tokens, syntax and preview CSS, plus KaTeX's CSS only when the document has maths. Local images the app can already read become data URIs. The export keeps the theme the app shows when exporting, set through `data-theme` on its `<html>`. While the file builds (after the save dialog closes), the export button shows a spinning icon, its label reads "Exporting as HTML…", and further clicks are ignored.
  - Fonts are embedded as WOFF data URIs, only those the document shows. Text faces are picked by where text appears (body, headings, code), italics, and subsets whose `unicode-range` covers the characters. KaTeX faces are picked by the classes KaTeX's stylesheet sets fonts by.
  - Each font is cut down to the characters it shows with HarfBuzz's hb-subset (WebAssembly), keeping all layout features and variation axes, except the body's width, which is pinned at 96. A font with none of its characters is left out. The WOFF2 files are decoded with `woff2-encoder` and packed as WOFF 1.0 with `CompressionStream`, since a WOFF2 encoder is a much larger download. The subsetter loads on the first export and is precached, so exports work offline. The welcome document's fonts come to about 45 KB, and a few formulas' maths fonts to about 20 KB (KaTeX's full set is 400 KB).

## Backup and tabs

- Open documents back up to localStorage automatically. The pending backup flushes on `pagehide` and when the page is hidden.
- Tabs share the backup. Each sync does a three-way merge by document id against the backup as that tab last saw it, and keeps each document's latest version, so a tab that's behind can't undo newer edits. Each tab stores its own active document outside the shared backup. `storage` events and page show/hide trigger a sync immediately.

## Editor

- CodeMirror 6 with Markdown syntax highlighting, including fenced code languages and `$…$`/`$$…$$` maths. Maths highlighting follows the preview's delimiter rules. One difference: a `$$` block in a blockquote ends at the last `>` line, where the preview also takes lazy lines.
- Line wrapping, active line highlight, bracket matching, selection match highlighting, and Tab to indent. Escape then Tab moves focus out of the editor (CodeMirror's escape hatch, mentioned in the welcome document). The editor is labelled "Markdown source" for screen readers.
- Find and replace (Cmd/Ctrl+F) opens a panel at the top of the editor, in place of CodeMirror's default. Toggles for match case, whole word and regular expressions sit inside the find field. The panel shows the match count ("2 of 5", counted up to 1000). Enter finds the next match, Shift+Enter the previous one, and Alt+Enter selects all. In the replace field, Enter replaces the next match and Cmd/Ctrl+Enter replaces all. An invalid regular expression turns the find text red. Toolbar buttons for undo, redo and find. The find button is a toggle: it shows as pressed while the panel is open, and clicking it again closes the panel and returns focus to the editor. It's disabled in preview mode, where the browser's own find works; an open panel stays open and shows again on returning to the source.
- Formatting shortcuts: Cmd/Ctrl+B bold, Cmd/Ctrl+I italic, Cmd/Ctrl+K link, Cmd/Ctrl+Shift+X strikethrough.
  - These wrap the selection, or unwrap it if it's already wrapped (markers just outside or at the ends of the selection). `*` and `_` both count, and in `***x***` bold and italic can be removed separately. Underscores inside words aren't emphasis. At a cursor, the shortcut inserts empty markers, or removes them if the cursor sits between empty markers.
  - Cmd/Ctrl+K puts the cursor where the URL goes, or in the link text if the selection is a URL. On a selected link or its text, it unlinks. Cmd/Ctrl+I replaces CodeMirror's "select parent syntax".
- `(`, `[` and `{` auto-close in Markdown text. Quotes don't, so apostrophes type normally. Fenced code uses its own language's brackets.
- Typing `*`, `_` or `` ` `` with a non-empty selection outside code wraps it. A code span gets a backtick run longer than any inside the selection.
- Pasting a URL over selected text makes a link. The pasted text is trimmed and has to be a single `http(s)` or `mailto` URL. The selection has to be on one line, outside code, and not a URL itself. URLs with unbalanced parentheses go in `<…>`.

## Preview

- markdown-it with raw HTML, linkify and typographer, plus tables and strikethrough.
- YAML front matter: a `---` line at the very top, up to a closing `---` or `...` line, renders as a YAML-highlighted code block whose lines wrap, in slightly smaller type, with square corners, rules above and below, and keys in the accent colour. The source pane highlights it as YAML too. YAML keys are in the accent colour in both panes, in front matter and fenced YAML alike. Unclosed, indented or nested front matter stays ordinary Markdown.
- KaTeX maths, at 1.18em so its x-height matches the body text's. Inline `$…$` follows Pandoc's rules, so amounts like `$5 and $10` stay text.
- Fenced code highlighting uses the editor's Lezer parsers and colours. Code shows plain until its language loads, and then only the blocks waiting on that language re-render.
- Code colours follow the Alabaster theme from tonsky.me's syntax highlighting guide, in the app's palette: constants (strings, numbers, booleans, null) are green, variables where they're defined are blue, functions, classes, types and members where they're defined are purple, and comments are orange-brown italic. Keywords, variable uses, calls and operators stay plain, and punctuation is muted. The same colours apply in the source pane, the preview and HTML exports.
- Task lists: `- [ ]` and `- [x]` render as disabled checkboxes, labelled by the item's text. An item with only a marker shows just the checkbox.
- Heading anchors use GitHub's ids: lowercase, punctuation dropped, spaces to hyphens, repeats numbered (`notes`, `notes-1`). Headings in raw HTML don't get ids. Clicking a fragment link scrolls the preview (and the source, with scroll sync) without changing the URL. `#` and `#top` go to the top.
- Footnotes: `[^label]` references and `[^label]: text` definitions, with indented continuation lines. Labels are case-insensitive and can't contain spaces. A reference to an undefined note stays text. Notes are numbered by first reference and listed at the end with back links. Unreferenced notes and repeat definitions are hidden.
- GitHub alerts: `> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`. The marker must be alone on the first line of a top-level blockquote (any case) and have content after it. Note, tip and important use the accent colour. Warning and caution use the danger colour.
- Local images with relative paths, for documents linked to a file (Chromium only). An image that can't load shows an "Allow access" placeholder, which opens a folder picker starting at the file, or asks for permission again if a stored folder already contains the file. Paths resolve from the highest granted folder containing the file. A granted folder without the image shows "not found". `../` paths need a higher folder, and absolute paths aren't supported. Images load into `blob:` URLs that last while the page is open. Folder handles persist in IndexedDB, so later files in a granted folder show their images straight away.
- Incremental rendering. The document is split into blocks on every change. Only uncached blocks get parsed and rendered, and the DOM reuses nodes by key. Heading ids and footnote numbers depend on earlier blocks, so cached blocks keep their slugs and labels, and a block whose ids changed is parsed again in a second pass.

## Linking the panes

- Scroll sync in split view, with a toolbar toggle.
- Each document keeps its scroll position: the source line at the top of each pane, and which pane was scrolled last. Switching documents, showing a hidden pane, and reloading all return to it. With scroll sync on, both panes follow the pane scrolled last. Positions persist in localStorage and are dropped when a document closes.
- With scroll sync on, changing the view keeps the place. The app records the source line at the top of the pane the user last scrolled. A pane that's shown, alone or beside the other, opens at that line, and split view follows the pane that was showing. The preview also returns to that line when split view narrows or widens it.
- Alt-click in the preview jumps to that spot in the source, and vice versa. If the other pane is hidden, this opens split view. Narrow windows switch panes instead. A jump into the preview briefly highlights the block it lands on, unless the system asks for reduced motion.

## Safety

- DOMPurify sanitises all preview and export HTML, and strips `<style>`, `<form>`, and the app's own classes and ids. Heading ids that name `document` properties (like `title`) are kept.
- The preview clips raw HTML (`contain: paint`), so `position: fixed` can't cover the app.
- A raw HTML block that leaves elements open (like `<details>` around Markdown) is grouped with the blocks up to the one that closes them.
- Optional browser APIs are feature-detected by type, so an element id in the preview can't pose as one.
- Messages and errors show as in-app notices. Info notices close after 6s, pausing while hovered or focused. Errors and notices with actions stay until dismissed. Screen readers hear messages through two live regions (status for info, alert for errors) that stay in the page, since a region added along with its message is often missed. Escape dismisses a focused notice. The only native dialog left is the unsaved-changes `confirm()`.

## Offline and install

- PWA with a web manifest and a precaching service worker. PNG and maskable icons are generated from `public/icon.svg` by `npm run generate-logo` (needs `rsvg-convert`).
- Logo: Figtree at weight 800, outlined into `public/icon.svg` and the wordmark `assets/banner.svg` by `npm run generate-logo` (`scripts/logo/`). The E's top and bottom bars meet the M, and its shorter middle bar tapers to a point. The wordmark `#EASYMARKO` uses that E, over "Markdown editor" in Figtree at weight 400. The welcome banner tiles the E and M squared up behind the wordmark on a translucent black background, so the page shows through, with the M's legs and flat tops as thick as the E's bars.
- Link previews: Open Graph and Twitter card tags with `public/og-image.png` (1200×630), the banner's tiling and wordmark on the dark theme's background, with the tiling grown to fill it, generated by `npm run generate-logo` (needs `rsvg-convert`). Preview URLs are absolute, from `APP_URL` in `src/app-info.ts`.
- Update prompt: a new service worker waits until Reload is clicked, then every open tab reloads. Unsaved edits survive through the backup. The app checks for updates hourly and when the page becomes visible, and says once when it's ready to work offline.
- Once installed, `.md` files open from the OS through `file_handlers` and `launchQueue`. `launch_handler` is `focus-existing`, so files open in an existing window.

## Development

- Solid 2, Vite, CodeMirror 6, markdown-it, KaTeX, DOMPurify.
- Vitest with jsdom, tests beside the code. `src/App.test.tsx` covers the editor and preview wiring. jsdom can't drive contenteditable input, so tests dispatch the transaction CodeMirror's input handling would, and `vitest-setup.ts` stubs the layout APIs jsdom lacks.
- `npm run status` and `npm run stop` list and stop this folder's dev and preview servers.
