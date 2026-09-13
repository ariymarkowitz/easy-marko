# TODO
- [ ] Bug: In linked mode, Scrolling in prievew mode and switching to split mode snaps to the last editor scroll position
  - Similarly, switching from preview to editor or vice versa in linked mode should jump to the corresponding location
    - Solution: Always track the scroll position for each pane, to determine the jump location?