import { flush } from 'solid-js';
import { beforeEach, describe, expect, test } from 'vitest';
import { clearNotices } from '../test-helpers';
import { INFO_NOTICE_TIMEOUT, notices, showNotice } from './notices';

// Test files share modules, so clear the notices that other files left.
beforeEach(clearNotices);

describe('showNotice', () => {
  test('stacks notices in the order they were shown', () => {
    showNotice('First');
    showNotice('Second', { tone: 'error' });
    flush();
    expect(notices().map((notice) => notice.message)).toEqual(['First', 'Second']);
  });

  test('closes info notices on their own and keeps errors open by default', () => {
    showNotice('Saved');
    showNotice('Failed', { tone: 'error' });
    showNotice('Update', { timeout: 0 });
    flush();
    expect(notices().map((notice) => notice.timeout)).toEqual([INFO_NOTICE_TIMEOUT, 0, 0]);
  });

  test('returns a function that dismisses only that notice', () => {
    showNotice('First');
    const dismiss = showNotice('Second');
    flush();
    dismiss();
    flush();
    expect(notices().map((notice) => notice.message)).toEqual(['First']);
  });
});
