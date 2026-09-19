// Dragging an item to a new place in a list. The item follows the pointer,
// and the other items slide out of its way as it passes them.

import { clamp } from './clamp';
import { CLICK_SLOP, HOLD_DELAY, TOUCH_SLOP, trackDrag } from './drag';

/** How close, in pixels, the pointer comes to the scroller's top or bottom before it scrolls. */
const SCROLL_EDGE = 32;
/** How far, in pixels, the scroller scrolls each frame while the pointer is at its edge. */
const SCROLL_STEP = 6;
/** How long, in milliseconds, items take to slide into their places. */
const SLIDE_DURATION = 150;
/** Marks this module's animations, so cancelling them leaves others (like colour transitions) alone. */
const SLIDE_ID = 'list-drag-slide';

export interface ListDragOptions {
  /** Moves the item to `index` among the list's items, updating the page before it returns. */
  move: (index: number) => void;
  /** The element that scrolls the list, scrolled while the pointer is near its top or bottom. */
  scroller: HTMLElement;
  /** Called when the drag starts: at once for a mouse, or after the hold for a touch. */
  onStart?: () => void;
  /**
   * Called when the pointer is released or the browser cancels the drag.
   * `moved` is whether the pointer moved further than a tap would.
   */
  onEnd?: (released: boolean, moved: boolean) => void;
  /** Called once the item has slid into its place after the drag. */
  onSettle?: () => void;
}

/**
 * Follows a drag of `item`, a child of a list, that `event` (a pointerdown)
 * begins. The item is drawn under the pointer, kept within the list, and moves
 * once its middle passes another item's middle. A touch drags only after it's
 * held still for a moment, so a swipe still scrolls.
 */
export function dragListItem(event: PointerEvent, item: HTMLElement, options: ListDragOptions): void {
  const list = item.parentElement!;
  const { scroller } = options;
  const touch = event.pointerType === 'touch';
  const start = { x: event.clientX, y: event.clientY };
  let pointerY = start.y;
  let moved = false;
  let frame = 0;
  /** Where the pointer is on the item, from the item's top. */
  let grab = 0;
  /** How far the item is drawn from its place in the list. */
  let offset = 0;

  const draw = (distance: number) => {
    offset = distance;
    item.style.translate = distance ? `0 ${distance}px` : '';
  };

  /** Draws the item under the pointer, and moves it once it has passed another item. */
  const follow = () => {
    // Positions are from the layout (offsetTop), which leaves out the items' slides, so targets don't move while they slide.
    const place = item.getBoundingClientRect().top - offset;
    const topOf = (other: HTMLElement) => place + other.offsetTop - item.offsetTop;
    const items = [...list.children] as HTMLElement[];
    const others = items.filter((other) => other !== item);
    const last = items.at(-1)!;
    const highest = topOf(items[0]);
    const lowest = topOf(last) + last.offsetHeight - item.offsetHeight;
    const top = pointerY - grab;
    // Unclamped, so an item held past either end of the list passes the item there.
    const middle = top + item.offsetHeight / 2;
    const index = others.filter((other) => topOf(other) + other.offsetHeight / 2 < middle).length;
    if (index !== items.indexOf(item)) slideAfter(others, () => options.move(index));
    // The item's place has changed if it moved.
    draw(clamp(top, highest, lowest) - (item.getBoundingClientRect().top - offset));
  };

  /** Scrolls while the pointer is near the scroller's top or bottom, so the item can go anywhere in a long list. */
  const scroll = () => {
    const bounds = scroller.getBoundingClientRect();
    const step =
      pointerY < bounds.top + SCROLL_EDGE ? -SCROLL_STEP : pointerY > bounds.bottom - SCROLL_EDGE ? SCROLL_STEP : 0;
    const before = scroller.scrollTop;
    scroller.scrollTop += step;
    if (scroller.scrollTop !== before) follow();
    frame = requestAnimationFrame(scroll);
  };

  trackDrag(event, {
    threshold: touch ? TOUCH_SLOP : CLICK_SLOP,
    hold: touch ? HOLD_DELAY : undefined,
    cursor: 'grabbing',
    onStart: () => {
      // An item still sliding from an earlier drag is picked up where it's drawn.
      const top = item.getBoundingClientRect().top;
      cancelSlides(item);
      draw(top - item.getBoundingClientRect().top);
      grab = start.y - top;
      frame = requestAnimationFrame(scroll);
      options.onStart?.();
    },
    onMove: (clientX, clientY) => {
      pointerY = clientY;
      moved ||= Math.hypot(clientX - start.x, clientY - start.y) >= TOUCH_SLOP;
      follow();
    },
    onEnd: (released) => {
      cancelAnimationFrame(frame);
      const settle = slide(item, offset);
      draw(0);
      // A new drag of the item cancels the slide, and the new drag carries on instead.
      if (settle) void settle.finished.then(options.onSettle, () => {});
      else options.onSettle?.();
      options.onEnd?.(released, moved);
    },
  });
}

/** Runs `reorder`, which moves `items` in the page, sliding each from where it was drawn to its new place. */
function slideAfter(items: HTMLElement[], reorder: () => void): void {
  const before = items.map((item) => item.getBoundingClientRect().top);
  reorder();
  items.forEach((item, index) => {
    cancelSlides(item);
    slide(item, before[index] - item.getBoundingClientRect().top);
  });
}

/**
 * Slides `element` into its place from `distance` pixels below it (above if
 * negative). Returns the animation, or undefined when there's nothing to slide
 * or motion is reduced.
 */
function slide(element: HTMLElement, distance: number): Animation | undefined {
  if (Math.abs(distance) < 0.5 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
  return element.animate([{ translate: `0 ${distance}px` }, { translate: '0 0' }], {
    id: SLIDE_ID,
    duration: SLIDE_DURATION,
    easing: 'ease-out',
  });
}

function cancelSlides(element: HTMLElement): void {
  for (const animation of element.getAnimations()) if (animation.id === SLIDE_ID) animation.cancel();
}
