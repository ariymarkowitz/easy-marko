import { useListeners } from './reactive';
import { openDocument, saveActiveDocument } from './state/documents';

const shortcuts: Record<string, () => void> = {
  s: saveActiveDocument,
  o: openDocument,
};

/** App-wide keyboard shortcuts (Cmd on macOS, Ctrl elsewhere). Call once from the app root. */
export function useShortcuts(): void {
  useListeners(window, {
    keydown: (event) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
      const action = shortcuts[event.key.toLowerCase()];
      if (!action) return;
      event.preventDefault();
      action();
    },
  });
}
