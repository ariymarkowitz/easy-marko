// Replaces handle-store.ts in tests that call `vi.mock('../lib/handle-store')`.

/** The handles in IndexedDB, which all tabs share. */
export const storedHandles = new Map<string, FileSystemFileHandle>();

export const readHandles = async () => new Map(storedHandles);

export async function storeHandle(id: string, handle: FileSystemFileHandle): Promise<void> {
  storedHandles.set(id, handle);
}

export async function deleteHandles(ids: Iterable<string>): Promise<void> {
  for (const id of ids) storedHandles.delete(id);
}
