# Easy Marko

A web-based markdown editor with offline capabilities. Can be downloaded as a Progressive Web App.

## Architecture
- Typescript, Vite and Solid 2.0 RC
  - See https://v2.solidjs.com
- Single page, static application (client-loaded JS only)
- CSS: be pragmatic. Use mostly semantic CSS, with utility classes where it makes the code simpler. Avoid duplicated code when the semantic meaning is the same.
- AGENTS.md file, CLAUDE.md links to it

## Layout
- Collapsible Sidebar for current documents
- View source, preview, or side-by-side
- Resizable panes
- Small toolbar, editing/preview should be nearly fullscreen.

## Presentation and style
- System sans font
- System mono font for source
- Lucide icons
- Minimalist UI, greyscale + accent colour
- ~.15s colour transitions for text/icons, .25 for backgrounds
- Max width 760px
- Fluid layout for preview: CSS interpolates the following values between 360px and 800px width:
  - root font size: 
  - root line height: 1.4 to 1.6
- 
- Source has syntax highlighting
- CSS: Stick to a small palette of colours, font sizes, spacing, etc.

## Features
- Undo/redo
- Latex support
- Light/dark toggle
  - Save override when switching away from system preference, remove override when switching to system preference.
- New, save, load from offline
- Local storage for auto-backup?
- In side-by-side mode, sync scrolling between panes (toggleable option)
- Alt click preview to jump to source, or alt click source to jump in preview
- Show cursor line + col number
- Word, character, line count
- Changing the source auto-updates the preview (should be fast, don't re-parse everything if you don't have to)
- Find + replace
- Open md files in the app (if downloaded as a PWA)

## To start off project
- Create a template project through the Solid CLI as described at https://v2.solidjs.com/getting-started/quick-start: `npm init solid@latest`
- Set up the gitignore and repo.
- Create a TODO list of features to implement.
- Create an MVP so the user can confirm the code structure.