// Links the source and preview panes: synced scrolling in split view, and
// alt-click jumps from a place in one pane to the same place in the other.
// Preview blocks carry the source lines they came from (data-line and
// data-end-line), which is what lines the two panes up.

import { createEffect, createSignal, flush } from 'solid-js';
import { EditorView } from '@codemirror/view';
import { editorView } from '../editor/controller';
import { createScrollMap, mapOffset } from '../lib/scroll-map';
import { openSplitView, settings } from './settings';

const [previewPane, setPreviewPane] = createSignal<HTMLElement>();

/** A jump into the preview that has to wait for the preview to mount. */
let pendingPreviewJump: { line: number; offset: number } | undefined;

interface PreviewBlock {
  element: HTMLElement;
  line: number;
  endLine: number;
  /** Offsets from the top of the pane's scrollable content. */
  top: number;
  bottom: number;
}

function measurePreviewBlocks(pane: HTMLElement): PreviewBlock[] {
  const contentTop = pane.getBoundingClientRect().top - pane.scrollTop;
  return Array.from(pane.querySelectorAll<HTMLElement>('.md-block'), (element) => {
    const rect = element.getBoundingClientRect();
    return {
      element,
      line: Number(element.dataset.line),
      endLine: Number(element.dataset.endLine),
      top: rect.top - contentTop,
      bottom: rect.bottom - contentTop,
    };
  });
}

/**
 * Returns a function giving the offset of a zero-based line's top from the top
 * of the editor's scrollable content. Lines past the end give the bottom.
 */
function sourceLineTops(view: EditorView): (line: number) => number {
  const { doc } = view.state;
  const scroller = view.scrollDOM;
  const documentOffset = view.documentTop - scroller.getBoundingClientRect().top + scroller.scrollTop;
  return (line) =>
    documentOffset +
    (line < doc.lines ? view.lineBlockAt(doc.line(line + 1).from).top : view.lineBlockAt(doc.length).bottom);
}

/** The scroll position this module last gave each element, so the scroll events it causes can be told apart. */
const programmaticScrolls = new WeakMap<Element, number>();

function scrollElement(element: HTMLElement, top: number): void {
  element.scrollTop = top;
  programmaticScrolls.set(element, element.scrollTop);
}

function isProgrammaticScroll(element: HTMLElement): boolean {
  return programmaticScrolls.get(element) === element.scrollTop;
}

/** Briefly highlights the preview block a jump landed on. */
function flash(element: HTMLElement): void {
  element.classList.remove('flash');
  void element.offsetWidth; // Restart the animation if it's already running.
  element.classList.add('flash');
  element.addEventListener('animationend', () => element.classList.remove('flash'), { once: true });
}

/** Scrolls the preview so source `line` sits `offset` pixels below the pane's top. */
function scrollPreviewToLine(pane: HTMLElement, line: number, offset: number): void {
  const blocks = measurePreviewBlocks(pane);
  const block = blocks.findLast((b) => b.line <= line) ?? blocks[0];
  if (!block) return;
  const top =
    line >= block.endLine
      ? block.bottom
      : block.top + ((block.bottom - block.top) * (line - block.line)) / (block.endLine - block.line);
  scrollElement(pane, top - offset);
  flash(block.element);
}

/**
 * The source line at `clientY` in the preview. Blocks don't map to lines any
 * more finely, so a block's height is shared out evenly between its lines.
 * The gap below a block belongs to the line after it.
 */
function previewLineAt(pane: HTMLElement, clientY: number): number | undefined {
  const y = clientY - pane.getBoundingClientRect().top + pane.scrollTop;
  const blocks = measurePreviewBlocks(pane);
  const block = blocks.findLast((b) => b.top <= y) ?? blocks[0];
  if (!block) return undefined;
  if (y >= block.bottom) return block.endLine;
  const fraction = Math.max(0, (y - block.top) / (block.bottom - block.top));
  const line = block.line + Math.floor(fraction * (block.endLine - block.line));
  return Math.min(line, Math.max(block.line, block.endLine - 1));
}

/** Registers the mounted preview pane. Call from the preview's onSettled and return the result. */
export function attachPreview(pane: HTMLElement): () => void {
  setPreviewPane(pane);
  if (pendingPreviewJump) {
    scrollPreviewToLine(pane, pendingPreviewJump.line, pendingPreviewJump.offset);
    pendingPreviewJump = undefined;
  }
  return () => setPreviewPane(undefined);
}

/**
 * Handles an alt-click in the editor: shows source `line` in the preview,
 * `offset` pixels below the pane's top so it lines up with the click.
 */
export function jumpToPreview(line: number, offset: number): void {
  const pane = previewPane();
  if (settings.viewMode === 'source' || !pane) {
    pendingPreviewJump = { line, offset };
    openSplitView();
    return;
  }
  scrollPreviewToLine(pane, line, offset);
}

/**
 * Handles an alt-click in the preview: moves the cursor to the source line
 * under the click and scrolls the editor so it lines up with the click.
 */
export function jumpToSource(event: MouseEvent): void {
  const view = editorView();
  const pane = previewPane();
  if (!event.altKey || !view || !pane) return;
  const line = previewLineAt(pane, event.clientY);
  if (line === undefined) return;
  event.preventDefault();

  const { doc } = view.state;
  const position = doc.line(Math.min(line + 1, doc.lines)).from;
  const offset = event.clientY - pane.getBoundingClientRect().top;

  if (settings.viewMode === 'preview') {
    // The editor is hidden, so it can't be measured yet: show it, then let
    // CodeMirror do the scrolling once it has laid itself out.
    openSplitView();
    flush();
    view.dispatch({
      selection: { anchor: position },
      effects: EditorView.scrollIntoView(position, { y: 'start', yMargin: offset }),
    });
  } else {
    view.dispatch({ selection: { anchor: position } });
    scrollElement(view.scrollDOM, sourceLineTops(view)(line) - offset);
  }
  view.focus();
}

/** Keeps both panes scrolled to the same place and returns the cleanup. */
function linkScrolling(view: EditorView, pane: HTMLElement): () => void {
  const source = view.scrollDOM;
  /** The pane the user scrolled last. The other one follows it. */
  let leader = source;

  const sync = () => {
    const lineTop = sourceLineTops(view);
    const pairs = measurePreviewBlocks(pane).flatMap((block) => [
      [lineTop(block.line), block.top] as const,
      [lineTop(block.endLine), block.bottom] as const,
    ]);
    const map = createScrollMap(pairs, [
      source.scrollHeight - source.clientHeight,
      pane.scrollHeight - pane.clientHeight,
    ]);
    if (leader === source) {
      scrollElement(pane, mapOffset(source.scrollTop, map.source, map.preview));
    } else {
      scrollElement(source, mapOffset(pane.scrollTop, map.preview, map.source));
    }
  };

  const onScroll = (event: Event) => {
    const element = event.currentTarget as HTMLElement;
    if (isProgrammaticScroll(element)) return;
    leader = element;
    sync();
  };

  // Edits, images loading and pane resizes all move content around, so
  // realign whenever either pane's content changes size. This also aligns
  // the panes as soon as they're linked.
  const resizeObserver = new ResizeObserver(() => sync());
  resizeObserver.observe(view.contentDOM);
  resizeObserver.observe(pane.querySelector('.markdown') ?? pane);
  source.addEventListener('scroll', onScroll, { passive: true });
  pane.addEventListener('scroll', onScroll, { passive: true });

  return () => {
    resizeObserver.disconnect();
    source.removeEventListener('scroll', onScroll);
    pane.removeEventListener('scroll', onScroll);
  };
}

/** Syncs scrolling between the panes while split view and the setting are on. Call once from the app root. */
export function useScrollSync(): void {
  createEffect(
    () => {
      const view = editorView();
      const pane = previewPane();
      const active = settings.syncScroll && settings.viewMode === 'split';
      return active && view && pane ? { view, pane } : undefined;
    },
    (panes) => panes && linkScrolling(panes.view, panes.pane),
    { name: 'scrollSync' },
  );
}
