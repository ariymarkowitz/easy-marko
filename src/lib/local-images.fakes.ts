// Stand-ins for File System Access API folders and files, for tests.

/** A stand-in folder of files, given as paths to their contents. */
export function fakeFolder(name: string, files: Record<string, string>, prefix: string[] = []): FileSystemDirectoryHandle {
  const entries = Object.entries(files).map(([path, content]) => [path.split('/'), content] as const);
  const within = entries.filter(([path]) => prefix.every((part, i) => path[i] === part));
  const folder = {
    kind: 'directory',
    name,
    path: prefix,
    queryPermission: async () => 'granted',
    isSameEntry: async (other: { kind?: string; path?: string[] }) =>
      other.kind === 'directory' && other.path?.join('/') === prefix.join('/'),
    resolve: async (handle: { path?: string[] }) => {
      const path = handle.path ?? [];
      return prefix.every((part, i) => path[i] === part) ? path.slice(prefix.length) : null;
    },
    getDirectoryHandle: async (child: string) => {
      const next = [...prefix, child];
      if (!within.some(([path]) => path.length > next.length && next.every((part, i) => path[i] === part))) {
        throw new DOMException('Not found', 'NotFoundError');
      }
      return fakeFolder(child, files, next);
    },
    getFileHandle: async (child: string) => {
      const match = within.find(([path]) => path.length === prefix.length + 1 && path[prefix.length] === child);
      if (!match) throw new DOMException('Not found', 'NotFoundError');
      return { getFile: async () => new File([match[1]], child, { type: 'image/png' }) };
    },
  };
  return folder as unknown as FileSystemDirectoryHandle;
}

/** A stand-in file handle at `path` from the root of the fake folders. */
export const fakeFileHandle = (path: string) =>
  ({
    kind: 'file',
    name: path.split('/').pop(),
    path: path.split('/'),
    isSameEntry: async (other: { kind?: string; path?: string[] }) =>
      other.kind === 'file' && other.path?.join('/') === path,
  }) as unknown as FileSystemFileHandle;
