// The app's IndexedDB database, for what localStorage can't hold, such as file
// handles. Like localStorage, IndexedDB can be unavailable or fail, so callers
// treat every access as best effort.
//
// All tabs of the app share the database. Requests run in the order they're
// made, including across tabs, so a read sees every write requested before it.

const DATABASE = 'easy-marko';

/** The object stores. Adding one needs a new database version. */
export const STORES = {
  /** File handles by document id (handle-store.ts). */
  fileHandles: 'file-handles',
  /** The recently opened files, as one list (recent-store.ts). */
  recentFiles: 'recent-files',
  /** The folders granted for showing local images, as one list (folder-store.ts). */
  folders: 'folders',
} as const;

type Store = (typeof STORES)[keyof typeof STORES];

const VERSION = 3;

let database: Promise<IDBDatabase> | undefined;

function openDatabase(): Promise<IDBDatabase> {
  // indexedDB is first read inside the executor, so a missing or blocked
  // global rejects like any other failure.
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const store of Object.values(STORES)) {
        if (!db.objectStoreNames.contains(store)) db.createObjectStore(store);
      }
    };
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

/** Runs `use` in a transaction on `store` and resolves when the transaction completes. */
export async function transaction<T>(
  store: Store,
  mode: IDBTransactionMode,
  use: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | undefined> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const request = use(tx.objectStore(store));
    tx.oncomplete = () => resolve(request?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
