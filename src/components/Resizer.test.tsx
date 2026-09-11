import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library';
import { createSignal, flush } from 'solid-js';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { clamp } from '../lib/clamp';
import { setSidebarWidth, settings, SIDEBAR_WIDTH } from '../state/settings';
import Resizer from './Resizer';

afterEach(cleanup);

const range = { min: 100, max: 300, step: 10, largeStep: 50 };

function renderResizer(initial: number) {
  const [value, setValue] = createSignal(initial);
  const onChange = vi.fn((next: number) => setValue(clamp(next, range.min, range.max)));
  render(() => (
    <Resizer
      label="Resize panel"
      controls="panel"
      value={value()}
      range={range}
      onDrag={() => {}}
      onChange={onChange}
    />
  ));
  return { separator: screen.getByRole('separator', { name: 'Resize panel' }), onChange };
}

function press(element: HTMLElement, key: string, options: KeyboardEventInit = {}) {
  const handled = !fireEvent.keyDown(element, { key, ...options });
  flush();
  return handled;
}

describe('Resizer', () => {
  test('is a focusable separator exposing its value and range', () => {
    const { separator } = renderResizer(200);
    expect(separator).toHaveAttribute('tabindex', '0');
    expect(separator).toHaveAttribute('aria-controls', 'panel');
    expect(separator).toHaveAttribute('aria-valuenow', '200');
    expect(separator).toHaveAttribute('aria-valuemin', '100');
    expect(separator).toHaveAttribute('aria-valuemax', '300');
  });

  test('moves a step with the arrow keys and a large step with Shift', () => {
    const { separator } = renderResizer(200);
    press(separator, 'ArrowRight');
    expect(separator).toHaveAttribute('aria-valuenow', '210');
    press(separator, 'ArrowLeft');
    press(separator, 'ArrowLeft');
    expect(separator).toHaveAttribute('aria-valuenow', '190');
    press(separator, 'ArrowRight', { shiftKey: true });
    expect(separator).toHaveAttribute('aria-valuenow', '240');
  });

  test('jumps to the limits with Home and End', () => {
    const { separator } = renderResizer(200);
    press(separator, 'End');
    expect(separator).toHaveAttribute('aria-valuenow', '300');
    press(separator, 'Home');
    expect(separator).toHaveAttribute('aria-valuenow', '100');
  });

  test('leaves other keys and shortcuts alone', () => {
    const { separator, onChange } = renderResizer(200);
    expect(press(separator, 'a')).toBe(false);
    expect(press(separator, 'ArrowRight', { metaKey: true })).toBe(false);
    expect(press(separator, 'ArrowLeft', { altKey: true })).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });

  test('stays within the sidebar width limits in settings', () => {
    render(() => (
      <Resizer
        label="Resize sidebar"
        controls="sidebar"
        value={settings.sidebarWidth}
        range={SIDEBAR_WIDTH}
        onDrag={setSidebarWidth}
        onChange={setSidebarWidth}
      />
    ));
    const separator = screen.getByRole('separator');
    press(separator, 'End');
    press(separator, 'ArrowRight', { shiftKey: true });
    expect(settings.sidebarWidth).toBe(SIDEBAR_WIDTH.max);
    press(separator, 'Home');
    press(separator, 'ArrowLeft');
    expect(settings.sidebarWidth).toBe(SIDEBAR_WIDTH.min);
  });
});
