import { createEffect, onSettled, resolve } from 'solid-js';
import { listen } from '../lib/events';
import { hasAccess } from '../lib/file-access';
import { hashText } from '../lib/hash';
import { documentsState, hasUnsavedChanges, isSaving, linkedFiles, reloadDocument } from './documents';
import { showNotice } from './notices';

/** How often files are checked while the page is visible, besides whenever the window gains focus. */
const FILE_CHECK_INTERVAL = 2000;

interface Watched {
  handle: FileSystemFileHandle;
  /** The file's modification time when it was last read, so unchanged files aren't read again. */
  lastModified: number;
  /** Hash of the file's content when a notice was shown for it, and the notice's dismissal. */
  notice?: { hash: string; dismiss: () => void };
}

/** What's known about each linked document's file, by document id. */
const watched = new Map<string, Watched>();

function forget(id: string): void {
  watched.get(id)?.notice?.dismiss();
  watched.delete(id);
}

async function checkDocument(id: string, handle: FileSystemFileHandle): Promise<void> {
  let entry = watched.get(id);
  if (entry?.handle !== handle) {
    forget(id);
    entry = { handle, lastModified: -1 };
    watched.set(id, entry);
  }

  // Asking for permission needs a user gesture, so files the page may not read are skipped.
  const readable = await hasAccess(handle);
  // Rejects if the file was moved or deleted.
  const file = readable ? await handle.getFile().catch(() => undefined) : undefined;
  if (!file || file.lastModified === entry.lastModified) return;
  const content = await file.text().catch(() => undefined);
  const doc = documentsState.documents.find((d) => d.id === id);
  // Read again next time: the document was closed, relinked or saved during the read.
  if (content === undefined || !doc || (await resolve(linkedFiles)).get(id) !== handle || isSaving(id)) return;
  entry.lastModified = file.lastModified;

  const hash = hashText(content);
  if (hash === doc.savedHash || content === doc.content) {
    // Saved elsewhere, such as by another tab, or changed back.
    if (content === doc.content && hash !== doc.savedHash) reloadDocument(id, content);
    entry.notice?.dismiss();
    entry.notice = undefined;
    return;
  }
  // Already shown for this version of the file, even if it was dismissed.
  if (entry.notice?.hash === hash) return;

  entry.notice?.dismiss();
  const message = hasUnsavedChanges(doc)
    ? `${doc.name} changed on disk. Reloading it replaces your unsaved changes.`
    : `${doc.name} changed on disk.`;
  entry.notice = {
    hash,
    dismiss: showNotice(message, {
      actions: [{ label: 'Reload', run: () => reloadDocument(id, content) }],
    }),
  };
}

let running: Promise<void> | undefined;

/**
 * Checks the files of the open documents that are linked to one, and shows a
 * notice offering to reload each document whose file has changed since it
 * was opened or saved. Files the page may not read yet, such as those of
 * handles restored after a reload, are skipped.
 */
export function checkFiles(): Promise<void> {
  running ??= (async () => {
    const linked = await resolve(linkedFiles);
    for (const id of watched.keys()) {
      if (!linked.has(id)) forget(id);
    }
    for (const [id, handle] of linked) await checkDocument(id, handle);
  })().finally(() => {
    running = undefined;
  });
  return running;
}

/**
 * Notices when an open document's file changes on disk, checking every
 * couple of seconds while the page is visible and whenever the window gains
 * focus. Call once from the app root.
 */
export function useFileChanges(): void {
  const check = () => {
    if (document.visibilityState === 'visible') void checkFiles();
  };

  createEffect(
    linkedFiles,
    () => {
      check();
      const timer = setInterval(check, FILE_CHECK_INTERVAL);
      return () => clearInterval(timer);
    },
    { name: 'fileChanges' },
  );

  onSettled(() => listen(window, { focus: check }));
  onSettled(() => listen(document, { visibilitychange: check }));
}
