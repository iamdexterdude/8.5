// A tiny IndexedDB wrapper. Everything she does is stored on her device only.
// If IndexedDB is not available (some private windows) it falls back to memory and says so.

const DB_NAME = "eight";
const DB_VERSION = 1;
// store name -> key path (null = auto-increment)
const STORES = {
  kv: "key",            // settings and small flags
  tasks: "key",         // task state by plan key: {key, done, doneAt, skipped, movedTo, ...}
  errors: "id",         // the error log
  cards: "id",          // review cards with FSRS state
  reviewlog: null,      // every review (append only)
  essays: "id",
  recordings: "id",     // includes the audio blob
  scores: "id",         // band / raw-score results
  reading: "id",        // reading passage log
  study: "date",        // minutes studied per day
  pack: "key",          // the private course pack (items, materials, banks)
};

let db = null;
export let persistent = true;
const mem = {}; // fallback

export function open() {
  return new Promise((resolve) => {
    if (!("indexedDB" in window)) { persistent = false; return resolve(); }
    let req;
    try { req = indexedDB.open(DB_NAME, DB_VERSION); } catch { persistent = false; return resolve(); }
    req.onupgradeneeded = () => {
      const d = req.result;
      for (const [name, keyPath] of Object.entries(STORES)) {
        if (!d.objectStoreNames.contains(name)) d.createObjectStore(name, keyPath ? { keyPath } : { autoIncrement: true });
      }
    };
    req.onsuccess = () => { db = req.result; resolve(); };
    req.onerror = () => { persistent = false; resolve(); };
    req.onblocked = () => { persistent = false; resolve(); };
  });
}

const wrap = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const tx = (store, mode = "readonly") => db.transaction(store, mode).objectStore(store);

export async function all(store) {
  if (!db) return Object.values(mem[store] || {});
  return wrap(tx(store).getAll());
}
export async function get(store, key) {
  if (!db) return (mem[store] || {})[key];
  return wrap(tx(store).get(key));
}
export async function put(store, value) {
  if (!db) {
    const k = STORES[store] ? value[STORES[store]] : (mem[store + "#n"] = (mem[store + "#n"] || 0) + 1);
    (mem[store] ||= {})[k] = value; return k;
  }
  return wrap(tx(store, "readwrite").put(value));
}
export async function del(store, key) {
  if (!db) { delete (mem[store] || {})[key]; return; }
  return wrap(tx(store, "readwrite").delete(key));
}
export async function clear(store) {
  if (!db) { mem[store] = {}; return; }
  return wrap(tx(store, "readwrite").clear());
}
export const storeNames = Object.keys(STORES);
