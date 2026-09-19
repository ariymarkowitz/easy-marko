import { flush } from 'solid-js';
import { afterEach, expect, test, vi } from 'vitest';
import { fakeFileHandle } from '../lib/file-system.fakes';
import { mountHooks } from '../test-helpers';
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

const folderHandle = { kind: 'directory', name: 'Folder' } as FileSystemHandle;

const documentsNamed = (name: string) => documentsState.documents.filter((doc) => doc.name === name);

test('opens the files the app was launched with, and switches to them when launched again', async () => {
  const queue = fakeLaunchQueue();
  window.launchQueue = queue;
  queue.launch([fakeFileHandle('Launched.md'), folderHandle]);

  const dispose = mountHooks(useLaunchQueue);
  await vi.waitFor(() => expect(activeDocument()?.name).toBe('Launched.md'));
  const launched = activeDocument()!;
  expect(launched.content).toBe('# Launched.md');

  newDocument();
  flush();
  queue.launch([fakeFileHandle('Launched.md')]);
  await vi.waitFor(() => expect(activeDocument()?.id).toBe(launched.id));
  expect(documentsNamed('Launched.md')).toHaveLength(1);
  expect(documentsNamed('Folder')).toHaveLength(0);
  dispose();
});
