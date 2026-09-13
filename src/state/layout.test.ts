import { createRoot, flush } from 'solid-js';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { activeDocument, closeDocument, newDocument, selectDocument } from './documents';
import {
  hidePane,
  NARROW_WIDTH,
  revealPane,
  selectViewMode,
  startSidebarDrag,
  startSplitDrag,
  sidebarOpen,
  toggleSidebar,
  useLayout,
  viewMode,
} from './layout';
import {
  setLastPanel,
  setSidebarOpen,
  setSidebarWidth,
  setSplitRatio,
  settings,
  setViewMode,
  SIDEBAR_WIDTH,
} from './settings';

/** Changes the window width as the stand-in matchMedia in vitest-setup.ts sees it. */
function setNarrowWindow(narrow: boolean) {
  const list = window.matchMedia(`(width < ${NARROW_WIDTH}px)`) as { matches: boolean } & EventTarget;
  list.matches = narrow;
  list.dispatchEvent(new Event('change'));
  flush();
}

function run(action: () => void) {
  action();
  flush();
}

let dispose: () => void;

beforeEach(() => {
  dispose = createRoot((dispose) => {
    useLayout();
    return dispose;
  });
  flush();
  run(() => {
    setViewMode('split');
    setLastPanel('source');
    setSidebarOpen(true);
  });
});

afterEach(() => {
  // Test files share modules, so leave a wide window for the next one.
  setNarrowWindow(false);
  dispose();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('view mode', () => {
  test('toggles split view from the view buttons on wide screens', () => {
    run(() => selectViewMode('preview'));
    expect(viewMode()).toBe('preview');
    run(() => selectViewMode('preview'));
    expect(viewMode()).toBe('split');
    run(() => selectViewMode('split'));
    expect(viewMode()).toBe('preview');
  });

  test('shows the last single pane instead of split view on narrow screens', () => {
    setNarrowWindow(true);
    expect(viewMode()).toBe('source');
    expect(settings.viewMode).toBe('split');
    setNarrowWindow(false);
    expect(viewMode()).toBe('split');
  });

  test('switches panes on narrow screens without losing a stored split view', () => {
    setNarrowWindow(true);
    run(() => selectViewMode('preview'));
    expect(viewMode()).toBe('preview');
    run(() => selectViewMode('split'));
    run(() => selectViewMode('preview'));
    expect(viewMode()).toBe('preview');
    expect(settings.viewMode).toBe('split');
    setNarrowWindow(false);
    expect(viewMode()).toBe('split');
  });

  test('stores a single-pane choice made on a narrow screen', () => {
    run(() => setViewMode('source'));
    setNarrowWindow(true);
    run(() => selectViewMode('source'));
    expect(viewMode()).toBe('source');
    run(() => selectViewMode('preview'));
    setNarrowWindow(false);
    expect(viewMode()).toBe('preview');
  });

  test('reveals the hidden pane beside the other on wide screens, and in its place on narrow ones', () => {
    run(() => setViewMode('source'));
    run(() => revealPane('preview'));
    expect(viewMode()).toBe('split');

    setNarrowWindow(true);
    run(() => revealPane('preview'));
    expect(viewMode()).toBe('preview');
    run(() => revealPane('source'));
    expect(viewMode()).toBe('source');
    expect(settings.viewMode).toBe('split');
  });
});

describe('dragging panel edges', () => {
  test('hides a pane, leaving the other as the last single pane', () => {
    run(() => hidePane('source'));
    expect(viewMode()).toBe('preview');
    expect(settings.lastPanel).toBe('preview');
    run(() => hidePane('preview'));
    expect(viewMode()).toBe('source');
    expect(settings.lastPanel).toBe('source');
  });

  test('sizes the sidebar, and closes it below half its minimum width until dragged back', () => {
    run(() => setSidebarWidth(300));
    const drag = startSidebarDrag();
    run(() => drag(250));
    expect(settings.sidebarWidth).toBe(250);
    run(() => drag(SIDEBAR_WIDTH.min / 2 + 1));
    expect(sidebarOpen()).toBe(true);
    expect(settings.sidebarWidth).toBe(SIDEBAR_WIDTH.min);
    run(() => drag(SIDEBAR_WIDTH.min / 2 - 1));
    expect(sidebarOpen()).toBe(false);
    expect(settings.sidebarWidth).toBe(300);
    run(() => drag(250));
    expect(sidebarOpen()).toBe(true);
    expect(settings.sidebarWidth).toBe(250);
    run(() => setSidebarWidth(220));
  });

  test('splits the panes, and hides the pane dragged close to its side until dragged back', () => {
    // A 1000px workspace starting at the window's left edge.
    const workspace = document.body.appendChild(document.createElement('main'));
    workspace.id = 'workspace';
    workspace.getBoundingClientRect = () => new DOMRect(0, 0, 1000, 500);

    run(() => setSplitRatio(0.4));
    const drag = startSplitDrag();
    run(() => drag(300));
    expect(settings.splitRatio).toBe(0.3);
    run(() => drag(50));
    expect(viewMode()).toBe('preview');
    expect(settings.splitRatio).toBe(0.4);
    run(() => drag(150));
    expect(viewMode()).toBe('split');
    expect(settings.splitRatio).toBe(0.2);
    run(() => drag(950));
    expect(viewMode()).toBe('source');
    expect(settings.splitRatio).toBe(0.4);
    run(() => drag(600));
    expect(viewMode()).toBe('split');
    expect(settings.splitRatio).toBe(0.6);
    run(() => setSplitRatio(0.5));
  });
});

describe('sidebar', () => {
  function openOverlay() {
    setNarrowWindow(true);
    run(toggleSidebar);
    expect(sidebarOpen()).toBe(true);
  }

  /** Stand-ins for the sidebar and its toggle button. */
  function renderLayout() {
    document.body.innerHTML = `
      <button aria-controls="sidebar">Toggle</button>
      <aside id="sidebar"><button>Welcome.md</button></aside>
      <main></main>`;
    const find = (selector: string) => document.querySelector<HTMLElement>(selector)!;
    return { toggle: find('[aria-controls]'), item: find('#sidebar button'), workspace: find('main') };
  }

  function pointerDown(element: Element) {
    element.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    flush();
  }

  function pressEscape(element: Element) {
    element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    flush();
  }

  test('opens over the workspace on narrow screens without changing the setting', () => {
    run(() => setSidebarOpen(false));
    openOverlay();
    expect(settings.sidebarOpen).toBe(false);
    run(toggleSidebar);
    expect(sidebarOpen()).toBe(false);
  });

  test('returns to the stored state when the window widens, and starts closed when it narrows', () => {
    openOverlay();
    run(toggleSidebar);
    setNarrowWindow(false);
    expect(sidebarOpen()).toBe(true);
    setNarrowWindow(true);
    expect(sidebarOpen()).toBe(false);
  });

  test('closes on Escape and gives focus back to the toggle', () => {
    const { toggle, item } = renderLayout();
    openOverlay();
    item.focus();
    pressEscape(item);
    expect(sidebarOpen()).toBe(false);
    expect(document.activeElement).toBe(toggle);
  });

  test('stays open when something else handles Escape', () => {
    const { workspace } = renderLayout();
    workspace.addEventListener('keydown', (event) => event.preventDefault());
    openOverlay();
    pressEscape(workspace);
    expect(sidebarOpen()).toBe(true);
  });

  test('closes on a click outside it', () => {
    const { toggle, item, workspace } = renderLayout();
    openOverlay();
    pointerDown(item);
    pointerDown(toggle);
    expect(sidebarOpen()).toBe(true);
    pointerDown(workspace);
    expect(sidebarOpen()).toBe(false);
  });

  test('closes when a document is selected, but not when the active one is closed', () => {
    newDocument();
    flush();
    const first = activeDocument()!;
    newDocument();
    flush();

    openOverlay();
    run(() => selectDocument(first.id));
    expect(sidebarOpen()).toBe(false);

    run(toggleSidebar);
    run(() => closeDocument(first.id));
    expect(sidebarOpen()).toBe(true);
  });
});
