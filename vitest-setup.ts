// Registers @testing-library/jest-dom's matchers (toHaveTextContent etc.)
// with vitest's expect, including their types.
import '@testing-library/jest-dom/vitest';

// Browser APIs that jsdom lacks, stubbed for component tests. jsdom does no
// layout, so everything measures as empty.

// This matchMedia stand-in never matches, and returns the same list for the
// same query, so a test can set its `matches` and dispatch `change` on it.
// Installed once, as test files share the window.
if (!window.matchMedia) {
  const lists = new Map<string, MediaQueryList>();
  window.matchMedia = (query) => {
    let list = lists.get(query);
    if (!list) {
      list = Object.assign(new EventTarget(), {
        media: query,
        matches: false,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
      }) as MediaQueryList;
      lists.set(query, list);
    }
    return list;
  };
}

// Scroll sync observes both panes in split view.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// CodeMirror measures text through ranges.
Range.prototype.getBoundingClientRect ??= () => new DOMRect();
Range.prototype.getClientRects ??= () =>
  Object.assign([], { item: () => null }) as unknown as DOMRectList;

// The editor measures again when fonts load.
if (!document.fonts) {
  Object.defineProperty(document, 'fonts', { value: new EventTarget() });
}
