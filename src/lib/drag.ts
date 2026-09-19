// Pointer drags, followed on the window so a drag carries on after
// the element it started on is removed (as when dragging a resizer far enough
// hides it, or dragging a button that opens a panel).

import { listen } from './events';
import { delay } from './timers';

/** How far, in pixels, a press on a button moves before it's a drag rather than a click. */
export const CLICK_SLOP = 4;

/** How far, in pixels, a touch moves before it's a scroll or drag rather than a tap or a hold. */
export const TOUCH_SLOP = 10;

/** How long, in milliseconds, a touch is held still before it lifts something to be dragged. */
export const HOLD_DELAY = 400;

export interface DragOptions {
  /** Called with the pointer's position each time it moves during the drag. */
  onMove: (clientX: number, clientY: number) => void;
  /** Called when a drag starts, before its first move. */
  onStart?: () => void;
  /**
   * Called when a drag that started ends: `released` is true when the pointer
   * was released, and false when the browser cancelled it.
   */
  onEnd?: (released: boolean) => void;
  /** The cursor shown everywhere during the drag. Defaults to `col-resize`. */
  cursor?: string;
  /**
   * How far the pointer moves before the drag starts. Until then nothing is
   * reported, and releasing the pointer is left to be a click.
   */
  threshold?: number;
  /**
   * If set, the drag starts only once the pointer has been held this long,
   * in milliseconds, without moving past `threshold`. Moving further first gives
   * up on the drag, leaving the pointer to scroll or click.
   */
  hold?: number;
}

/**
 * Follows the drag that `start`, a pointerdown, begins until the pointer is
 * released. While dragging, the root element has the `dragging` class (and
 * `--drag-cursor`, if `cursor` is given), and the click that ends the drag is
 * swallowed.
 */
export function trackDrag(start: PointerEvent, options: DragOptions): void {
  if (start.button !== 0) return;
  const target = start.currentTarget instanceof Element ? start.currentTarget : undefined;
  const threshold = options.threshold ?? 0;
  const root = document.documentElement;
  let dragging = false;

  const begin = () => {
    dragging = true;
    options.onStart?.();
    root.classList.add('dragging');
    if (options.cursor) root.style.setProperty('--drag-cursor', options.cursor);
    // Keeps the events coming while the pointer is outside the window. Capture
    // ends by itself if the element is removed; the window listeners carry on.
    if (target?.isConnected) target.setPointerCapture?.(start.pointerId);
  };

  const end = (event: PointerEvent) => {
    if (event.pointerId !== start.pointerId) return;
    stop();
    if (!dragging) return;
    root.classList.remove('dragging');
    root.style.removeProperty('--drag-cursor');
    const released = event.type === 'pointerup';
    if (released) swallowClick();
    options.onEnd?.(released);
  };

  const unlisten = listen(window, {
    pointermove: (event) => {
      if (event.pointerId !== start.pointerId) return;
      if (!dragging) {
        const distance = Math.hypot(event.clientX - start.clientX, event.clientY - start.clientY);
        if (distance < threshold) return;
        // Moved before the hold was up: not a drag.
        if (options.hold) return stop();
        begin();
      }
      options.onMove(event.clientX, event.clientY);
    },
    pointerup: end,
    pointercancel: end,
  });

  const cancelHold = options.hold ? delay(begin, options.hold) : undefined;
  const stop = () => {
    cancelHold?.();
    unlisten();
  };

  if (!options.hold && threshold <= 0) begin();
}

/** Stops the click that follows a pointerup, which would otherwise activate a dragged button. */
function swallowClick(): void {
  const stop = listen(
    window,
    {
      click: (event) => {
        event.stopPropagation();
        event.preventDefault();
      },
    },
    { capture: true },
  );
  // The click, if any, is dispatched in the same task as the pointerup.
  delay(stop);
}
