import { flush } from 'solid-js';
import { afterEach, expect, test, vi } from 'vitest';
import { mountHooks } from '../test-helpers';
import { activeDocument, documentsState } from './documents';
import { draggingFiles, useFileDrop } from './file-drop';

afterEach(() => {
  vi.restoreAllMocks();
});

const useDrop = () => mountHooks(useFileDrop);

/** Fires a drag event carrying `data` on the window, and returns it. */
function drag(type: string, data: DataTransfer): Event {
  const event = new Event(type, { cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: data });
  window.dispatchEvent(event);
  flush();
  return event;
}

/** A dropped file, as browsers without the File System Access API give it. */
const fileItem = (name: string, content: string) => ({
  kind: 'file',
  getAsFile: () => ({ name, text: async () => content }),
});

const files = (...items: object[]) =>
  ({ types: ['Files'], items, dropEffect: 'none' }) as unknown as DataTransfer;

const text = { types: ['text/plain'], items: [{ kind: 'string' }] } as unknown as DataTransfer;

test('shows the indicator until dragged files leave the window', () => {
  const dispose = useDrop();
  const data = files(fileItem('Notes.md', ''));
  drag('dragenter', data);
  expect(draggingFiles()).toBe(true);
  // Into a child element and back out of it.
  drag('dragenter', data);
  drag('dragleave', data);
  expect(draggingFiles()).toBe(true);
  drag('dragleave', data);
  expect(draggingFiles()).toBe(false);
  dispose();
});

test('leaves dragged text alone', () => {
  const dispose = useDrop();
  drag('dragenter', text);
  expect(draggingFiles()).toBe(false);
  expect(drag('dragover', text).defaultPrevented).toBe(false);
  expect(drag('drop', text).defaultPrevented).toBe(false);
  dispose();
});

test('opens dropped text files, but not other files', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const dispose = useDrop();
  const data = files(fileItem('Dropped.md', '# Dropped'), fileItem('Image.png', '\x89PNG\r\n\x1a\n\0\0\0\r'));
  drag('dragenter', data);
  expect(drag('dragover', data).defaultPrevented).toBe(true);
  expect(drag('drop', data).defaultPrevented).toBe(true);
  expect(draggingFiles()).toBe(false);

  await vi.waitFor(() => expect(activeDocument()?.name).toBe('Dropped.md'));
  expect(activeDocument()?.content).toBe('# Dropped');
  expect(documentsState.documents.some((doc) => doc.name === 'Image.png')).toBe(false);
  dispose();
});
