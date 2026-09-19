import { createSignal, onSettled } from 'solid-js';
import { listen } from '../lib/events';
import { carriesFiles, readDroppedFiles } from '../lib/files';
import { openFiles } from './documents';

const [draggingFiles, setDraggingFiles] = createSignal(false);

/** Whether files are being dragged over the window. */
export { draggingFiles };

/** `handler`, run only for drags that carry files. */
const forFiles =
  (handler: (event: DragEvent, data: DataTransfer) => void) =>
  (event: DragEvent): void => {
    if (carriesFiles(event.dataTransfer)) handler(event, event.dataTransfer);
  };

/**
 * Opens files dropped anywhere in the window, switching to any that are
 * already open, and tracks when files are dragged over it. Other drags, such
 * as text dragged in the editor, are left alone. Call once from the app root.
 */
export function useFileDrop(): void {
  // dragenter and dragleave fire for each element the drag crosses, so
  // count them to tell when it leaves the window.
  let depth = 0;

  onSettled(() =>
    listen(window, {
      dragenter: forFiles(() => {
        depth++;
        setDraggingFiles(true);
      }),
      dragleave: forFiles(() => {
        depth = Math.max(0, depth - 1);
        if (depth === 0) setDraggingFiles(false);
      }),
      dragover: forFiles((event, data) => {
        // Allows the drop. Otherwise the browser opens the file in place of the app.
        event.preventDefault();
        data.dropEffect = 'copy';
      }),
      drop: forFiles((event, data) => {
        event.preventDefault();
        depth = 0;
        setDraggingFiles(false);
        void openFiles(readDroppedFiles(data));
      }),
    }),
  );

  // Clears the drop indicator if the app is torn down mid-drag.
  onSettled(() => () => setDraggingFiles(false));
}
