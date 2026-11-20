import type { Notebook } from "./types";
import { migrate } from "./normalize";

const DB_NAME = "investment-notebook";
const DB_VERSION = 1;
const STORE = "kv";
const KEY = "notebook";
const LOCAL_KEY = "investment-notebook";

function userScore(book: Notebook): number {
  return book.holdings.length + book.cashFlows.length + book.trades.length + (book.cashHkd > 0 ? 1 : 0);
}

function mergeMarket(primary: Notebook, fallback: Notebook): Notebook {
  return {
    ...primary,
    priceHistory: Object.keys(primary.priceHistory).length ? primary.priceHistory : fallback.priceHistory,
    fxHistory: primary.fxHistory.length ? primary.fxHistory : fallback.fxHistory,
    quotes: Object.keys(primary.quotes).length ? primary.quotes : fallback.quotes,
    fx: primary.fx ?? fallback.fx,
  };
}

/** Prefer the copy that was saved later. A slim local copy keeps the other store's price history. */
export function chooseNotebook(idb: Notebook | null, local: Notebook | null): Notebook | null {
  if (!local) return idb;
  if (!idb) return local;
  const localAt = local.savedAt || "";
  const idbAt = idb.savedAt || "";
  if (idbAt > localAt) return idb;
  if (localAt > idbAt) return mergeMarket(local, idb);
  if (userScore(idb) > userScore(local)) return idb;
  if (userScore(local) > userScore(idb)) return mergeMarket(local, idb);
  return mergeMarket(idb, local);
}

export function readLocalNotebook(): Notebook | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return null;
    return migrate(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Synchronous save. Falls back to holdings and cash only if the full history does not fit. */
export function writeLocalNotebook(notebook: Notebook): "full" | "slim" | "failed" {
  if (typeof localStorage === "undefined") return "failed";
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(notebook));
    return "full";
  } catch {
    try {
      const slim: Notebook = { ...notebook, priceHistory: {}, fxHistory: [] };
      localStorage.setItem(LOCAL_KEY, JSON.stringify(slim));
      return "slim";
    } catch {
      return "failed";
    }
  }
}

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

export async function loadStoredNotebook(): Promise<Notebook | null> {
  const local = readLocalNotebook();
  let idb: Notebook | null = null;
  try {
    idb = await loadNotebook();
  } catch {
    idb = null;
  }
  return chooseNotebook(idb, local);
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
