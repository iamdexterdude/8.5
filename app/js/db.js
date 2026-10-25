// A tiny IndexedDB wrapper. Everything she does is stored on her device only.
//
// Two databases, so an older copy of the app open in another tab can never block saving:
//   "eight"     the original stores
//   "eight-hw"  homework progress, the cached feed and the send queue
// Each is opened at whatever version it already has; stores that are missing are added with one version step.
//
// Three safety nets, because a settings record that is lost means the welcome plays again:
//   1. the "kv" store (settings, name, flags) is mirrored in localStorage and merged back on load
//   2. writes made while a database is not open are kept in memory and written as soon as it opens
//   3. a database that will not open is retried quietly in the background; a corrupt one is rebuilt

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
  decks: "id",          // Anki decks (hers and the teacher's)
  mocks: "id",          // mock exam results, with her writing and her recordings
  checkins: "id",       // what she answered on Today
  media: "key",         // downloaded mock audio, decoded once
} };
const DEFS = { main: MAIN, hw: HW };
const STORES = { ...MAIN.stores, ...HW.stores };
const OF = (store) => (store in HW.stores ? "hw" : "main");
const OPEN_MS = 8000;
const KV_LS = "eight-kv";

const conns = { main: null, hw: null };
const opening = { main: null, hw: null };
const failures = { main: 0, hw: 0 };
export let persistent = true;
export let problem = "";
const mem = {};                 // what was written while a database was not open
const pending = [];             // [store, "put" | "del", value]
const readyFns = new Set();
export const onReady = (fn) => { readyFns.add(fn); return () => readyFns.delete(fn); };

// ---------- the localStorage mirror of "kv" ----------
function lsKv() { try { return JSON.parse(localStorage.getItem(KV_LS) || "{}"); } catch { return {}; } }
function lsKvWrite(obj) { try { localStorage.setItem(KV_LS, JSON.stringify(obj)); } catch {} }
function lsKvPut(row) { let s; try { s = JSON.stringify(row.value); } catch { return; } if (s.length > 20000) return; const o = lsKv(); o[row.key] = row.value; lsKvWrite(o); }
function lsKvDel(key) { const o = lsKv(); delete o[key]; lsKvWrite(o); }

// ---------- opening ----------
function openRaw(name, version, stores) {
  return new Promise((resolve, reject) => {
    let req, settled = false;
    const timer = setTimeout(() => { if (settled) return; settled = true; const e = new Error("did not open in " + OPEN_MS / 1000 + " s (another tab may be holding it)"); e.name = "TimeoutError"; reject(e); }, OPEN_MS);
    try { req = version ? indexedDB.open(name, version) : indexedDB.open(name); } catch (e) { clearTimeout(timer); return reject(e); }
    req.onupgradeneeded = () => { const d = req.result; for (const [n, keyPath] of Object.entries(stores)) if (!d.objectStoreNames.contains(n)) d.createObjectStore(n, keyPath ? { keyPath } : { autoIncrement: true }); };
    req.onsuccess = () => { clearTimeout(timer); if (settled) { req.result.close(); return; } settled = true; resolve(req.result); };
    req.onerror = (ev) => { clearTimeout(timer); ev.preventDefault?.(); if (settled) return; settled = true; reject(req.error || new Error("open failed")); };
    req.onblocked = () => { /* an old tab holds the database at a lower version; its onversionchange closes it, else the timeout fires */ };
  });
}
async function openOne(def) {
  let d = await openRaw(def.name, undefined, def.stores);
  if (Object.keys(def.stores).every((n) => d.objectStoreNames.contains(n))) return d;
  const v = d.version + 1; d.close();
  d = await openRaw(def.name, v, def.stores);
  return d;
}
const deleteDb = (name) => new Promise((res) => { try { const r = indexedDB.deleteDatabase(name); r.onsuccess = r.onerror = r.onblocked = () => res(); } catch { res(); } setTimeout(res, 4000); });

function updateFlags() {
  persistent = !!(conns.main && conns.hw);
  if (persistent) problem = "";
}
async function connect(which, attempt = 0) {
  if (opening[which]) return opening[which];
  opening[which] = (async () => {
    try {
      const d = await openOne(DEFS[which]);
      d.onversionchange = () => { try { d.close(); } catch {} if (conns[which] === d) { conns[which] = null; updateFlags(); setTimeout(() => connect(which), 800); } };
      d.onclose = () => { if (conns[which] === d) { conns[which] = null; updateFlags(); setTimeout(() => connect(which), 800); } };
      conns[which] = d; failures[which] = 0; updateFlags();
      const flushed = await flush(which);
      if (flushed && attempt > 0) for (const fn of readyFns) try { fn(); } catch {}
      return d;
    } catch (e) {
      conns[which] = null; failures[which]++;
      problem = `${DEFS[which].name}: ${e?.name || "error"} ${e?.message || ""}`.trim(); updateFlags();
      // a store that is broken beyond opening (UnknownError three times) is rebuilt; this device's copy is lost, her settings survive in the mirror
      if (e?.name === "UnknownError" && failures[which] >= 3) { await deleteDb(DEFS[which].name); failures[which] = 0; }
      if (attempt < 40) setTimeout(() => { opening[which] = null; connect(which, attempt + 1); }, attempt < 6 ? 3000 : 15000);
      return null;
    } finally { if (conns[which]) opening[which] = null; }
  })();
  return opening[which];
}

export async function open() {
  if (!("indexedDB" in window)) { persistent = false; problem = "this browser has no IndexedDB"; return; }
  await Promise.all([connect("main"), connect("hw")]);
}

// ---------- transactions ----------
const wrap = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
function tx(store, mode = "readonly") {
  const which = OF(store), d = conns[which];
  if (!d) return null;
  try { return d.transaction(store, mode).objectStore(store); }
  catch (e) { // the connection was closed under us (a version change, a browser hiccup): reconnect, answer from memory meanwhile
    conns[which] = null; updateFlags(); opening[which] = null; connect(which); return null;
  }
}
async function flush(which) {
  let n = 0;
  for (let i = 0; i < pending.length; i++) {
    const [store, op, value] = pending[i]; if (OF(store) !== which) continue;
    const s = tx(store, "readwrite"); if (!s) break;
    try { await wrap(op === "put" ? s.put(value) : s.delete(value)); n++; } catch {}
    pending.splice(i, 1); i--;
  }
  return n;
}
const memKey = (store, value) => (STORES[store] ? value[STORES[store]] : (mem[store + "#n"] = (mem[store + "#n"] || 0) + 1));

export async function all(store) {
  const s = tx(store);
  if (store === "kv") {
    const mirror = lsKv(), rows = s ? await wrap(s.getAll()).catch(() => []) : Object.values(mem.kv || {});
    const have = new Set(rows.map((r) => r.key));
    for (const [key, value] of Object.entries(mirror)) if (!have.has(key)) { rows.push({ key, value }); if (s) { const w = tx("kv", "readwrite"); if (w) wrap(w.put({ key, value })).catch(() => {}); } }
    return rows;
  }
  if (!s) return Object.values(mem[store] || {});
  return wrap(s.getAll());
}
export async function get(store, key) {
  const s = tx(store);
  if (store === "kv") { const v = s ? await wrap(s.get(key)).catch(() => undefined) : (mem.kv || {})[key]; if (v !== undefined) return v; const m = lsKv(); return key in m ? { key, value: m[key] } : undefined; }
  if (!s) return (mem[store] || {})[key];
  return wrap(s.get(key));
}
export async function put(store, value) {
  if (store === "kv") lsKvPut(value);
  const s = tx(store, "readwrite");
  if (!s) { const k = memKey(store, value); (mem[store] ||= {})[k] = value; pending.push([store, "put", value]); return k; }
  try { return await wrap(s.put(value)); }
  catch (e) { const k = memKey(store, value); (mem[store] ||= {})[k] = value; pending.push([store, "put", value]); return k; }
}
export async function del(store, key) {
  if (store === "kv") lsKvDel(key);
  const s = tx(store, "readwrite");
  if (!s) { delete (mem[store] || {})[key]; pending.push([store, "del", key]); return; }
  return wrap(s.delete(key)).catch(() => { pending.push([store, "del", key]); });
}
export async function clear(store) {
  if (store === "kv") lsKvWrite({});
  mem[store] = {};
  const s = tx(store, "readwrite"); if (!s) return;
  return wrap(s.clear()).catch(() => {});
}
export const storeNames = Object.keys(STORES);
export const status = () => ({ persistent, problem, pending: pending.length });
