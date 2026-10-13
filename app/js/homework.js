// Teacher-set homework: fetched (encrypted) from the class feed, cached on the device, with her progress per step,
// and the sending of her work to the teacher's Telegram.
import * as db from "./db.js";
import * as store from "./store.js";
import { decryptJson } from "./crypto.js";
import { todayISO, uid, addDays } from "./util.js";

// the feed has its own repository, so the key that publishes to it can never touch the app itself
export const OWNER = "iamdexterdude", REPO = "8.5-feed", BRANCH = "main";
export const RAW = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}`;

// in memory: { config, hw: { date: homework | null } }
export const F = { config: null, hw: {}, status: "idle", checkedAt: 0 };

export const classCode = () => store.S.kv.classCode || "";
export async function setClassCode(code) {
  await store.setSetting("classCode", (code || "").trim());
  F.hw = {}; F.config = null; F.status = "idle";
  await refresh(todayISO(), { force: true });
}

export async function init() {
  const row = await db.get("feed", "feed");
  if (row?.value) { F.config = row.value.config || null; F.hw = row.value.hw || {}; }
  window.addEventListener("online", () => { flushOutbox(); refresh(todayISO(), { force: true }); });
  flushOutbox();
}
const persist = () => db.put("feed", { key: "feed", value: { config: F.config, hw: F.hw } });

async function fetchEnc(path) {
  const r = await fetch(`${RAW}/${path}?t=${Math.floor(Date.now() / 60000)}`, { cache: "no-store" });
  if (r.status === 404) return { missing: true };
  if (!r.ok) throw new Error("feed " + r.status);
  return { json: await r.json() };
}

// look for today's (and yesterday's) homework and the class settings; keeps what it had when offline
export async function refresh(date = todayISO(), { force = false } = {}) {
  const code = classCode();
  if (!code) { F.status = "nocode"; return; }
  if (!force && Date.now() - F.checkedAt < 20000) return;
  F.checkedAt = Date.now();
  let changed = false;
  try {
    for (const d of [date, addDays(date, -1)]) {
      const r = await fetchEnc(`hw/${d}.json`);
      const v = r.missing ? null : await decryptJson(r.json, code);
      if (JSON.stringify(F.hw[d] ?? null) !== JSON.stringify(v)) { F.hw[d] = v; changed = true; }
    }
    const c = await fetchEnc("config.json");
    const cv = c.missing ? null : await decryptJson(c.json, code);
    if (JSON.stringify(F.config) !== JSON.stringify(cv)) { F.config = cv; changed = true; }
    F.status = "ok";
  } catch (e) {
    F.status = /OperationError|decrypt/i.test(String(e?.name) + String(e?.message)) ? "badcode" : "offline";
  }
  if (changed) { await persist(); store.changed(); }
}

export const homeworkFor = (date) => F.hw[date] || null;

// ---------- her progress through the homework ----------
export function stateOf(date) { return store.S.hw[date] || { date, steps: {} }; }
export async function setStep(date, stepId, patch) {
  const row = stateOf(date); row.steps = { ...row.steps, [stepId]: { ...(row.steps[stepId] || {}), ...patch } };
  store.S.hw[date] = row; await db.put("hw", row); store.changed(); return row;
}
export async function patchState(date, patch) { const row = { ...stateOf(date), ...patch }; store.S.hw[date] = row; await db.put("hw", row); return row; }
export const stepDone = (date, id) => !!stateOf(date).steps[id]?.done;
export function taskProgress(date, task) { const n = task.steps.length, d = task.steps.filter((s) => stepDone(date, s.id)).length; return { done: d, total: n, complete: n > 0 && d === n }; }
export function dayProgress(date, hw) {
  const ts = (hw?.tasks || []).map((t) => taskProgress(date, t));
  return { tasksDone: ts.filter((t) => t.complete).length, tasks: ts.length, stepsDone: ts.reduce((a, t) => a + t.done, 0), steps: ts.reduce((a, t) => a + t.total, 0), complete: ts.length > 0 && ts.every((t) => t.complete) };
}
// the first step still to do, across the day's tasks
export function currentStep(date, hw) {
  for (const t of hw?.tasks || []) for (const s of t.steps) if (!stepDone(date, s.id)) return { task: t, step: s };
  return null;
}
// the moment the last step was finished (for the finish screen)
export async function noteCompletion(date, hw) {
  const p = dayProgress(date, hw), row = stateOf(date);
  await patchState(date, { progress: { done: p.stepsDone, total: p.steps }, snap: { lesson: hw.lesson?.title || "", tasks: hw.tasks.map((t) => ({ title: t.title, steps: t.steps.map((s) => ({ id: s.id, title: s.title || s.type, type: s.type })) })) } });
  if (p.complete && !row.completedAt) { await patchState(date, { completedAt: new Date().toISOString() }); return true; }
  return false;
}

// ---------- homework decks (the "new words" steps) ----------
export async function addWords(date, step, task) {
  await store.addHomeworkDeck({ id: `hw-${date}-${step.id}`, name: step.deck || `${task.title}: ${step.title}`, date, cards: (step.cards || []).map((c, i) => ({ id: `hw-${date}-${step.id}-${i}`, front: c.front || c.term, back: c.back || [c.meaning, c.example ? "Example: " + c.example : ""].filter(Boolean).join("\n"), prompt: step.prompt || "Say it aloud, then use it in a sentence of your own." })) });
}

// ---------- sending to the teacher (Telegram bot), with a queue for when there is no connection ----------
const botOf = () => F.config?.bot && F.config.bot.token && F.config.bot.chat ? F.config.bot : null;
async function tg(method, form) {
  const bot = botOf(); if (!bot) throw new Error("no bot");
  const r = await fetch(`https://api.telegram.org/bot${bot.token}/${method}`, { method: "POST", body: form });
  const j = await r.json().catch(() => ({})); if (!j.ok) throw new Error(j.description || "telegram " + r.status); return j;
}
const nameOf = () => store.setting("name") || "Student";

export async function sendFiles({ date, label, files, note = "" }) {
  if (String(date).startsWith("preview")) return "sent";       // the teacher's preview never sends anything
  const results = [];
  for (const f of files) {
    const caption = `${nameOf()} | ${date} | ${label}${note ? "\n" + note : ""}`.slice(0, 1000);
    const item = { id: uid(), date, label, name: f.name, blob: f.blob, caption, createdAt: new Date().toISOString() };
    try {
      if (!botOf()) throw new Error("not set up");
      const fd = new FormData(); fd.append("chat_id", botOf().chat); fd.append("caption", caption); fd.append("document", f.blob, f.name);
      await tg("sendDocument", fd); results.push("sent");
    } catch (e) { await db.put("outbox", item); results.push("queued"); }
  }
  store.changed();
  return results.every((r) => r === "sent") ? "sent" : "queued";
}
export async function sendText(text) {
  try { const fd = new FormData(); fd.append("chat_id", botOf().chat); fd.append("text", text); await tg("sendMessage", fd); return "sent"; } catch { return "failed"; }
}
export async function flushOutbox() {
  if (!botOf() || !navigator.onLine) return 0;
  let n = 0;
  for (const item of await db.all("outbox")) {
    try { const fd = new FormData(); fd.append("chat_id", botOf().chat); fd.append("caption", item.caption); fd.append("document", item.blob, item.name); await tg("sendDocument", fd); await db.del("outbox", item.id); n++; } catch { break; }
  }
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
