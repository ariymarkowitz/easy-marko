// Links the source and preview panes: synced scrolling in split view, a
// shown pane opening where the other was scrolled to, and alt-click jumps
// from a place in one pane to the same place in the other. Preview blocks
// carry the source lines they came from (data-line and data-end-line), which
// is what lines the two panes up.

import { createEffect, flush, onSettled, untrack } from 'solid-js';
import { EditorView } from '@codemirror/view';
import { editorView } from '../editor/controller';
import { listen } from '../lib/events';
import { createScrollMap, mapOffset } from '../lib/scroll-map';
import { nextFrame, scheduler, type Scheduler } from '../lib/timers';
import { createAttachment } from '../reactive';
import { revealPane, viewMode } from './layout';
import { activeScrollPosition, type ScrollPosition, setActiveScrollPosition } from './scroll-positions';
import { type PanelMode, settings } from './settings';

const [previewPane, attachPane] = createAttachment<HTMLElement>();

/** A jump into the preview that has to wait for the preview to mount. */
let pendingPreviewJump: { line: number; offset: number } | undefined;

/**
 * Where the user last scrolled: the pane, and the source line at its top,
 * fractional for a place partway through. A pane that's shown with scroll
 * sync on opens here, and split view's panes follow this pane when linked.
 */
interface ScrollAnchor {
  pane: PanelMode;
  line: number;
}

function anchorFor(position: ScrollPosition): ScrollAnchor {
  return { pane: position.pane, line: position[position.pane] };
}

const scrollAnchor: ScrollAnchor = anchorFor(activeScrollPosition());

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

/** The offset of source `line` (which can be fractional) in `block`: its bottom from the block's end line on. */
function offsetInBlock(block: PreviewBlock, line: number): number {
  if (line >= block.endLine) return block.bottom;
  return block.top + ((block.bottom - block.top) * (line - block.line)) / (block.endLine - block.line);
}

/** The source line at offset `y` in `block`, fractional: its end line from the block's bottom on. */
function lineInBlock(block: PreviewBlock, y: number): number {
  if (y >= block.bottom) return block.endLine;
  const fraction = Math.max(0, (y - block.top) / (block.bottom - block.top));
  return block.line + (block.endLine - block.line) * fraction;
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

/** Records `element`'s current scroll position as one this module gave it. */
function markProgrammaticScroll(element: HTMLElement): void {
  programmaticScrolls.set(element, element.scrollTop);
}

function scrollElement(element: HTMLElement, top: number): void {
  element.scrollTop = top;
  markProgrammaticScroll(element);
}

/**
 * Scrolls the editor to `top`. CodeMirror moves the scroll position as it
 * measures lines whose heights it had estimated, to keep the same content at
 * the top, so the position is recorded again after its next measure, and
 * `onCorrected` runs if CodeMirror moved it.
 */
function scrollSource(view: EditorView, top: number, onCorrected?: () => void): void {
  const { scrollDOM } = view;
  scrollElement(scrollDOM, top);
  view.requestMeasure({
    key: scrollSource,
    read: () => {},
    // Corrections come later in the same measure. Microtasks run after it, before the scroll events it causes.
    write: () =>
      queueMicrotask(() => {
        if (isProgrammaticScroll(scrollDOM)) return;
        markProgrammaticScroll(scrollDOM);
        onCorrected?.();
      }),
  });
}

function isProgrammaticScroll(element: HTMLElement): boolean {
  return programmaticScrolls.get(element) === element.scrollTop;
}

/** Set while a scroll that scrollSourceToLine asked CodeMirror for waits to be made. */
let sourceScrollRequested = false;

/** Tells the scrolls CodeMirror makes for this module apart from the user's. Include it in the editor's extensions. */
export const sourceScrollTracking = EditorView.scrollHandler.of((view) => {
  if (sourceScrollRequested) {
    sourceScrollRequested = false;
    // CodeMirror scrolls once handlers return, and can correct the position later in the same measure.
    queueMicrotask(() => markProgrammaticScroll(view.scrollDOM));
  }
  return false;
});

/** Briefly highlights the preview block a jump landed on. */
function flash(element: HTMLElement): void {
  element.classList.remove('flash');
  void element.offsetWidth; // Restart the animation if it's already running.
  element.classList.add('flash');
  element.addEventListener('animationend', () => element.classList.remove('flash'), { once: true });
}

/**
 * Scrolls the preview so source `line` (which can be fractional) sits `offset`
 * pixels below the pane's top, and returns the element of the block there.
 */
function scrollPreviewToLine(pane: HTMLElement, line: number, offset: number): HTMLElement | undefined {
  const blocks = measurePreviewBlocks(pane);
  const block = blocks.findLast((b) => b.line <= line) ?? blocks[0];
  if (!block) return undefined;
  scrollElement(pane, offsetInBlock(block, line) - offset);
  return block.element;
}

/** Scrolls the preview so source `line` sits `offset` pixels below its top, and highlights the block there. */
function jumpPreviewToLine(pane: HTMLElement, line: number, offset: number): void {
  const element = scrollPreviewToLine(pane, line, offset);
  if (element) flash(element);
}

/** Scrolls the preview so source `line` is at its top. */
function showPreviewAtLine(pane: HTMLElement, line: number): void {
  if (line <= 0) scrollElement(pane, 0);
  else scrollPreviewToLine(pane, line, 0);
}

/** Scrolls the preview to the scroll anchor's line, and makes it the pane the anchor follows. */
function showPreviewAtAnchor(pane: HTMLElement): void {
  scrollAnchor.pane = 'preview';
  showPreviewAtLine(pane, scrollAnchor.line);
}

/** The source line at the top of the preview, fractional within a block. */
function previewLineAtTop(pane: HTMLElement): number {
  const y = pane.scrollTop;
  if (y <= 0) return 0;
  const block = measurePreviewBlocks(pane).findLast((b) => b.top <= y);
  return block ? lineInBlock(block, y) : 0;
}

/** The source line at the top of the editor, fractional within a line. */
function sourceLineAtTop(view: EditorView): number {
  const scroller = view.scrollDOM;
  if (scroller.scrollTop <= 0) return 0;
  const { doc } = view.state;
  // documentTop moves with the scroll, so this is the scroll position in document coordinates.
  const height = scroller.getBoundingClientRect().top - view.documentTop;
  const block = view.lineBlockAtHeight(height);
  const first = doc.lineAt(block.from).number;
  const lines = doc.lineAt(block.to).number - first + 1;
  const fraction = Math.min(1, Math.max(0, (height - block.top) / block.height));
  return first - 1 + lines * fraction;
}

/** Scrolls the editor so source `line` (which can be fractional) is at its top. Works on an editor that was just shown. */
function scrollSourceToLine(view: EditorView, line: number): void {
  const { doc } = view.state;
  if (line <= 0) {
    scrollSource(view, 0);
    return;
  }
  const whole = Math.min(Math.floor(line), doc.lines - 1);
  const position = doc.line(whole + 1).from;
  const block = view.lineBlockAt(position);
  const lines = doc.lineAt(block.to).number - doc.lineAt(block.from).number + 1;
  const offset = (block.height * Math.min(line - whole, lines)) / lines;
  sourceScrollRequested = true;
  // CodeMirror measures the target once it's laid out, which a freshly shown editor isn't yet.
  view.dispatch({ effects: EditorView.scrollIntoView(position, { y: 'start', yMargin: -offset }) });
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
  return Math.min(Math.floor(lineInBlock(block, y)), Math.max(block.line, block.endLine - 1));
}

/**
 * Ref for <Preview>'s scrolling pane: publishes it to this module while
 * mounted, and runs a jump that was waiting for it to mount.
 */
export function previewPaneRef(): (pane: HTMLElement) => void {
  let pane: HTMLElement;
  onSettled(() => {
    const detach = attachPane(pane);
    if (pendingPreviewJump) {
      jumpPreviewToLine(pane, pendingPreviewJump.line, pendingPreviewJump.offset);
      pendingPreviewJump = undefined;
    } else if (settings.syncScroll && viewMode() === 'preview') {
      // Shown in place of the editor, so open where it was. Split view's linking aligns a preview shown beside it.
      showPreviewAtAnchor(pane);
    } else {
      showPreviewAtLine(pane, activeScrollPosition().preview);
    }
    const unlisten = listen(pane, { scroll: () => onScroll('preview', pane) }, { passive: true });
    return () => {
      unlisten();
      detach();
    };
  });
  return (element) => {
    pane = element;
  };
}

/**
 * Handles an alt-click in the editor: shows source `line` in the preview,
 * `offset` pixels below the pane's top so it lines up with the click.
 */
export function jumpToPreview(line: number, offset: number): void {
  const pane = previewPane();
  if (viewMode() === 'source' || !pane) {
    pendingPreviewJump = { line, offset };
    revealPane('preview');
    return;
  }
  jumpPreviewToLine(pane, line, offset);
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

  if (viewMode() === 'preview') {
    // The editor is hidden, so it can't be measured yet: show it, then let
    // CodeMirror do the scrolling once it has laid itself out.
    revealPane('source');
    flush();
    view.dispatch({
      selection: { anchor: position },
      effects: EditorView.scrollIntoView(position, { y: 'start', yMargin: offset }),
    });
  } else {
    view.dispatch({ selection: { anchor: position } });
    scrollSource(view, sourceLineTops(view)(line) - offset);
  }
  view.focus();
}

/** Aligns the other pane with the one the user scrolled, while the panes are linked. */
let syncLinkedPanes: (() => void) | undefined;

/** Records where a pane is scrolled to as the scroll anchor, unless another pane has been scrolled since. */
const recordAnchor = (pane: PanelMode) =>
  scheduler(() => {
    if (scrollAnchor.pane !== pane) return;
    scrollAnchor.line = recordScrollPosition()[pane] ?? scrollAnchor.line;
  }, nextFrame);

/** Each pane's anchor recording, done once a frame while it scrolls. */
const anchorRecorders: Record<PanelMode, Scheduler> = { source: recordAnchor('source'), preview: recordAnchor('preview') };

/** Records where the user scrolled a pane to, and brings a linked pane along. */
function onScroll(pane: PanelMode, element: HTMLElement): void {
  if (isProgrammaticScroll(element)) return;
  // The editor stays mounted in preview mode, where its scroll position means nothing.
  if (pane === 'source' && viewMode() === 'preview') return;
  scrollAnchor.pane = pane;
  syncLinkedPanes?.();
  // Measuring every block on each scroll event would be wasteful outside split view, so record once a frame.
  anchorRecorders[pane].schedule();
}

/**
 * Records where the active document's shown panes are scrolled to, and
 * returns the source line at the top of each pane it could measure.
 */
function recordScrollPosition(): Partial<Record<PanelMode, number>> {
  const view = editorView();
  const pane = previewPane();
  const lines = {
    source: view && viewMode() !== 'preview' ? sourceLineAtTop(view) : undefined,
    preview: pane?.isConnected ? previewLineAtTop(pane) : undefined,
  };
  const previous = activeScrollPosition();
  setActiveScrollPosition({
    pane: scrollAnchor.pane,
    source: lines.source ?? previous.source,
    preview: lines.preview ?? previous.preview,
  });
  return lines;
}

/**
 * Scrolls the panes to where the active document was scrolled. <Editor> calls
 * this once it shows a document. A hidden pane goes there when it's shown.
 */
export function restoreScrollPosition(view: EditorView): void {
  untrack(() => {
    const position = activeScrollPosition();
    Object.assign(scrollAnchor, anchorFor(position));
    // Linked panes follow the pane scrolled last, since the other may not have been showing.
    const lineFor = (pane: PanelMode) => (settings.syncScroll ? scrollAnchor.line : position[pane]);
    if (viewMode() !== 'preview') scrollSourceToLine(view, lineFor('source'));
    const pane = previewPane();
    if (pane) showPreviewAtLine(pane, lineFor('preview'));
  });
}

/** Keeps both panes scrolled to the same place, following the pane last scrolled, and returns the cleanup. */
function linkScrolling(view: EditorView, pane: HTMLElement): () => void {
  const source = view.scrollDOM;

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
    if (scrollAnchor.pane === 'source') {
      scrollElement(pane, mapOffset(source.scrollTop, map.source, map.preview));
    } else {
      // Realigns once CodeMirror has measured the lines it scrolled to.
      scrollSource(view, mapOffset(pane.scrollTop, map.preview, map.source), sync);
    }
  };

  // The preview reflows when split view narrows it, so put it back where it was before the editor follows.
  if (scrollAnchor.pane === 'preview') showPreviewAtAnchor(pane);

  // Edits, images loading and pane resizes all move content around, so
  // realign whenever either pane's content changes size. This also aligns
  // the panes as soon as they're linked, to the pane that was showing.
  const resizeObserver = new ResizeObserver(sync);
  resizeObserver.observe(view.contentDOM);
  resizeObserver.observe(pane.querySelector('.markdown') ?? pane);
  syncLinkedPanes = sync;

  return () => {
    resizeObserver.disconnect();
    if (syncLinkedPanes === sync) syncLinkedPanes = undefined;
  };
}

/**
 * Syncs scrolling between the panes while split view and the setting are on,
 * and with the setting on, opens a pane that's shown alone where the other
 * was scrolled to. Call once from the app root.
 */
export function useScrollSync(): void {
  createEffect(
    () => editorView(),
    (view) => view && listen(view.scrollDOM, { scroll: () => onScroll('source', view.scrollDOM) }, { passive: true }),
    { name: 'sourceScrollAnchor' },
  );

  createEffect(
    () => {
      const view = editorView();
      const pane = previewPane();
      const active = settings.syncScroll && viewMode() === 'split';
      return active && view && pane ? { view, pane } : undefined;
    },
    (panes) => panes && linkScrolling(panes.view, panes.pane),
    { name: 'scrollSync' },
  );

  // A pane shown alone keeps the place the other was scrolled to. The preview
  // opens there when it mounts (see previewPaneRef), and is moved when split
  // view widens it. The editor stays mounted, so it's moved when it replaces
  // the preview.
  createEffect(
    () => ({ mode: viewMode(), view: editorView(), pane: previewPane(), sync: settings.syncScroll }),
    ({ mode, view, pane, sync }, previous) => {
      if (!previous || mode === previous.mode) return;
      if (!sync) {
        // Unlinked panes each open where they were for this document. The preview does when it mounts.
        if (previous.mode === 'preview' && view) scrollSourceToLine(view, activeScrollPosition().source);
        return;
      }
      if (mode === 'source' && previous.mode === 'preview' && view) {
        scrollAnchor.pane = 'source';
        scrollSourceToLine(view, scrollAnchor.line);
      } else if (mode === 'preview' && previous.mode === 'split' && pane) {
        showPreviewAtAnchor(pane);
      }
    },
    { name: 'keepScrollOnViewChange' },
  );
}
