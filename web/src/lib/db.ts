import type { Notebook } from "./types";
import { migrate } from "./normalize";

const DB_NAME = "investment-notebook";
const DB_VERSION = 1;
const STORE = "kv";
const KEY = "notebook";

/**
 * IndexedDB holds the whole notebook document.
 * DB_VERSION is the store layout. Notebook.schemaVersion is the document shape.
 * migrate() runs on every read so older documents can be upgraded without a store rewrite.
 */
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB 開啟失敗"));
  });
}

export async function loadNotebook(): Promise<Notebook | null> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).get(KEY);
      request.onsuccess = () => {
        resolve(request.result == null ? null : migrate(request.result));
      };
      request.onerror = () => reject(request.error ?? new Error("讀取失敗"));
    });
  } finally {
    db.close();
  }
}

export async function saveNotebook(notebook: Notebook): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(notebook, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("寫入失敗"));
    });
  } finally {
    db.close();
  }
}
