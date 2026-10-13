// Teacher-set homework: fetched from the feed, cached on the device, with her progress per step,
// and the sending of her work to the teacher (through the relay, which carries it to his Telegram).
import * as db from "./db.js";
import * as store from "./store.js";
import { decryptJson } from "./crypto.js";
import { todayISO, uid, addDays } from "./util.js";
import { RAW, RELAY, FEED_KEY } from "./feedkey.js";
export { RAW, RELAY };

// in memory: { config, hw: { date: homework | null } }
export const F = { config: null, hw: {}, status: "idle", checkedAt: 0 };
let inflight = null;

export async function init() {
  const row = await db.get("feed", "feed");
  if (row?.value) { F.config = row.value.config || null; F.hw = row.value.hw || {}; }
  window.addEventListener("online", () => { flushOutbox(); refresh(todayISO(), { force: true }); });
  flushOutbox();
}
const persist = () => db.put("feed", { key: "feed", value: { config: F.config, hw: F.hw } });

async function fetchEnc(path, { timeout = 12000 } = {}) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(`${RAW}/${path}?t=${Math.floor(Date.now() / 60000)}`, { cache: "no-store", signal: ctl.signal });
    if (r.status === 404) return { missing: true };
    if (!r.ok) throw new Error("feed " + r.status);
    return { json: await r.json() };
  } finally { clearTimeout(t); }
}

// look for today's (and yesterday's) homework and the class settings; keeps what it had when offline
export function refresh(date = todayISO(), { force = false, timeout } = {}) {
  if (inflight) return inflight;
  if (!force && Date.now() - F.checkedAt < 20000) return Promise.resolve();
  F.checkedAt = Date.now();
  inflight = (async () => {
    let changed = false;
    try {
      for (const d of [date, addDays(date, -1)]) {
        const r = await fetchEnc(`hw/${d}.json`, { timeout });
        const v = r.missing ? null : await decryptJson(r.json, FEED_KEY);
        if (JSON.stringify(F.hw[d] ?? null) !== JSON.stringify(v)) { F.hw[d] = v; changed = true; }
      }
      const c = await fetchEnc("config.json", { timeout });
      const cv = c.missing ? null : await decryptJson(c.json, FEED_KEY);
      if (JSON.stringify(F.config) !== JSON.stringify(cv)) { F.config = cv; changed = true; }
      F.status = "ok";
    } catch (e) {
      F.status = /OperationError|decrypt/i.test(String(e?.name) + String(e?.message)) ? "badkey" : "offline";
    } finally { inflight = null; }
    if (changed) { await persist(); store.changed(); }
  })();
  return inflight;
}

export const homeworkFor = (date) => F.hw[date] || null;
export const studentName = () => store.setting("name") || F.config?.student || "";
const nameOf = () => studentName() || "Student";

// ---------- her progress through the homework ----------
export function stateOf(date) { return store.S.hw[date] || { date, steps: {} }; }
export async function setStep(date, stepId, patch) {
  const row = stateOf(date); row.steps = { ...row.steps, [stepId]: { ...(row.steps[stepId] || {}), ...patch } };
  store.S.hw[date] = row; await db.put("hw", row); store.changed(); return row;
}
export async function patchState(date, patch) { const row = { ...stateOf(date), ...patch }; store.S.hw[date] = row; await db.put("hw", row); return row; }
export const stepDone = (date, id) => !!stateOf(date).steps[id]?.done;
export function taskProgress(date, task) { const steps = task.steps || [], n = steps.length, d = steps.filter((s) => stepDone(date, s.id)).length; return { done: d, total: n, complete: n > 0 && d === n }; }
export function dayProgress(date, hw) {
  const ts = (hw?.tasks || []).map((t) => taskProgress(date, t));
  return { tasksDone: ts.filter((t) => t.complete).length, tasks: ts.length, stepsDone: ts.reduce((a, t) => a + t.done, 0), steps: ts.reduce((a, t) => a + t.total, 0), complete: ts.length > 0 && ts.every((t) => t.complete) };
}
// the first step still to do, across the day's tasks
export function currentStep(date, hw) {
  for (const t of hw?.tasks || []) for (const s of t.steps || []) if (!stepDone(date, s.id)) return { task: t, step: s };
  return null;
}
// the moment the last step was finished (for the finish screen)
export async function noteCompletion(date, hw) {
  const p = dayProgress(date, hw), row = stateOf(date);
  await patchState(date, { progress: { done: p.stepsDone, total: p.steps }, snap: { lesson: hw.lesson?.title || "", tasks: (hw.tasks || []).map((t) => ({ title: t.title, steps: (t.steps || []).map((s) => ({ id: s.id, title: s.title || s.type, type: s.type })) })) } });
  if (p.complete && !row.completedAt) { await patchState(date, { completedAt: new Date().toISOString() }); return true; }
  return false;
}

// ---------- homework decks (the "new words" steps) ----------
export async function addWords(date, step, task) {
  await store.addHomeworkDeck({ id: `hw-${date}-${step.id}`, name: step.deck || `${task.title}: ${step.title}`, date, cards: (step.cards || []).map((c, i) => ({ id: `hw-${date}-${step.id}-${i}`, front: c.front || c.term, back: c.back || [c.meaning, c.example ? "Example: " + c.example : ""].filter(Boolean).join("\n"), prompt: step.prompt || "Say it aloud, then use it in a sentence of your own." })) });
}

// ---------- sending to the teacher through the relay, with a queue for when there is no connection ----------
const toB64 = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] || ""); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
async function relay(body, { timeout = 60000 } = {}) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(RELAY, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctl.signal });
    const j = await r.json().catch(() => ({})); if (!j.ok) throw new Error(j.error || "relay " + r.status); return j;
  } finally { clearTimeout(t); }
}
async function sendOne(item) { await relay({ op: "upload", name: item.name, type: item.blob.type || "application/octet-stream", caption: item.caption, data: await toB64(item.blob) }); }

export async function sendFiles({ date, label, files, note = "" }) {
  if (String(date).startsWith("preview")) return "sent";       // the teacher's preview never sends anything
  const results = [];
  for (const f of files) {
    const caption = `${nameOf()} | ${date} | ${label}${note ? "\n" + note : ""}`.slice(0, 1000);
    const item = { id: uid(), date, label, name: f.name, blob: f.blob, caption, createdAt: new Date().toISOString() };
    try { await sendOne(item); results.push("sent"); }
    catch (e) { await db.put("outbox", item); results.push("queued"); }
  }
  store.changed();
  return results.every((r) => r === "sent") ? "sent" : "queued";
}
export async function sendText(text) {
  try { await relay({ op: "notify", text }, { timeout: 15000 }); return "sent"; } catch { return "failed"; }
}
let flushing = false;
export async function flushOutbox() {
  if (flushing || !navigator.onLine) return 0;
  flushing = true; let n = 0;
  try {
    for (const item of await db.all("outbox")) {
      try { await sendOne(item); await db.del("outbox", item.id); n++; } catch { break; }
    }
  } finally { flushing = false; }
  if (n) store.changed();
  return n;
}
export const queued = async () => (await db.all("outbox")).length;

export async function askForHomework(date) {
  const row = stateOf(date);
  if (row.asked) return "already";
  const r = await sendText(`${nameOf()} is asking for the homework (${date}).`);
  await patchState(date, { asked: new Date().toISOString(), askedSent: r === "sent" });
  store.changed();
  return r;
}
