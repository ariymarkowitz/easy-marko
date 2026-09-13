import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { trackDrag } from './drag';

/** jsdom has no PointerEvent, so pointer events are mouse events with a pointerId. */
function pointer(type: string, clientX: number, init: MouseEventInit = {}) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX, ...init });
  return Object.assign(event, { pointerId: 1 }) as unknown as PointerEvent;
}

function startDrag(button: HTMLElement, options: Parameters<typeof trackDrag>[1]) {
  button.addEventListener('pointerdown', (event) => trackDrag(event as PointerEvent, options));
  button.dispatchEvent(pointer('pointerdown', 0));
}

// The click after a drag is swallowed until a timer runs.
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.runAllTimers();
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('trackDrag', () => {
  test('reports pointer moves until the pointer is released, while marking the root', () => {
    const button = document.body.appendChild(document.createElement('button'));
    const onMove = vi.fn();
    startDrag(button, { onMove });
    expect(document.documentElement).toHaveClass('dragging');

    window.dispatchEvent(pointer('pointermove', 20));
    // Carries on after the element it started on is removed.
    button.remove();
    window.dispatchEvent(pointer('pointermove', 40));
    window.dispatchEvent(pointer('pointerup', 40));
    window.dispatchEvent(pointer('pointermove', 60));

    expect(onMove.mock.calls).toEqual([[20], [40]]);
    expect(document.documentElement).not.toHaveClass('dragging');
  });

  test('leaves a press that moves less than the threshold to be a click', () => {
    const button = document.body.appendChild(document.createElement('button'));
    const onMove = vi.fn();
    const onClick = vi.fn();
    button.addEventListener('click', onClick);
    startDrag(button, { onMove, threshold: 4 });

    window.dispatchEvent(pointer('pointermove', 3));
    window.dispatchEvent(pointer('pointerup', 3));
    button.click();

    expect(onMove).not.toHaveBeenCalled();
    expect(onClick).toHaveBeenCalled();
  });

  test('swallows the click that ends a drag', () => {
    const button = document.body.appendChild(document.createElement('button'));
    const onMove = vi.fn();
    const onClick = vi.fn();
    button.addEventListener('click', onClick);
    startDrag(button, { onMove, threshold: 4 });

    window.dispatchEvent(pointer('pointermove', 10));
    window.dispatchEvent(pointer('pointerup', 10));
    button.click();
    expect(onMove).toHaveBeenCalledWith(10);
    expect(onClick).not.toHaveBeenCalled();

    vi.runAllTimers();
    button.click();
    expect(onClick).toHaveBeenCalledOnce();
  });

  test('ignores buttons other than the primary one', () => {
    const button = document.body.appendChild(document.createElement('button'));
    const onMove = vi.fn();
    button.addEventListener('pointerdown', (event) => trackDrag(event as PointerEvent, { onMove }));
    button.dispatchEvent(pointer('pointerdown', 0, { button: 2 }));
    window.dispatchEvent(pointer('pointermove', 10));
    expect(onMove).not.toHaveBeenCalled();
  });
});
