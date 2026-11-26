import type { BinaryFileData, BinaryFiles } from '@excalidraw/excalidraw/types';
import { silently } from '../utils/common';

export const FILES_DB_NAME = 'files-db';
export const FILES_STORE_NAME = 'files-store';
export const FILES_DB_VERSION = 2;

let idbWriteQueue: Promise<unknown> = Promise.resolve();

function enqueueIdbMutation<T>(fn: () => Promise<T>): Promise<T> {
  const next = idbWriteQueue.then(fn, fn);
  idbWriteQueue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

function openFilesDb(idb: IDBFactory): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = idb.open(FILES_DB_NAME, FILES_DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(FILES_STORE_NAME)) {
          db.createObjectStore(FILES_STORE_NAME, { keyPath: 'id' });
        }
      };
      req.onblocked = () => resolve(null);
      req.onerror = () => resolve(null);
      req.onsuccess = () => {
        const db = req.result;
        try {
          db.onversionchange = () => silently(() => db.close());
        } catch {
          // ignore read-only onversionchange in minimal IDB shims
        }
        resolve(db);
      };
    } catch {
      resolve(null);
    }
  });
}

async function withFilesStore<T>(
  idb: IDBFactory | null,
  mode: IDBTransactionMode,
  fallback: T,
  run: (store: IDBObjectStore, tx: IDBTransaction, finish: (result: T) => void) => void,
): Promise<T> {
  if (!idb || typeof idb.open !== 'function') return fallback;
  const db = await openFilesDb(idb);
  if (!db) return fallback;

  return new Promise<T>((resolve) => {
    let settled = false;
    const settle = (value: T) => {
      if (settled) return;
      settled = true;
      silently(() => db.close());
      resolve(value);
    };

    try {
      if (!db.objectStoreNames?.contains(FILES_STORE_NAME)) {
        settle(fallback);
        return;
      }
      const tx = db.transaction(FILES_STORE_NAME, mode);
      tx.onabort = () => settle(fallback);
      tx.onerror = () => settle(fallback);
      const store = tx.objectStore(FILES_STORE_NAME);
      run(store, tx, settle);
    } catch {
      settle(fallback);
    }
  });
}

/**
 * Clears all binary image files stored in Excalidraw's IndexedDB store.
 */
export async function clearIndexedDbFiles(
  idb: IDBFactory | null = typeof indexedDB !== 'undefined' ? indexedDB : null,
): Promise<boolean> {
  return enqueueIdbMutation(() =>
    withFilesStore(idb, 'readwrite', false, (store, tx, finish) => {
      tx.oncomplete = () => finish(true);
      store.clear();
    }),
  );
}

/**
 * Loads all persisted binary files from IndexedDB keyed by file ID.
 */
export async function loadFilesFromIndexedDb(
  idb: IDBFactory | null = typeof indexedDB !== 'undefined' ? indexedDB : null,
): Promise<BinaryFiles> {
  return enqueueIdbMutation(() =>
    withFilesStore<BinaryFiles>(idb, 'readonly', {}, (store, _tx, finish) => {
      const req = store.getAll();
      req.onsuccess = () => {
        const files: BinaryFiles = {};
        for (const item of (req.result || []) as BinaryFileData[]) {
          if (item?.id) {
            files[item.id] = item;
          }
        }
        finish(files);
      };
      req.onerror = () => finish({});
    }),
  );
}

/**
 * Persists the given binary files into IndexedDB.
 */
export async function saveFilesToIndexedDb(
  files: BinaryFiles,
  idb: IDBFactory | null = typeof indexedDB !== 'undefined' ? indexedDB : null,
): Promise<boolean> {
  const entries = Object.values(files || {});
  if (entries.length === 0) return true;
  return enqueueIdbMutation(() =>
    withFilesStore(idb, 'readwrite', false, (store, tx, finish) => {
      tx.oncomplete = () => finish(true);
      for (const file of entries) {
        if (file?.id) {
          store.put(file);
        }
      }
    }),
  );
}
