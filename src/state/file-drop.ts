import { createSignal, onSettled } from 'solid-js';
import { carriesFiles, readDroppedFiles } from '../lib/files';
import { openFiles } from './documents';

const [draggingFiles, setDraggingFiles] = createSignal(false);

/** Whether files are being dragged over the window. */
export { draggingFiles };

/**
 * Opens files dropped anywhere in the window, switching to any that are
 * already open, and tracks when files are dragged over it. Other drags, such
 * as text dragged in the editor, are left alone. Call once from the app root.
 */
export function useFileDrop(): void {
  onSettled(() => {
    // dragenter and dragleave fire for each element the drag crosses, so
    // count them to tell when it leaves the window.
    let depth = 0;

    const onDragEnter = (event: DragEvent) => {
      if (!carriesFiles(event.dataTransfer)) return;
      depth++;
      setDraggingFiles(true);
    };
    const onDragLeave = (event: DragEvent) => {
      if (!carriesFiles(event.dataTransfer)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDraggingFiles(false);
    };
    const onDragOver = (event: DragEvent) => {
      if (!event.dataTransfer || !carriesFiles(event.dataTransfer)) return;
      // Allows the drop. Otherwise the browser opens the file in place of the app.
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    };
    const onDrop = (event: DragEvent) => {
      if (!event.dataTransfer || !carriesFiles(event.dataTransfer)) return;
      event.preventDefault();
      depth = 0;
      setDraggingFiles(false);
      void openFiles(readDroppedFiles(event.dataTransfer));
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
      setDraggingFiles(false);
    };
  });
}
