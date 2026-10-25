// The feed: homework, class settings, teacher decks, mocks and the teacher's mock estimates, fetched from the public feed,
// cached on the device. Her progress per homework step, and the sending of her work to the teacher through the relay.
import * as db from "./db.js";
import * as store from "./store.js";
import { decryptJson } from "./crypto.js";
import { todayISO, uid, addDays } from "./util.js";
import { RAW, RELAY, FEED_KEY } from "./feedkey.js";
export { RAW, RELAY };

// in memory: { config, hw: { date: homework | null }, decks: index, mocks: index, results: { mockId: estimate } }
export const F = { config: null, hw: {}, decks: [], mocks: [], results: {}, status: "idle", checkedAt: 0 };
const SECTION_NAMES = ["listening", "reading", "writing", "speaking"];
let inflight = null;

export async function init() {
  const row = await db.get("feed", "feed");
  if (row?.value) { F.config = row.value.config || null; F.hw = row.value.hw || {}; F.decks = row.value.decks || []; F.mocks = row.value.mocks || []; F.results = row.value.results || {}; }
  window.addEventListener("online", () => { flushOutbox(); refresh(todayISO(), { force: true }); });
  flushOutbox();
}
const persist = () => db.put("feed", { key: "feed", value: { config: F.config, hw: F.hw, decks: F.decks, mocks: F.mocks, results: F.results } });

export async function fetchEnc(path, { timeout = 12000 } = {}) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(`${RAW}/${path}?t=${Math.floor(Date.now() / 60000)}`, { cache: "no-store", signal: ctl.signal });
    if (r.status === 404) return { missing: true };
    if (!r.ok) throw new Error("feed " + r.status);
    return { json: await r.json() };
  } finally { clearTimeout(t); }
}
export async function fetchDec(path, opts) { const r = await fetchEnc(path, opts); return r.missing ? null : decryptJson(r.json, FEED_KEY); }

// look for today's (and yesterday's) homework, the class settings, the decks and the mocks; keeps what it had when offline
export function refresh(date = todayISO(), { force = false, timeout } = {}) {
  if (inflight) return inflight;
  if (!force && Date.now() - F.checkedAt < 20000) return Promise.resolve();
  F.checkedAt = Date.now();
  inflight = (async () => {
    let changed = false;
    const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
    try {
      for (const d of [date, addDays(date, -1)]) {
        const v = await fetchDec(`hw/${d}.json`, { timeout });
        if (!same(F.hw[d], v)) { F.hw[d] = v; changed = true; }
      }
      const cv = await fetchDec("config.json", { timeout });
      if (!same(F.config, cv)) { F.config = cv; changed = true; await store.setSetting("classConfig", cv ? { lessonDays: cv.lessonDays, lessonTime: cv.lessonTime, lessonLink: cv.lessonLink } : null); }
      const decks = (await fetchDec("decks/index.json", { timeout })) || [];
      if (!same(F.decks, decks)) { F.decks = decks; changed = true; }
      for (const d of decks) if (!store.deckById(d.id) && !store.S.kv["deck-removed-" + d.id]) {
        const full = await fetchDec(`decks/${d.id}.json`, { timeout });
        if (full?.cards?.length) await store.addTeacherDeck({ id: d.id, name: full.name || d.name, note: full.note || "", kind: "teacher", cards: full.cards.map((c, i) => ({ id: `${d.id}-${c.id || i}`, front: c.front, back: c.back, example: c.example || "" })) });
      }
      const mocks = (await fetchDec("mocks/index.json", { timeout })) || [];
      try { for (const k of Object.keys(localStorage)) if (k.startsWith("eight-mock-")) { const m = JSON.parse(localStorage.getItem(k)); if (m?.id && !mocks.some((x) => x.id === m.id)) mocks.push({ id: m.id, title: m.title, date: m.date, sections: SECTION_NAMES.filter((s) => m[s]), local: true }); } } catch {}   // test mocks on this device
      if (!same(F.mocks, mocks)) { F.mocks = mocks; changed = true; }
      for (const m of mocks) if (store.mockRow(m.id)?.finishedAt || store.S.mocks.some((r) => r.mock === m.id)) {
        const est = await fetchDec(`results/${m.id}.json`, { timeout });
        if (!same(F.results[m.id], est)) { F.results[m.id] = est; changed = true; }
      }
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
export const studentId = () => (studentName() || "student").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "student";

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
export function currentStep(date, hw) {
  for (const t of hw?.tasks || []) for (const s of t.steps || []) if (!stepDone(date, s.id)) return { task: t, step: s };
  return null;
}
export async function noteCompletion(date, hw) {
  const p = dayProgress(date, hw), row = stateOf(date);
  await patchState(date, { progress: { done: p.stepsDone, total: p.steps }, snap: { lesson: hw.lesson?.title || "", tasks: (hw.tasks || []).map((t) => ({ title: t.title, steps: (t.steps || []).map((s) => ({ id: s.id, title: s.title || s.type, type: s.type })) })) } });
  if (p.complete && !row.completedAt) { await patchState(date, { completedAt: new Date().toISOString() }); report(); return true; }
  return false;
}
// the days with homework, newest first
export function homeworkDays() { return Object.entries(F.hw).filter(([, v]) => v).map(([d]) => d).sort().reverse(); }

// ---------- homework decks (the "new words" steps) ----------
export async function addWords(date, step, task) {
  await store.addTeacherDeck({ id: `hw-${date}-${step.id}`, name: step.deck || `${task.title}: ${step.title}`, kind: "teacher", note: "From your homework, " + date, cards: (step.cards || []).map((c, i) => ({ id: `hw-${date}-${step.id}-${i}`, front: c.front || c.term, back: (c.back || c.meaning || "").split("\nExample:")[0].trim(), example: (c.back || "").split("\nExample:")[1]?.trim() || c.example || "" })) });
}

// ---------- the relay: her files and short lines reach the teacher; small reports let Teacher mode see how she is doing ----------
const toB64 = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] || ""); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
export async function relay(body, { timeout = 60000 } = {}) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(RELAY, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctl.signal });
    const j = await r.json().catch(() => ({})); if (!j.ok) throw new Error(j.error || "relay " + r.status); return j;
  } finally { clearTimeout(t); }
}
async function sendOne(item) { await relay({ op: "upload", name: item.name, type: item.blob.type || "application/octet-stream", caption: item.caption, data: await toB64(item.blob) }); }

export async function sendFiles({ date, label, files, note = "" }) {
  if (String(date).startsWith("preview")) return "sent";
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
  try { for (const item of await db.all("outbox")) { try { await sendOne(item); await db.del("outbox", item.id); n++; } catch { break; } } }
  finally { flushing = false; }
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

// a small picture of her work for Teacher mode: Anki, mocks, homework, check-ins. Sent quietly, at most once a minute.
let reportTimer = 0;
export function report() {
  clearTimeout(reportTimer);
  reportTimer = setTimeout(async () => {
    try {
      const srs = await import("./srs.js"), pulse = await import("./pulse.js");
      const now = new Date(), cards = store.S.cards;
      const byDay = await srs.reviewsByDay(14);
      const hb = await pulse.habits(14);
      const snapshot = {
        student: nameOf(), at: now.toISOString(),
        habits: { usualHour: hb.usualHour, activeDays7: hb.activeDays7, lateDays7: hb.lateDays7, lateDays14: hb.lateDays14, hwDone14: hb.hwDone, hwLate14: hb.hwLate.length, hwNight14: hb.hwNight, lastActive: hb.lastActive },
        anki: { decks: store.S.decks.map((d) => ({ name: d.name, kind: d.kind, ...srs.deckStats(d.id) })), cards: cards.length, due: cards.filter((c) => c.fsrs && new Date(c.fsrs.due) <= now && !c.suspended).length, reviews14: Object.values(byDay).reduce((a, b) => a + b, 0), days14: Object.keys(byDay).length, lastReview: Object.keys(byDay).sort().pop() || null },
        mocks: store.S.mocks.filter((m) => m.finishedAt).map((m) => ({ mock: m.mock, section: m.section, finishedAt: m.finishedAt, raw: m.raw ?? null, band: m.band ?? null, words: m.words ?? null, leaves: m.leaves ?? 0 })),
        homework: Object.values(store.S.hw).filter((r) => r.progress).map((r) => ({ date: r.date, done: r.progress.done, total: r.progress.total, completedAt: r.completedAt || null })).sort((a, b) => a.date.localeCompare(b.date)).slice(-14),
        checkins: store.S.checkins.slice(-12).map((c) => ({ at: c.at, prompt: c.prompt, answer: c.answer })),
        streak: store.streak(),
      };
      await relay({ op: "report", id: studentId(), data: snapshot }, { timeout: 15000 });
    } catch {}
  }, 1500);
}
