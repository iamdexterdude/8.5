// Accounts: a name and a 4-digit PIN. The same account, with the same cards, tasks and mocks, on every device.
// The relay checks the PIN and gives this device a token; her data goes to accounts/<id>.json in the feed, and every device
// merges what the others did (cards keep their most-reviewed state, reviews are joined, finished work is never undone).
import * as db from "./db.js";
import * as store from "./store.js";
import * as hw from "./homework.js";
import { h } from "./util.js";

const LS = "eight-account";
const STORES = { cards: "id", reviewlog: null, decks: "id", hw: "date", mocks: "id", checkins: "id", tasks: "key", errors: "id", essays: "id", scores: "id", reading: "id", study: "date", kv: "key" };
const KV_LOCAL = new Set(["deviceId", "push", "nsent", "shareSig", "shareAt", "shareStats", "iosHint", "classConfig", "welcomed", "life", "visits"]);   // this device's own
const MIN_GAP = 3 * 60000;

export const account = () => { try { return JSON.parse(localStorage.getItem(LS) || "null"); } catch { return null; } };
const setAccount = (a) => { try { a ? localStorage.setItem(LS, JSON.stringify(a)) : localStorage.removeItem(LS); } catch {} };
export const signedIn = () => !!account()?.token;
export function signOut() { setAccount(null); }

// ---------- the snapshot: every store she owns, recordings left out (they are on the teacher's Telegram)
const strip = (k, v) => (typeof Blob !== "undefined" && v instanceof Blob ? { blob: true, type: v.type, size: v.size } : v);
async function snapshot() {
  const data = {};
  for (const s of Object.keys(STORES)) { try { data[s] = await db.all(s); } catch { data[s] = []; } }
  data.kv = (data.kv || []).filter((r) => !KV_LOCAL.has(r.key));
  return { v: 1, at: new Date().toISOString(), data };
}
const b64 = (u8) => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
async function pack(obj) {
  const text = JSON.stringify(obj, strip);
  if (typeof CompressionStream !== "function") return JSON.stringify({ v: 1, zip: false, text });
  const gz = new Uint8Array(await new Response(new Blob([new TextEncoder().encode(text)]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());
  return JSON.stringify({ v: 1, zip: true, b64: b64(gz) });
}
async function unpack(content) {
  const w = JSON.parse(content);
  if (!w.zip) return JSON.parse(w.text);
  const u8 = Uint8Array.from(atob(w.b64), (c) => c.charCodeAt(0));
  return JSON.parse(await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream("gzip"))).text());
}

// ---------- merging another device's data into this one; returns how many rows changed here
const reviewsOf = (c) => (c?.fsrs?.reps || 0) + (c?.fsrs?.lapses || 0);
const lastOf = (c) => Date.parse(c?.fsrs?.last_review || c?.updatedAt || 0) || 0;
function pickCard(mine, theirs) { if (!mine) return theirs; return reviewsOf(theirs) > reviewsOf(mine) || (reviewsOf(theirs) === reviewsOf(mine) && lastOf(theirs) > lastOf(mine)) ? theirs : null; }
function pickHw(mine, theirs) {
  if (!mine) return theirs;
  const steps = { ...(theirs.steps || {}) }; let changed = false;
  for (const [id, st] of Object.entries(mine.steps || {})) steps[id] = st;
  for (const [id, st] of Object.entries(theirs.steps || {})) {
    const m = (mine.steps || {})[id];
    if (!m) { changed = true; continue; }
    const merged = { ...st, ...m, sent: { ...(st.sent || {}), ...(m.sent || {}) }, done: !!(m.done || st.done) };
    if (JSON.stringify(merged) !== JSON.stringify(m)) { steps[id] = merged; changed = true; }
  }
  const completedAt = mine.completedAt || theirs.completedAt;
  if (completedAt !== mine.completedAt) changed = true;
  return changed ? { ...theirs, ...mine, steps, completedAt } : null;
}
function pickMock(mine, theirs) {
  if (!mine) return theirs;
  if (mine.status !== "done" && theirs.status === "done") return { ...theirs, recordings: (mine.recordings?.length ? mine.recordings : theirs.recordings) };
  return null;
}
async function merge(remote) {
  let n = 0;
  const D = remote?.data || {};
  for (const [s, key] of Object.entries(STORES)) {
    const theirs = D[s] || []; if (!theirs.length) continue;
    let mine = []; try { mine = await db.all(s); } catch {}
    if (s === "reviewlog") {
      const have = new Set(mine.map((r) => `${r.cardId}|${r.at}`));
      for (const r of theirs) if (!have.has(`${r.cardId}|${r.at}`)) { const { id, ...row } = r; await db.put(s, row); n++; }
      continue;
    }
    const byKey = new Map(mine.map((r) => [r[key], r]));
    for (const t of theirs) {
      const m = byKey.get(t[key]);
      let next = null;
      if (s === "cards") next = pickCard(m, t);
      else if (s === "hw") next = pickHw(m, t);
      else if (s === "mocks") next = pickMock(m, t);
      else if (s === "study") next = !m ? t : (t.minutes || 0) > (m.minutes || 0) ? t : null;
      else if (s === "kv") next = m ? null : t;   // her settings arrive where this device has none
      else next = m ? null : t;                   // decks, check-ins and the rest: whatever this device is missing
      if (next) { await db.put(s, next); n++; }
    }
  }
  return n;
}

// ---------- talking to the relay
async function call(op, body, timeout = 60000) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(hw.RELAY_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op, ...body }), signal: ctl.signal });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) { const e = new Error(j.error || "Could not reach 8.5. Check the connection."); Object.assign(e, j, { status: r.status }); throw e; }
    return j;
  } catch (e) { if (e.name === "AbortError") throw new Error("8.5 did not answer. Check the connection."); throw e; }
  finally { clearTimeout(t); }
}

let syncing = null, lastPush = 0, lastHash = "";
// pull what other devices saved, merge it in, then save the result for them
export function sync({ force = false } = {}) {
  const a = account(); if (!a?.token || hw.teacherDevice() || hw.viewingAs()) return Promise.resolve(false);
  if (syncing) return syncing;
  return (syncing = (async () => {
    try {
      const got = await call("sync-get", { token: a.token });
      let changed = 0;
      if (got.content) { try { changed = await merge(await unpack(got.content)); } catch (e) { console.warn("sync merge", e); } }
      if (changed) { await store.load(); store.changed(); }
      if (!force && !changed && Date.now() - lastPush < MIN_GAP) return changed > 0;
      const content = await pack(await snapshot()), hash = String(content.length) + content.slice(-64);
      if (force || changed || hash !== lastHash) { await call("sync-put", { token: a.token, content }); lastHash = hash; lastPush = Date.now(); }
      return changed > 0;
    } catch (e) { if (e.relogin) { signOut(); location.reload(); } return false; }
    finally { syncing = null; }
  })());
}
export function startSync() {
  setTimeout(() => sync(), 4000);
  setInterval(() => { if (!document.hidden) sync(); }, MIN_GAP + 5000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) sync(); else sync({ force: false }); });
}

// ---------- the screen: create an account, or log in
export function gate() {
  return new Promise((resolve) => {
    const known = hw.studentName();
    let mode = known ? "create" : "login";
    const root = h("div", { class: "acct", role: "dialog", "aria-modal": "true", "aria-label": "Your 8.5 account" });
    const card = h("div", { class: "acct-card" });
    root.append(card); document.body.append(root);
    const draw = (msg = "") => {
      const name = h("input", { type: "text", id: "acct-name", placeholder: "Your name", autocomplete: "username", maxLength: 40, value: name0 || known || "" });
      const pin = pinBox("acct-pin"), pin2 = pinBox("acct-pin2");
      const err = h("p", { class: "acct-err", "aria-live": "polite" }, msg);
      const go = h("button", { class: "btn primary", type: "submit" }, mode === "create" ? "Create account" : "Log in");
      const form = h("form", { class: "acct-form", onsubmit: async (e) => {
        e.preventDefault(); err.textContent = "";
        const n = name.value.trim(), p = pin.value();
        if (n.length < 2) { err.textContent = "Write your name."; return; }
        if (!/^\d{4}$/.test(p)) { err.textContent = "The PIN is 4 digits."; return; }
        if (mode === "create" && p !== pin2.value()) { err.textContent = "The two PINs are not the same."; return; }
        go.disabled = true; go.textContent = mode === "create" ? "Creating…" : "Logging in…";
        try {
          const r = await call(mode === "create" ? "signup" : "login", { name: n, pin: p }, 30000);
          setAccount({ id: r.id, name: r.name, token: r.token, at: new Date().toISOString() });
          if (r.name !== store.setting("name")) await store.setSetting("name", r.name);
          go.textContent = "Bringing your work…";
          await sync({ force: true });
          root.classList.add("out"); setTimeout(() => { root.remove(); resolve(r); }, 300);
        } catch (x) {
          name0 = n;
          if (x.taken) { mode = "login"; draw(x.message); return; }
          if (x.missing) { mode = "create"; draw(x.message); return; }
          err.textContent = x.message; go.disabled = false; go.textContent = mode === "create" ? "Create account" : "Log in";
        }
      } },
        h("label", { for: "acct-name" }, "Name"), name,
        h("label", { for: "acct-pin" }, mode === "create" ? "Choose a 4-digit PIN" : "PIN"), pin.el,
        mode === "create" ? h("label", { for: "acct-pin2" }, "The PIN again") : null, mode === "create" ? pin2.el : null,
        err, go);
      card.replaceChildren(
        h("div", { class: "acct-mark" }, "8.5"),
        h("h1", null, mode === "create" ? "Your account" : "Log in"),
        h("p", { class: "muted" }, mode === "create" ? "Your name and a 4-digit PIN. Log in with them on any phone or computer and your cards, tasks and mocks are there." : "The name and PIN you chose. Everything you did on your other devices comes with you."),
        form,
        h("button", { class: "btn quiet small acct-switch", type: "button", onclick: () => { name0 = name.value.trim(); mode = mode === "create" ? "login" : "create"; draw(); } }, mode === "create" ? "I already have an account" : "Create a new account"));
      setTimeout(() => (name.value ? pin.focus() : name.focus()), 60);
    };
    let name0 = "";
    draw();
  });
}
// four boxes for the PIN; typing moves on, Backspace moves back, a pasted PIN fills them all
function pinBox(id) {
  const boxes = [0, 1, 2, 3].map((i) => h("input", { type: "password", inputmode: "numeric", pattern: "[0-9]*", maxLength: 1, autocomplete: "off", id: i ? `${id}-${i}` : id, "aria-label": `PIN digit ${i + 1}`, class: "pin-d" }));
  boxes.forEach((b, i) => {
    b.addEventListener("input", () => { b.value = b.value.replace(/\D/g, "").slice(-1); if (b.value && boxes[i + 1]) boxes[i + 1].focus(); });
    b.addEventListener("keydown", (e) => { if (e.key === "Backspace" && !b.value && boxes[i - 1]) boxes[i - 1].focus(); });
    b.addEventListener("paste", (e) => { const d = (e.clipboardData?.getData("text") || "").replace(/\D/g, "").slice(0, 4); if (d.length > 1) { e.preventDefault(); d.split("").forEach((c, k) => { if (boxes[k]) boxes[k].value = c; }); boxes[Math.min(3, d.length - 1)].focus(); } });
  });
  return { el: h("div", { class: "pin" }, boxes), value: () => boxes.map((b) => b.value).join(""), focus: () => boxes[0].focus() };
}
