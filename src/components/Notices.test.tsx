import { flush } from 'solid-js';
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { dismissNotice, INFO_NOTICE_TIMEOUT, notices, showNotice } from '../state/notices';
import Notices from './Notices';

beforeEach(() => {
  vi.useFakeTimers();
  render(() => <Notices />);
});

afterEach(() => {
  // Vitest globals are off, so the testing library can't clean up by itself.
  cleanup();
  for (const notice of notices()) dismissNotice(notice.id);
  flush();
  vi.useRealTimers();
});

function show(...args: Parameters<typeof showNotice>) {
  const dismiss = showNotice(...args);
  flush();
  return dismiss;
}

describe('Notices', () => {
  test('announces errors as alerts and info as status', () => {
    show("Couldn't save the file", { tone: 'error' });
    show('Ready to work offline');
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't save the file");
    expect(screen.getByRole('status')).toHaveTextContent('Ready to work offline');
  });

  test('closes when dismissed', () => {
    show('Failed', { tone: 'error' });
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    flush();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  test('runs an action and closes', () => {
    const run = vi.fn();
    show('New version', { timeout: 0, actions: [{ label: 'Reload', run }] });
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    flush();
    expect(run).toHaveBeenCalledOnce();
    expect(screen.queryByRole('status')).toBeNull();
  });

  test('closes info notices after the timeout, but not while hovered', () => {
    show('Saved');
    const notice = screen.getByRole('status');
    fireEvent.pointerEnter(notice);
    vi.advanceTimersByTime(INFO_NOTICE_TIMEOUT * 2);
    flush();
    expect(screen.queryByRole('status')).not.toBeNull();

    fireEvent.pointerLeave(notice);
    vi.advanceTimersByTime(INFO_NOTICE_TIMEOUT);
    flush();
    expect(screen.queryByRole('status')).toBeNull();
  });

  test('keeps errors open', () => {
    show('Failed', { tone: 'error' });
    vi.advanceTimersByTime(INFO_NOTICE_TIMEOUT * 10);
    flush();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
