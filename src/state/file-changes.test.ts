import { flush } from 'solid-js';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { openFile } from '../lib/files';
import {
  activeDocument,
  closeDocument,
  hasUnsavedChanges,
  openDocument,
  renameDocument,
  updateContent,
} from './documents';
import { checkFiles } from './file-changes';
import { dismissNotice, notices } from './notices';

vi.mock('../lib/files', () => ({ openFile: vi.fn(), saveFile: vi.fn() }));

vi.mock('../lib/handle-store', () => ({
  readHandles: async () => new Map(),
  storeHandle: async () => {},
  deleteHandles: async () => {},
}));

/** A file on disk, and a handle to it whose read permission can be withdrawn. */
function fakeFile(name: string, content: string) {
  const file = { content, lastModified: 1, permission: 'granted' as PermissionState };
  const handle = {
    name,
    getFile: async () => ({ lastModified: file.lastModified, text: async () => file.content }),
    queryPermission: async () => file.permission,
    isSameEntry: async (other: unknown) => other === handle,
  } as unknown as FileSystemFileHandle;
  const write = (next: string) => {
    file.content = next;
    file.lastModified++;
  };
  return { file, handle, write };
}

async function openFake(name: string, content: string) {
  const fake = fakeFile(name, content);
  vi.mocked(openFile).mockResolvedValueOnce({ name, content, handle: fake.handle });
  await openDocument();
  flush();
  return { ...fake, doc: activeDocument()! };
}

async function check() {
  await checkFiles();
  flush();
}

const messages = () => notices().map((notice) => notice.message);

beforeEach(() => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
  for (const notice of notices()) dismissNotice(notice.id);
  flush();
  vi.restoreAllMocks();
});

test('offers to reload a document whose file changed on disk', async () => {
  const { doc, write } = await openFake('Changed.md', 'Before');
  await check();
  expect(notices()).toHaveLength(0);

  write('After');
  await check();
  expect(messages()).toEqual(['Changed.md changed on disk.']);

  notices()[0].actions[0].run();
  dismissNotice(notices()[0].id);
  flush();
  expect(doc.content).toBe('After');
  expect(hasUnsavedChanges(doc)).toBe(false);

  await check();
  expect(notices()).toHaveLength(0);
  closeDocument(doc.id);
});

test('warns that reloading replaces unsaved changes', async () => {
  const { doc, write } = await openFake('Edited.md', 'Before');
  updateContent(doc.id, 'My edit');
  flush();
  write('Their edit');
  await check();
  expect(messages()).toEqual([
    'Edited.md changed on disk. Reloading it replaces your unsaved changes.',
  ]);
  closeDocument(doc.id);
});

test('does not show a dismissed notice again until the file changes again', async () => {
  const { doc, write } = await openFake('Dismissed.md', 'Before');
  write('After');
  await check();
  dismissNotice(notices()[0].id);
  flush();

  await check();
  expect(notices()).toHaveLength(0);

  write('Later');
  await check();
  expect(notices()).toHaveLength(1);
  closeDocument(doc.id);
});

test('ignores a file changed to match the document, and marks the document saved', async () => {
  const { doc, write } = await openFake('Matching.md', 'Before');
  updateContent(doc.id, 'Saved elsewhere');
  flush();
  write('Saved elsewhere');
  await check();
  expect(notices()).toHaveLength(0);
  expect(hasUnsavedChanges(doc)).toBe(false);
  closeDocument(doc.id);
});

test('closes the notice when the document is closed or unlinked', async () => {
  const closed = await openFake('Closed.md', 'Before');
  const renamed = await openFake('Renamed.md', 'Before');
  closed.write('After');
  renamed.write('After');
  await check();
  expect(notices()).toHaveLength(2);

  closeDocument(closed.doc.id);
  renameDocument(renamed.doc.id, 'Other name.md');
  flush();
  await check();
  expect(notices()).toHaveLength(0);
  closeDocument(renamed.doc.id);
});

test('skips files the page may not read', async () => {
  const { doc, file, write } = await openFake('Restored.md', 'Before');
  file.permission = 'prompt';
  write('After');
  await check();
  expect(notices()).toHaveLength(0);

  file.permission = 'granted';
  await check();
  expect(notices()).toHaveLength(1);
  closeDocument(doc.id);
});
