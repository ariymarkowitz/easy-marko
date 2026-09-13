# TODO
- [ ] Bug: In linked mode, Scrolling in prievew mode and switching to split mode snaps to the last editor scroll position
  - Similarly, switching from preview to editor or vice versa in linked mode should jump to the corresponding location
    - Solution: Always track the scroll position for each pane, to determine the jump location?
- [ ] Bug: Recent Files missed some files when dragging in multiple (~4) files at the same time
- [ ] Make find/replace panel more aesthetic?
- [ ] Bug: first quote in quote pair 'curls' the wrong way
- [ ] Make inline code radius in em, so it scales with font size (for header)

- File options (when hovering over the file?):
  - [ ] Is it possible for the app to launch a new instance? If so, support opening a file in a new window
    - Drag a file out of the window to open it in a new window?
  - [ ] Reveal in native file manager?