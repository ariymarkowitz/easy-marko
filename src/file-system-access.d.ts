// The parts of the File System Access API that TypeScript's DOM lib doesn't
// declare yet. Optional, because only Chromium-based browsers implement them.

interface FilePickerAcceptType {
  description?: string;
  accept: Record<string, string[]>;
}

interface FilePickerOptions {
  types?: FilePickerAcceptType[];
  suggestedName?: string;
}

interface Window {
  showOpenFilePicker?(options?: FilePickerOptions): Promise<FileSystemFileHandle[]>;
  showSaveFilePicker?(options?: FilePickerOptions): Promise<FileSystemFileHandle>;
}
