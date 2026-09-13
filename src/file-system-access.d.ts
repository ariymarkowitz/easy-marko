// The parts of the File System Access and File Handling APIs that TypeScript's
// DOM lib doesn't declare yet. Optional, because only Chromium-based browsers
// implement them.

interface FilePickerAcceptType {
  description?: string;
  accept: Record<string, string[]>;
}

interface FilePickerOptions {
  types?: FilePickerAcceptType[];
  suggestedName?: string;
}

interface DirectoryPickerOptions {
  mode?: 'read' | 'readwrite';
  /** A handle whose folder the picker opens in, or a well-known folder. */
  startIn?: FileSystemHandle | string;
}

interface FileSystemHandlePermissionDescriptor {
  mode?: 'read' | 'readwrite';
}

interface FileSystemHandle {
  queryPermission?(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
  requestPermission?(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
}

interface DataTransferItem {
  /** A handle for a dropped file or folder, or null if the item isn't one. */
  getAsFileSystemHandle?(): Promise<FileSystemHandle | null>;
}

/** The files the installed app was opened with (manifest `file_handlers`). */
interface LaunchParams {
  readonly targetURL?: string;
  readonly files: readonly FileSystemHandle[];
}

interface LaunchQueue {
  /** Calls `consumer` with each launch, including any that happened before it was set. */
  setConsumer(consumer: (params: LaunchParams) => void): void;
}

interface Window {
  showOpenFilePicker?(options?: FilePickerOptions): Promise<FileSystemFileHandle[]>;
  showSaveFilePicker?(options?: FilePickerOptions): Promise<FileSystemFileHandle>;
  showDirectoryPicker?(options?: DirectoryPickerOptions): Promise<FileSystemDirectoryHandle>;
  launchQueue?: LaunchQueue;
}
