// Registers @testing-library/jest-dom's matchers (toHaveTextContent etc.)
// with vitest's expect, including their types.
import '@testing-library/jest-dom/vitest';

// jsdom has no matchMedia. This stand-in never matches, and returns the same
// list for the same query, so a test can set its `matches` and dispatch
// `change` on it. Installed once, as test files share the window.
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
