import { createRoot, flush } from 'solid-js';
import { afterEach, expect, test, vi } from 'vitest';
import { activeDocument, documentsState, newDocument } from './documents';
import { useLaunchQueue } from './launch-queue';

afterEach(() => {
  delete window.launchQueue;
});

/** Like the browser's queue: launches from before a consumer is set wait for it. */
function fakeLaunchQueue() {
  let consumer: ((params: LaunchParams) => void) | undefined;
  const waiting: LaunchParams[] = [];
  return {
    setConsumer(next: (params: LaunchParams) => void) {
      consumer = next;
      for (const params of waiting.splice(0)) next(params);
    },
    launch(files: FileSystemHandle[]) {
      if (consumer) consumer({ files });
      else waiting.push({ files });
    },
  };
}

/** A stand-in for a file handle; handles with the same name are the same file. */
function fakeFileHandle(name: string, content: string): FileSystemFileHandle {
  return {
    kind: 'file',
    name,
    getFile: async () => ({ name, text: async () => content }),
    isSameEntry: async (other: FileSystemHandle) => other.name === name,
  } as unknown as FileSystemFileHandle;
}

const folderHandle = { kind: 'directory', name: 'Folder' } as FileSystemHandle;

const documentsNamed = (name: string) => documentsState.documents.filter((doc) => doc.name === name);

test('opens the files the app was launched with, and switches to them when launched again', async () => {
  const queue = fakeLaunchQueue();
  window.launchQueue = queue;
  queue.launch([fakeFileHandle('Launched.md', '# Launched'), folderHandle]);

  const dispose = createRoot((dispose) => {
    useLaunchQueue();
    return dispose;
  });
  flush();
  await vi.waitFor(() => expect(activeDocument()?.name).toBe('Launched.md'));
  const launched = activeDocument()!;
  expect(launched.content).toBe('# Launched');

  newDocument();
  flush();
  queue.launch([fakeFileHandle('Launched.md', '# Launched')]);
  await vi.waitFor(() => expect(activeDocument()?.id).toBe(launched.id));
  expect(documentsNamed('Launched.md')).toHaveLength(1);
  expect(documentsNamed('Folder')).toHaveLength(0);
  dispose();
});
