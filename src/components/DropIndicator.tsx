import { Show } from 'solid-js';
import { draggingFiles } from '../state/file-drop';

/** Outlines the window while files are dragged over it. */
export default function DropIndicator() {
  return (
    <Show when={draggingFiles()}>
      <div class="drop-indicator" aria-hidden="true">
        <span class="drop-indicator-label">Drop to open</span>
      </div>
    </Show>
  );
}
