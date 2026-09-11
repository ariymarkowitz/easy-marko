import { onSettled } from 'solid-js';
import { readFileHandle } from '../lib/files';
import { openFiles } from './documents';

/**
 * Opens the files that the OS opens the installed app with (manifest
 * `file_handlers`), switching to any that are already open. Call once from
 * the app root.
 */
export function useLaunchQueue(): void {
  onSettled(() => {
    window.launchQueue?.setConsumer((params) => {
      const handles = params.files.filter(
        (handle): handle is FileSystemFileHandle => handle.kind === 'file',
      );
      void openFiles(handles.map(readFileHandle));
    });
  });
}
