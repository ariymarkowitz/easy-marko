// Dragging an item to a new place in a list. The item follows the pointer,
// and the other items slide out of its way as it passes them.

import { clamp } from './clamp';
import { CLICK_SLOP, HOLD_DELAY, TOUCH_SLOP, trackDrag } from './drag';
import { nextFrame, scheduler } from './timers';

/** How close, in pixels, the pointer comes to the scroller's top or bottom before it scrolls. */
const SCROLL_EDGE = 32;
/** How far, in pixels, the scroller scrolls each frame while the pointer is at its edge. */
const SCROLL_STEP = 6;
/** How long, in milliseconds, items take to slide into their places. */
const SLIDE_DURATION = 150;

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

export interface ListDragOptions {
  /** Moves the item to `index` among the list's items, updating the page before it returns. */
  move: (index: number) => void;
  /** The element that scrolls the list, scrolled while the pointer is near its top or bottom. */
  scroller: HTMLElement;
  /** Called when the drag starts: at once for a mouse, or after the hold for a touch. */
  onStart?: () => void;
  /** Called when a touch is held until it lifts the item, then released without moving. */
  onLongPress?: () => void;
  /** Called once the item has slid into its place after the drag. */
  onSettle?: () => void;
}

/**
 * Follows a drag of `item`, a child of a list, that `start` (a pointerdown)
 * begins. The item is drawn under the pointer, kept within the list, and moves
 * once its middle passes another item's middle. A touch drags only after it's
 * held still for a moment, so a swipe still scrolls; the device vibrates, where
 * it can, when the hold lifts the item.
 */
export function dragListItem(start: PointerEvent, item: HTMLElement, options: ListDragOptions): void {
  const list = item.parentElement!;
  const { scroller } = options;
  const touch = start.pointerType === 'touch';
  let pointerY = start.clientY;
  let moved = false;
  /** Where the pointer is on the item, from the item's top. */
  let grab = 0;
  /** How far the item is drawn from its place in the list. */
  let offset = 0;

  const draw = (distance: number) => {
    offset = distance;
    item.style.translate = distance ? `0 ${distance}px` : '';
  };

  /** Where the item's place in the list is on screen, leaving out how far it's drawn from it. */
  const place = () => item.getBoundingClientRect().top - offset;

  /** Draws the item under the pointer, and moves it once it has passed another item. */
  const follow = () => {
    // Positions are from the layout (offsetTop), which leaves out the items' slides, so targets don't move while they slide.
    const itemPlace = place();
    const topOf = (other: HTMLElement) => itemPlace + other.offsetTop - item.offsetTop;
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
    draw(clamp(top, highest, lowest) - place());
  };

  /** Scrolls while the pointer is near the scroller's top or bottom, so the item can go anywhere in a long list. */
  const scrolling = scheduler(() => {
    const bounds = scroller.getBoundingClientRect();
    const step =
      pointerY < bounds.top + SCROLL_EDGE ? -SCROLL_STEP : pointerY > bounds.bottom - SCROLL_EDGE ? SCROLL_STEP : 0;
    const before = scroller.scrollTop;
    scroller.scrollTop += step;
    if (scroller.scrollTop !== before) follow();
    scrolling.schedule();
  }, nextFrame);

  trackDrag(start, {
    threshold: touch ? TOUCH_SLOP : CLICK_SLOP,
    hold: touch ? HOLD_DELAY : undefined,
    cursor: 'grabbing',
    onStart: () => {
      // An item still sliding from an earlier drag is picked up where it's drawn.
      const top = item.getBoundingClientRect().top;
      cancelSlide(item);
      draw(top - item.getBoundingClientRect().top);
      grab = start.clientY - top;
      scrolling.schedule();
      if (touch && typeof navigator.vibrate === 'function') navigator.vibrate(10);
      options.onStart?.();
    },
    onMove: (clientX, clientY) => {
      pointerY = clientY;
      moved ||= Math.hypot(clientX - start.clientX, clientY - start.clientY) >= TOUCH_SLOP;
      follow();
    },
    onEnd: (released) => {
      scrolling.cancel();
      // A new drag of the item cancels the slide, and the new drag carries on instead.
      slide(item, offset, options.onSettle);
      if (touch && released && !moved) options.onLongPress?.();
    },
  });
}

/** Runs `reorder`, which moves `items` in the page, sliding each from where it was drawn to its new place. */
function slideAfter(items: HTMLElement[], reorder: () => void): void {
  const before = items.map((item) => item.getBoundingClientRect().top);
  items.forEach(cancelSlide);
  reorder();
  items.forEach((item, index) => slide(item, before[index] - item.getBoundingClientRect().top));
}

interface Slide {
  /** How far from its place the element starts, in pixels. */
  distance: number;
  /** When the slide started, from `performance.now()`. */
  start: number;
  onEnd?: () => void;
}

/** The elements sliding into their places, all moved by one loop. */
const slides = new Map<HTMLElement, Slide>();

/**
 * Moves each sliding element for this frame. The slides set the translate
 * themselves rather than through the Web Animations API, which Chrome runs on
 * the compositor: there a slide can start a frame after the reorder it
 * follows, leaving the items a row out of place for that frame.
 */
const sliding = scheduler(() => {
  const now = performance.now();
  for (const [element, { distance, start, onEnd }] of slides) {
    const progress = Math.min((now - start) / SLIDE_DURATION, 1);
    // Eases out: fast at first, then slowing into place.
    element.style.translate = progress < 1 ? `0 ${distance * (1 - progress) ** 3}px` : '';
    if (progress < 1) continue;
    slides.delete(element);
    onEnd?.();
  }
  if (slides.size > 0) sliding.schedule();
}, nextFrame);

/**
 * Slides `element` into its place from `distance` pixels below it (above if
 * negative), then calls `onEnd`, unless the slide is cancelled first.
 */
function slide(element: HTMLElement, distance: number, onEnd?: () => void): void {
  cancelSlide(element);
  const still = Math.abs(distance) < 0.5 || reducedMotion.matches;
  element.style.translate = still ? '' : `0 ${distance}px`;
  if (still) return onEnd?.();
  slides.set(element, { distance, start: performance.now(), onEnd });
  sliding.schedule();
}

/** Stops `element`'s slide, leaving it drawn in its place. */
function cancelSlide(element: HTMLElement): void {
  if (slides.delete(element)) element.style.translate = '';
}
