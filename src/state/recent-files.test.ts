import { flush } from 'solid-js';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { RecentFile } from '../lib/recent-store';
import { activeDocument, closeDocument, documentsState, openRecentFile } from './documents';
import { dismissNotice, notices } from './notices';
import { forgetFile, RECENT_FILES_LIMIT, recentFiles, rememberFile } from './recent-files';

/** The list in IndexedDB, which all tabs share. */
const stored = vi.hoisted(() => ({ list: [] as RecentFile[] }));

vi.mock('../lib/recent-store', () => ({
  readRecentFiles: async () => stored.list,
  writeRecentFiles: async (list: RecentFile[]) => {
    stored.list = [...list];
  },
}));

vi.mock('../lib/handle-store', () => ({
  readHandles: async () => new Map(),
  storeHandle: async () => {},
  deleteHandles: async () => {},
}));

/** A stand-in for a file handle; handles with the same path are the same file. */
function fakeHandle(
  name: string,
  { path = name, permission = 'granted' as PermissionState, missing = false } = {},
): FileSystemFileHandle {
  return {
    kind: 'file',
    name,
    path,
    getFile: async () => {
      if (missing) throw new DOMException('Not found', 'NotFoundError');
      return { name, lastModified: 0, text: async () => `# ${name}` };
    },
    queryPermission: async () => permission,
    requestPermission: async () => permission,
    isSameEntry: async (other: { path?: string }) => other.path === path,
  } as unknown as FileSystemFileHandle;
}

const names = () => recentFiles().map((file) => file.name);

beforeEach(() => {
  stored.list = [];
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
  for (const notice of notices()) dismissNotice(notice.id);
  for (const id of documentsState.documents.map((doc) => doc.id)) closeDocument(id);
  flush();
  vi.restoreAllMocks();
});

test('lists files newest first, once each, up to the limit', async () => {
  await rememberFile(fakeHandle('A.md'));
  await rememberFile(fakeHandle('B.md'));
  await rememberFile(fakeHandle('A.md'));
  flush();
  expect(names()).toEqual(['A.md', 'B.md']);

  for (let i = 0; i < RECENT_FILES_LIMIT; i++) await rememberFile(fakeHandle(`${i}.md`));
  flush();
  expect(names()).toHaveLength(RECENT_FILES_LIMIT);
  expect(names()[0]).toBe(`${RECENT_FILES_LIMIT - 1}.md`);
  expect(stored.list.map((file) => file.name)).toEqual(names());
});

test('keeps same-named files in different folders apart, and forgets one', async () => {
  await rememberFile(fakeHandle('Notes.md', { path: 'work/Notes.md' }));
  await rememberFile(fakeHandle('Notes.md', { path: 'home/Notes.md' }));
  flush();
  expect(names()).toEqual(['Notes.md', 'Notes.md']);

  await forgetFile(fakeHandle('Notes.md', { path: 'work/Notes.md' }));
  flush();
  expect(recentFiles().map((file) => (file.handle as unknown as { path: string }).path)).toEqual([
    'home/Notes.md',
  ]);
});

test('opens a recent file, and switches to it when it is already open', async () => {
  await openRecentFile(fakeHandle('Recent.md'));
  flush();
  const doc = activeDocument()!;
  expect(doc.name).toBe('Recent.md');
  expect(doc.content).toBe('# Recent.md');
  await vi.waitFor(() => expect(names()).toEqual(['Recent.md']));

  const count = documentsState.documents.length;
  await openRecentFile(fakeHandle('Recent.md'));
  flush();
  expect(documentsState.documents).toHaveLength(count);
  expect(activeDocument()?.id).toBe(doc.id);
});

test('does nothing when reading the file is not allowed', async () => {
  const count = documentsState.documents.length;
  await openRecentFile(fakeHandle('Denied.md', { permission: 'denied' }));
  flush();
  expect(documentsState.documents).toHaveLength(count);
  expect(notices()).toHaveLength(0);
});

test('reports and forgets a file that has been moved or deleted', async () => {
  const handle = fakeHandle('Gone.md', { missing: true });
  await rememberFile(handle);
  await openRecentFile(handle);
  await vi.waitFor(() => expect(names()).toEqual([]));
  expect(notices().map((notice) => notice.message)).toEqual(['Gone.md has been moved or deleted.']);
});
