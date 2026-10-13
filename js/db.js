// A tiny IndexedDB wrapper. Everything she does is stored on her device only.
// Two databases, so an older copy of the app open in another tab can never block saving:
//   "eight"     the original stores (unchanged since the first release, always version 1)
//   "eight-hw"  homework progress, the cached feed and the send queue (added later, its own database)
// If IndexedDB is not available at all (some private windows), it falls back to memory and says so.

const MAIN = { name: "eight", stores: {
  kv: "key",            // settings and small flags
  tasks: "key",         // task state by plan key
  errors: "id",         // the error log
  cards: "id",          // review cards with FSRS state
  reviewlog: null,      // every review (append only)
  essays: "id",
  recordings: "id",     // includes the audio blob
  scores: "id",         // band / raw-score results
  reading: "id",        // reading passage log
  study: "date",        // minutes studied per day
  pack: "key",          // the private course pack
} };
const HW = { name: "eight-hw", stores: {
  hw: "date",           // her progress through each day's homework, step by step
  feed: "key",          // the last homework feed fetched (so Today works offline)
  outbox: "id",         // work waiting to be sent to the teacher
} };
const STORES = { ...MAIN.stores, ...HW.stores };
const OF = (store) => (store in HW.stores ? "hw" : "main");

const conns = { main: null, hw: null };
export let persistent = true;
export let problem = "";   // why saving failed, shown on the warning so it can be fixed
const mem = {}; // fallback

function openOne(def) {
  return new Promise((resolve) => {
    let settled = false, req;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };
    // never hang the app: if it does not open in 5 seconds, start without it
    const timer = setTimeout(() => { problem = problem || `${def.name}: did not open in 5 s (another tab may be holding it)`; done(null); }, 5000);
    const upgrade = () => { const d = req.result; for (const [name, keyPath] of Object.entries(def.stores)) if (!d.objectStoreNames.contains(name)) d.createObjectStore(name, keyPath ? { keyPath } : { autoIncrement: true }); };
    const attempt = (version) => {
      try { req = version ? indexedDB.open(def.name, version) : indexedDB.open(def.name); } catch (e) { clearTimeout(timer); problem = `${def.name}: ${e.name}`; return done(null); }
      req.onupgradeneeded = upgrade;
      req.onsuccess = () => { clearTimeout(timer); if (settled) { req.result.close(); return; } const d = req.result; d.onversionchange = () => d.close(); done(d); };
      req.onerror = (ev) => {
        // this database already exists at a higher version (an earlier release): open it as it is
        if (req.error?.name === "VersionError" && version) { ev.preventDefault?.(); return attempt(0); }
        clearTimeout(timer); problem = `${def.name}: ${req.error?.name || "error"} ${req.error?.message || ""}`.trim(); done(null);
      };
    };
    attempt(1);
  });
}

export async function open() {
  if (!("indexedDB" in window)) { persistent = false; problem = "this browser has no IndexedDB"; return; }
  [conns.main, conns.hw] = await Promise.all([openOne(MAIN), openOne(HW)]);
  if (!conns.main || !conns.main.objectStoreNames.contains("kv")) {
    persistent = false;
    // keep trying quietly: a tab that was in the way may close, or the browser may just have been slow. When it opens, reload once.
    let tries = 0;
    const t = setInterval(async () => {
      if (++tries > 20) return clearInterval(t);
      problem = "";
      const m = await openOne(MAIN);
      if (m && m.objectStoreNames.contains("kv")) {
        clearInterval(t); m.close();
        try { if (!sessionStorage.getItem("eight-db-retry")) { sessionStorage.setItem("eight-db-retry", "1"); location.reload(); } } catch { location.reload(); }
      }
    }, 3000);
  }
}

const wrap = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
function tx(store, mode = "readonly") {
  const d = conns[OF(store)];
  if (!d || !d.objectStoreNames.contains(store)) return null;
  return d.transaction(store, mode).objectStore(store);
}

export async function all(store) {
  const s = tx(store); if (!s) return Object.values(mem[store] || {});
  return wrap(s.getAll());
}
export async function get(store, key) {
  const s = tx(store); if (!s) return (mem[store] || {})[key];
  return wrap(s.get(key));
}
export async function put(store, value) {
  const s = tx(store, "readwrite");
  if (!s) {
    const k = STORES[store] ? value[STORES[store]] : (mem[store + "#n"] = (mem[store + "#n"] || 0) + 1);
    (mem[store] ||= {})[k] = value; return k;
  }
  return wrap(s.put(value));
}
export async function del(store, key) {
  const s = tx(store, "readwrite"); if (!s) { delete (mem[store] || {})[key]; return; }
  return wrap(s.delete(key));
}
export async function clear(store) {
  const s = tx(store, "readwrite"); if (!s) { mem[store] = {}; return; }
  return wrap(s.clear());
}
export const storeNames = Object.keys(STORES);
