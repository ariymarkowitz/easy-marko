import { createRoot, flush } from 'solid-js';
import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest';
import { openFile } from '../lib/files';
import { fakeFileHandle, fakeFolder } from '../lib/local-images.fakes';
import { closeDocument, documentsState, newDocument, openDocument } from './documents';
import { allowImageAccess, useLocalImages, withLocalImages } from './local-images';
import { dismissNotice, notices } from './notices';

vi.mock('../lib/files', () => ({ openFile: vi.fn(), saveFile: vi.fn() }));

vi.mock('../lib/handle-store', () => ({
  readHandles: async () => new Map(),
  storeHandle: async () => {},
  deleteHandles: async () => {},
}));

const storedFolders = vi.hoisted(() => ({ list: [] as FileSystemDirectoryHandle[] }));

vi.mock('../lib/folder-store', () => ({
  readFolders: async () => storedFolders.list,
  writeFolders: async (list: FileSystemDirectoryHandle[]) => {
    storedFolders.list = [...list];
  },
}));

const files = { 'project/docs/notes.md': '', 'project/docs/img/a.png': 'png', 'project/logo.png': 'logo' };
const html = '<p><img src="img/a.png" alt="A"><img src="../logo.png" alt="Logo"></p>';

let dispose: () => void;

beforeAll(() => {
  window.showDirectoryPicker = vi.fn();
  URL.createObjectURL = (blob) => `blob:${(blob as File).name}`;
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  dispose = createRoot((dispose) => {
    useLocalImages();
    return dispose;
  });
});

afterAll(() => {
  dispose();
  delete window.showDirectoryPicker;
});

afterEach(() => {
  for (const notice of notices()) dismissNotice(notice.id);
  flush();
});

function render() {
  const root = document.createElement('div');
  root.innerHTML = withLocalImages(html);
  return {
    srcs: [...root.querySelectorAll('img')].map((img) => img.getAttribute('src')),
    placeholders: [...root.querySelectorAll('.local-image-label')].map((label) => label.textContent),
  };
}

test('leaves images alone for a document without a file', async () => {
  newDocument();
  flush();
  await vi.waitFor(() => expect(withLocalImages(html)).toBe(html));
});

test('shows placeholders until a folder is granted, then the images it can reach', async () => {
  vi.mocked(openFile).mockResolvedValueOnce({
    name: 'notes.md',
    content: html,
    handle: fakeFileHandle('project/docs/notes.md'),
  });
  await openDocument();
  flush();
  await vi.waitFor(() => expect(render().placeholders).toEqual(['A', 'Logo']));

  // A folder that doesn't contain the file is refused.
  vi.mocked(window.showDirectoryPicker!).mockResolvedValueOnce(fakeFolder('elsewhere', files, ['elsewhere']));
  await allowImageAccess();
  flush();
  expect(notices().map((notice) => notice.message)).toEqual([
    "notes.md isn't in elsewhere. Choose its folder, or a folder above it.",
  ]);

  // The document's own folder shows its images, but not ../logo.png.
  vi.mocked(window.showDirectoryPicker!).mockResolvedValueOnce(fakeFolder('docs', files, ['project', 'docs']));
  await allowImageAccess();
  flush();
  expect(render()).toEqual({ srcs: [null], placeholders: ['Logo'] });
  await vi.waitFor(() => expect(render()).toEqual({ srcs: ['blob:a.png'], placeholders: ['Logo'] }));
  expect(window.showDirectoryPicker).toHaveBeenLastCalledWith({ startIn: expect.anything(), mode: 'read' });

  // A higher folder reaches it too, and both folders are kept.
  vi.mocked(window.showDirectoryPicker!).mockResolvedValueOnce(fakeFolder('project', files, ['project']));
  await allowImageAccess();
  flush();
  await vi.waitFor(() => expect(render()).toEqual({ srcs: ['blob:a.png', 'blob:logo.png'], placeholders: [] }));
  expect(storedFolders.list.map((folder) => folder.name)).toEqual(['docs', 'project']);
});

test('reports images missing from a granted folder', async () => {
  vi.mocked(openFile).mockResolvedValueOnce({
    name: 'other.md',
    content: '',
    handle: fakeFileHandle('project/other.md'),
  });
  await openDocument();
  flush();
  await vi.waitFor(() => expect(render().placeholders).toEqual(['A (not found)', 'Logo']));
  for (const id of documentsState.documents.map((doc) => doc.id)) closeDocument(id);
});
