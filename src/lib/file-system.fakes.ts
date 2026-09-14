// Stand-ins for File System Access API folders and files, for tests.

const startsWith = (path: readonly string[], prefix: readonly string[]) =>
  prefix.every((part, i) => path[i] === part);

/** A stand-in folder of files, given as paths to their contents. */
export function fakeFolder(name: string, files: Record<string, string>, prefix: string[] = []): FileSystemDirectoryHandle {
  const entries = Object.entries(files).map(([path, content]) => [path.split('/'), content] as const);
  const folder = {
    kind: 'directory',
    name,
    path: prefix,
    queryPermission: async () => 'granted',
    isSameEntry: async (other: { kind?: string; path?: string[] }) =>
      other.kind === 'directory' && other.path?.join('/') === prefix.join('/'),
    resolve: async (handle: { path?: string[] }) => {
      const path = handle.path ?? [];
      return startsWith(path, prefix) ? path.slice(prefix.length) : null;
    },
    getDirectoryHandle: async (child: string) => {
      const next = [...prefix, child];
      if (!entries.some(([path]) => path.length > next.length && startsWith(path, next))) {
        throw new DOMException('Not found', 'NotFoundError');
      }
      return fakeFolder(child, files, next);
    },
    getFileHandle: async (child: string) => {
      const match = entries.find(
        ([path]) => path.length === prefix.length + 1 && startsWith(path, prefix) && path[prefix.length] === child,
      );
      if (!match) throw new DOMException('Not found', 'NotFoundError');
      return { getFile: async () => new File([match[1]], child, { type: 'image/png' }) };
    },
  };
  return folder as unknown as FileSystemDirectoryHandle;
}

/**
 * A stand-in file handle at `path` from the root of the fake folders; handles
 * with the same path are the same file. Named after the path's last part
 * unless given a `name`. Reading it rejects with a NotFoundError if `missing`.
 */
export function fakeFileHandle(
  path: string,
  {
    name = path.split('/').pop()!,
    content = `# ${name}`,
    permission = 'granted',
    missing = false,
  }: { name?: string; content?: string; permission?: PermissionState; missing?: boolean } = {},
): FileSystemFileHandle {
  return {
    kind: 'file',
    name,
    path: path.split('/'),
    getFile: async () => {
      if (missing) throw new DOMException('Not found', 'NotFoundError');
      return { name, lastModified: 0, text: async () => content };
    },
    queryPermission: async () => permission,
    requestPermission: async () => permission,
    isSameEntry: async (other: { kind?: string; path?: string[] }) =>
      other.kind === 'file' && other.path?.join('/') === path,
  } as unknown as FileSystemFileHandle;
}
