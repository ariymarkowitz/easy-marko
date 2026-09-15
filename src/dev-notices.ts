import { showNotice } from './state/notices';

/**
 * Dev only: open the app with `?notices` to show one notice of each kind, so
 * their styles can be checked without reproducing what triggers them. Actions
 * only dismiss their notice.
 */
export function showSampleNotices(): void {
  if (!new URLSearchParams(location.search).has('notices')) return;

  const noop = () => {};
  showNotice('Welcome.md changed on disk. Reloading it replaces your unsaved changes.', {
    actions: [{ label: 'Reload', run: noop }],
  });
  showNotice('Easy Marko is ready to work offline.', { timeout: 0 });
  showNotice("Couldn't open notes.md: the file is no longer there.", {
    tone: 'error',
    actions: [{ label: 'Retry', run: noop }],
  });
  showNotice("Couldn't save the document.", { tone: 'error' });
}
