// File handles kept in IndexedDB, keyed by document id, so saves can go back
// to the same file after a reload. Handles can't go in localStorage, but
// IndexedDB can store them. Like localStorage, IndexedDB can be unavailable or
// fail, so every access is best effort: reads give undefined and writes are
// dropped.
//
// All tabs of the app share the database. Requests run in the order they're
// made, including across tabs, so a read sees every write requested before it.

const DATABASE = 'easy-marko';
const STORE = 'file-handles';

let database: Promise<IDBDatabase> | undefined;

function openDatabase(): Promise<IDBDatabase> {
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => {
      const db = request.result;
      // Another tab is upgrading the database: let it, and reopen next time.
      db.onversionchange = () => {
        db.close();
        database = undefined;
      };
      resolve(db);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('IndexedDB is blocked'));
  }).catch((error: unknown) => {
    database = undefined;
    throw error;
  });
  return database;
}

/** Runs `use` in a transaction on the handles store and resolves when the transaction completes. */
async function transaction<T>(
  mode: IDBTransactionMode,
  use: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | undefined> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = use(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(request?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function hasIndexedDB(): boolean {
  try {
    return typeof indexedDB !== 'undefined';
  } catch {
    return false;
  }
}

/** Every stored handle by document id, or undefined if IndexedDB can't be read. */
export async function readHandles(): Promise<Map<string, FileSystemFileHandle> | undefined> {
  if (!hasIndexedDB()) return undefined;
  try {
    const handles = new Map<string, FileSystemFileHandle>();
    await transaction('readonly', (store) => {
      const cursor = store.openCursor();
      cursor.onsuccess = () => {
        const current = cursor.result;
        if (!current) return;
        handles.set(String(current.key), current.value as FileSystemFileHandle);
        current.continue();
      };
    });
    return handles;
  } catch {
    return undefined;
  }
}

export async function storeHandle(id: string, handle: FileSystemFileHandle): Promise<void> {
  if (!hasIndexedDB()) return;
  try {
    await transaction('readwrite', (store) => store.put(handle, id));
  } catch {
    // Best effort: without the handle, the next save after a reload asks where to save.
  }
}

export async function deleteHandles(ids: Iterable<string>): Promise<void> {
  if (!hasIndexedDB()) return;
  try {
    await transaction('readwrite', (store) => {
      for (const id of ids) store.delete(id);
    });
  } catch {
    // Ignore: a leftover entry is removed the next time the app starts.
  }
}
