// App state in memory, backed by IndexedDB. Views read from here and call the functions below to change data.
import * as db from "./db.js";
import { todayISO, uid, addDays, diffDays, dowOf, lessonMoment } from "./util.js";
import { overall, writingBand, rawToBand, speakingBand } from "./bands.js";

export const S = {
  plan: null, config: null, bank: null,
  kv: {}, tasks: {}, errors: [], cards: [], scores: [], study: {}, pack: null,
};

const listeners = new Set();
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const changed = () => listeners.forEach((fn) => fn());

async function json(path) { const r = await fetch(path); if (!r.ok) throw new Error(path); return r.json(); }

export async function load() {
  await db.open();
  [S.plan, S.config, S.bank] = await Promise.all([json("data/plan.json"), json("data/config.json"), json("data/speaking-bank.json")]);
  const kv = await db.all("kv"); S.kv = Object.fromEntries(kv.map((r) => [r.key, r.value]));
  S.tasks = Object.fromEntries((await db.all("tasks")).map((t) => [t.key, t]));
  S.errors = await db.all("errors");
  S.cards = await db.all("cards");
  S.scores = await db.all("scores");
  S.study = Object.fromEntries((await db.all("study")).map((r) => [r.date, r]));
  const packRows = await db.all("pack");
  S.pack = packRows.find((r) => r.key === "pack")?.value || await tryBundledPack();
  if (!S.kv.seeded) await seed();
}

// A local-only build may ship the pack next to the app; the public build never does.
async function tryBundledPack() {
  const meta = document.querySelector('meta[name="eight-pack"]'); if (!meta) return null; // only the private build has this tag
  try { const r = await fetch(meta.content, { cache: "no-store" }); if (r.ok && (r.headers.get("content-type") || "").includes("json")) return await r.json(); } catch {}
  return null;
}

// ---------- settings ----------
export function setting(key) { return S.kv[key] ?? S.config.defaults[key]; }
export async function setSetting(key, value) { S.kv[key] = value; await db.put("kv", { key, value }); changed(); }

// ---------- first run: error log, cards, baseline scores ----------
async function seed() {
  const now = new Date().toISOString();
  for (const e of S.plan.errors) {
    const row = { id: e.id, source: e.source, wrote: e.wrote, correct: e.correct, pattern: e.pattern, status: "Open", seen: 1, firstSeen: null, lastSeen: null, fromPlan: true, successDates: [] };
    S.errors.push(row); await db.put("errors", row);
    const card = errorCard(row); S.cards.push(card); await db.put("cards", card);
  }
  for (const b of S.config.baseline) { const s = { id: "base-" + b.skill, ...b, baseline: true }; S.scores.push(s); await db.put("scores", s); }
  await setSetting("seeded", now);
}

export function errorCard(e) {
  const swap = e.pattern === "Template";
  return {
    id: "c-" + e.id, type: swap ? "swap" : "fix", errorId: e.id, tag: e.pattern.toLowerCase(),
    front: e.wrote, back: e.correct,
    prompt: swap ? "Say it plainly. What replaces this?" : e.pattern === "Task" ? "What should you do instead?" : "Correct it, from memory.",
    source: e.source, fsrs: null, introduced: null, suspended: false,
  };
}

// ---------- tasks ----------
export function taskState(key) { return S.tasks[key] || { key }; }
export async function setTask(key, patch) {
  const t = { ...taskState(key), ...patch, key };
  S.tasks[key] = t; await db.put("tasks", t); changed(); return t;
}
export const isDone = (key) => !!S.tasks[key]?.done;
export async function markDone(key, extra = {}) {
  const was = isDone(key);
  await setTask(key, { done: true, doneAt: new Date().toISOString(), skipped: false, ...extra });
  return !was;
}
export async function unmarkDone(key) { await setTask(key, { done: false, doneAt: null }); }

// the plan's days, plus tasks moved onto a day from earlier days
export function dayByDate(iso) { return S.plan.days.find((d) => d.date === iso); }
export function dayTasks(d) {
  const own = [...d.tasks, ...d.homework].map((t) => ({ ...t, date: d.date }));
  const moved = [];
  for (const day of S.plan.days) for (const t of [...day.tasks, ...day.homework]) {
    if (S.tasks[t.key]?.movedTo === d.date) moved.push({ ...t, date: day.date, movedFrom: day.date });
  }
  return [...own.filter((t) => !S.tasks[t.key]?.movedTo), ...moved];
}
export function lessonOf(d) { return d.lessonNo ? { key: d.lessonKey, no: d.lessonNo } : null; }

// all things that can be done on a day, in order, with their keys
export function dayItems(d) {
  const items = [];
  if (d.lessonNo) items.push({ key: d.lessonKey, block: "lesson", text: `Lesson ${d.lessonNo}: ${d.lessonTitle}`, minutes: setting("lessonMinutes"), date: d.date, lesson: true });
  items.push(...dayTasks(d));
  return items;
}
export function dayProgress(d) {
  const items = dayItems(d); const done = items.filter((t) => isDone(t.key)).length;
  return { done, total: items.length, minutesDone: items.filter((t) => isDone(t.key)).reduce((a, t) => a + (t.minutes || 0), 0) };
}

// Tasks from earlier days that are still open and not yet decided
export function missedTasks(today) {
  const out = [];
  for (const d of S.plan.days) {
    if (d.date >= today) break;
    if (d.type === "off") continue;
    for (const t of dayItems(d)) {
      if (t.lesson) continue; // a lesson is not "missed" in this sense
      const st = S.tasks[t.key];
      if (st?.done || st?.skipped || (st?.movedTo && st.movedTo >= today) || st?.acknowledged) continue;
      out.push({ ...t, date: d.date });
    }
  }
  return out;
}
export function nextStudyDay(from) {
  let d = addDays(from, 1);
  for (let i = 0; i < 8; i++, d = addDays(d, 1)) { const pd = dayByDate(d); if (pd && pd.type !== "off") return d; }
  return addDays(from, 1);
}

// ---------- minutes studied ----------
export async function addStudy(minutes, kind = "") {
  const date = todayISO(); const row = S.study[date] || { date, minutes: 0, byKind: {} };
  row.minutes += minutes; row.byKind[kind] = (row.byKind[kind] || 0) + minutes;
  S.study[date] = row; await db.put("study", row); changed();
}
// streak: days that weren't zero; Sundays do not break it; minimum days count
export function streak(today) {
  const doneDates = new Set(Object.values(S.tasks).filter((t) => t.done).map((t) => t.key.slice(0, 10)));
  const active = (iso) => (S.study[iso]?.minutes || 0) > 0 || doneDates.has(iso);
  let n = 0, d = today;
  if (!active(d)) d = addDays(d, -1); // today may not have started yet
  for (let i = 0; i < 400; i++, d = addDays(d, -1)) {
    if (dowOf(d) === 0) continue;          // Sunday: rest, neither adds nor breaks
    if (d < S.plan.start) break;
    if (active(d)) n++; else break;
  }
  return n;
}
export const minimumDay = (iso) => !!S.kv["min-" + iso];
export async function setMinimumDay(iso, on) { await setSetting("min-" + iso, on); }

// ---------- scores and estimates ----------
export async function addScore(s) {
  const row = { id: uid(), date: todayISO(), ...s }; S.scores.push(row); await db.put("scores", row); changed(); return row;
}
export async function removeScore(id) { S.scores = S.scores.filter((s) => s.id !== id); await db.del("scores", id); changed(); }
const latest = (skill) => S.scores.filter((s) => s.skill === skill).sort((a, b) => (a.date + (a.id || "")).localeCompare(b.date + (b.id || ""))).at(-1);
export function currentSkills() {
  const L = latest("listening"), R = latest("reading"), W1 = latest("writing1"), W2 = latest("writing2");
  const spk = latest("speaking");
  const bandOf = (s, table) => (s ? (s.band ?? (s.raw != null ? rawToBand(S.config.rawToBand[table], s.raw) : null)) : null);
  const listening = bandOf(L, "listening"), reading = bandOf(R, "reading");
  const writing = writingBand(W1?.band ?? null, W2?.band ?? null);
  const speaking = spk ? (spk.band ?? speakingBand(spk.criteria || [])) : null;
  return { listening, reading, writing, speaking, raw: { listening: L?.raw, reading: R?.raw } };
}
// the signature number: overall estimate, with speaking assumed equal to writing until it is scored
export function estimate() {
  const s = currentSkills(); let assumed = false, speaking = s.speaking;
  if (speaking == null) { speaking = s.writing ?? 6.5; assumed = true; }
  const v = [s.listening ?? 8.5, s.reading ?? 7.5, s.writing ?? 6.5, speaking];
  const o = overall(...v);
  return { overall: o, gap: Math.max(0, S.config.target - o), assumed, skills: { ...s, speaking } };
}

// ---------- error log ----------
export async function saveError(row) {
  const i = S.errors.findIndex((e) => e.id === row.id);
  if (i >= 0) S.errors[i] = row; else S.errors.push(row);
  await db.put("errors", row); changed();
}
const norm = (t) => t.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
// a repeat of a known mistake raises "times seen" instead of creating a duplicate
export async function logError({ source, wrote, correct, pattern }) {
  const hit = S.errors.find((e) => norm(e.wrote) === norm(wrote));
  const today = todayISO();
  if (hit) { hit.seen += 1; hit.lastSeen = today; if (hit.status === "Fixed") hit.status = "Open"; await saveError(hit); return { row: hit, repeat: true }; }
  const row = { id: "u" + uid(), source: source || "Practice", wrote, correct, pattern, status: "Open", seen: 1, firstSeen: today, lastSeen: today, successDates: [] };
  await saveError(row);
  const card = errorCard(row); S.cards.push(card); await db.put("cards", card);
  return { row, repeat: false };
}
export async function setErrorStatus(id, status) { const e = S.errors.find((x) => x.id === id); if (!e) return; e.status = status; await saveError(e); }
export function topRecurring(n = 10) { return [...S.errors].filter((e) => e.status !== "Fixed").sort((a, b) => b.seen - a.seen || a.id.localeCompare(b.id)).slice(0, n); }

// ---------- export / import of all her data ----------
const blobToB64 = (blob) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
const b64ToBlob = async (url) => (await fetch(url)).blob();

export async function exportAll() {
  const out = { app: "eight", version: 1, exportedAt: new Date().toISOString(), data: {} };
  for (const name of db.storeNames) {
    if (name === "pack") continue; // the course pack is not her data and stays separate
    const rows = await db.all(name);
    if (name === "recordings") for (const r of rows) if (r.blob) { r.blobData = await blobToB64(r.blob); delete r.blob; }
    if (name === "essays") for (const r of rows) if (r.imageBlob) { r.imageData = await blobToB64(r.imageBlob); delete r.imageBlob; }
    out.data[name] = rows;
  }
  return out;
}
export async function importAll(obj) {
  if (obj?.app !== "eight" || !obj.data) throw new Error("This file is not an Eight backup.");
  for (const [name, rows] of Object.entries(obj.data)) {
    if (!db.storeNames.includes(name) || name === "pack") continue;
    await db.clear(name);
    for (const r of rows) {
      if (name === "recordings" && r.blobData) { r.blob = await b64ToBlob(r.blobData); delete r.blobData; }
      if (name === "essays" && r.imageData) { r.imageBlob = await b64ToBlob(r.imageData); delete r.imageData; }
      await db.put(name, r);
    }
  }
  await load(); changed();
}
export async function resetAll() {
  for (const name of db.storeNames) if (name !== "pack") await db.clear(name);
  S.kv = {}; S.tasks = {}; S.errors = []; S.cards = []; S.scores = []; S.study = {};
  await seed(); changed();
}
export async function savePack(pack) { S.pack = pack; await db.put("pack", { key: "pack", value: pack }); changed(); }
export async function removePack() { S.pack = null; await db.del("pack", "pack"); changed(); }

// ---------- lessons ----------
export function lessonDays() { return S.plan.days.filter((d) => d.lessonNo); }
export function lessonStart(d) { return lessonMoment(d.date, setting("lessonTime")); }
export function nextLesson(now = new Date()) {
  const mins = Number(setting("lessonMinutes")) || 90;
  return lessonDays().find((d) => lessonStart(d).getTime() + mins * 60000 > now.getTime()) || null;
}
