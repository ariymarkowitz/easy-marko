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

    expect(onMove.mock.calls).toEqual([
      [20, 0],
      [40, 0],
    ]);
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
    expect(onMove).toHaveBeenCalledWith(10, 0);
    expect(onClick).not.toHaveBeenCalled();

    vi.runAllTimers();
    button.click();
    expect(onClick).toHaveBeenCalledOnce();
  });

  test('shows the cursor given while dragging, and reports the end of a drag', () => {
    const button = document.body.appendChild(document.createElement('button'));
    const onEnd = vi.fn();
    startDrag(button, { onMove: vi.fn(), onEnd, cursor: 'grabbing', threshold: 4 });
    window.dispatchEvent(pointer('pointermove', 2));
    expect(document.documentElement.style.getPropertyValue('--drag-cursor')).toBe('');

    window.dispatchEvent(pointer('pointermove', 10));
    expect(document.documentElement.style.getPropertyValue('--drag-cursor')).toBe('grabbing');
    window.dispatchEvent(pointer('pointerup', 10));
    expect(document.documentElement.style.getPropertyValue('--drag-cursor')).toBe('');
    expect(onEnd).toHaveBeenCalledOnce();
  });

  test('with a hold, starts once the pointer has been held still', () => {
    const button = document.body.appendChild(document.createElement('button'));
    const onStart = vi.fn();
    const onMove = vi.fn();
    const onEnd = vi.fn();
    startDrag(button, { onStart, onMove, onEnd, threshold: 10, hold: 400 });

    window.dispatchEvent(pointer('pointermove', 5));
    vi.advanceTimersByTime(399);
    expect(onStart).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onStart).toHaveBeenCalledOnce();
    expect(document.documentElement).toHaveClass('dragging');

    window.dispatchEvent(pointer('pointermove', 6));
    window.dispatchEvent(pointer('pointerup', 6));
    expect(onMove).toHaveBeenCalledWith(6, 0);
    expect(onEnd).toHaveBeenCalledWith(true);
  });

  test('with a hold, gives up if the pointer moves past the threshold first', () => {
    const button = document.body.appendChild(document.createElement('button'));
    const onStart = vi.fn();
    const onMove = vi.fn();
    startDrag(button, { onStart, onMove, threshold: 10, hold: 400 });

    window.dispatchEvent(pointer('pointermove', 20));
    vi.advanceTimersByTime(400);
    window.dispatchEvent(pointer('pointermove', 30));
    expect(onStart).not.toHaveBeenCalled();
    expect(onMove).not.toHaveBeenCalled();
  });

  test('reports a cancelled drag as not released', () => {
    const button = document.body.appendChild(document.createElement('button'));
    const onEnd = vi.fn();
    startDrag(button, { onMove: vi.fn(), onEnd });
    window.dispatchEvent(pointer('pointercancel', 0));
    expect(onEnd).toHaveBeenCalledWith(false);
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
