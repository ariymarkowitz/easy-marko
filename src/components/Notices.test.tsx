import { flush } from 'solid-js';
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { dismissNotice, INFO_NOTICE_TIMEOUT, notices, showNotice } from '../state/notices';
import Notices from './Notices';

beforeEach(() => {
  // Test files share modules, so clear the notices that other files left.
  for (const notice of notices()) dismissNotice(notice.id);
  flush();
  vi.useFakeTimers();
  render(() => <Notices />);
});

afterEach(() => {
  // Vitest globals are off, so the testing library can't clean up by itself.
  cleanup();
  vi.useRealTimers();
});

function show(...args: Parameters<typeof showNotice>) {
  const dismiss = showNotice(...args);
  flush();
  return dismiss;
}

/** The shown notices, which are labelled groups. */
const shown = () => screen.queryAllByRole('group');

describe('Notices', () => {
  test('keeps its live regions in the page with no notices', () => {
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(screen.getByRole('alert')).toBeEmptyDOMElement();
  });

  test('announces errors as alerts and info as status', () => {
    show("Couldn't save the file", { tone: 'error' });
    show('Ready to work offline');
    expect(screen.getByRole('alert')).toHaveTextContent(/^Couldn't save the file$/);
    expect(screen.getByRole('status')).toHaveTextContent(/^Ready to work offline$/);
    expect(screen.getByRole('group', { name: 'Error' })).toHaveTextContent("Couldn't save the file");
  });

  test('closes when dismissed', () => {
    show('Failed', { tone: 'error' });
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    flush();
    expect(shown()).toHaveLength(0);
    expect(screen.getByRole('alert')).toBeEmptyDOMElement();
  });

  test('runs an action and closes', () => {
    const run = vi.fn();
    show('New version', { actions: [{ label: 'Reload', run }] });
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    flush();
    expect(run).toHaveBeenCalledOnce();
    expect(shown()).toHaveLength(0);
  });

  test('closes info notices after the timeout, but not while hovered', () => {
    show('Saved');
    const [notice] = shown();
    // Pausing takes effect on the flush, which in a browser runs as soon as
    // the handler returns, before any timer.
    fireEvent.pointerEnter(notice);
    flush();
    vi.advanceTimersByTime(INFO_NOTICE_TIMEOUT * 2);
    expect(shown()).toHaveLength(1);

    fireEvent.pointerLeave(notice);
    flush();
    vi.advanceTimersByTime(INFO_NOTICE_TIMEOUT);
    flush();
    expect(shown()).toHaveLength(0);
  });

  test.each([
    ['errors', { tone: 'error' as const }],
    ['notices with actions', { actions: [{ label: 'Reload', run: () => {} }] }],
  ])('keeps %s open', (_, options) => {
    show('Failed', options);
    vi.advanceTimersByTime(INFO_NOTICE_TIMEOUT * 10);
    flush();
    expect(shown()).toHaveLength(1);
  });
});
