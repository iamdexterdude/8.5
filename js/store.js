// App state in memory, backed by IndexedDB. Views read from here and call the functions below to change data.
import * as db from "./db.js";
import { todayISO, uid, addDays, dowOf, lessonMoment } from "./util.js";

export const S = {
  config: null,
  kv: {}, cards: [], decks: [], hw: {}, mocks: [], checkins: [],
  busy: 0,
};

const listeners = new Set();
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const changed = () => listeners.forEach((fn) => fn());

async function json(path) { const r = await fetch(path); if (!r.ok) throw new Error(path); return r.json(); }

export async function load() {
  await db.open();
  S.config = await json("data/config.json");
  const kv = await db.all("kv"); S.kv = Object.fromEntries(kv.map((r) => [r.key, r.value]));
  await migrate();
  S.cards = await db.all("cards");
  S.decks = (await db.all("decks")).sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
  S.hw = Object.fromEntries((await db.all("hw")).map((r) => [r.date, r]));
  S.mocks = (await db.all("mocks")).sort((a, b) => (a.startedAt || "").localeCompare(b.startedAt || ""));
  S.checkins = await db.all("checkins");
}

// The layout of 25 October 2026 starts Anki from zero: the seeded error-log cards and the course decks go.
async function migrate() {
  if (S.kv["layout-2"]) return;
  for (const name of ["cards", "reviewlog", "errors", "tasks", "scores", "reading", "study", "pack"]) await db.clear(name);
  for (const k of Object.keys(S.kv)) if (/^(hwDecks|min-|rej-|after-|seeded)/.test(k)) await db.del("kv", k);
  S.kv = Object.fromEntries((await db.all("kv")).map((r) => [r.key, r.value]));
  await setSetting("layout-2", new Date().toISOString());
}

// ---------- settings ----------
export function setting(key) { return S.kv[key] ?? S.config.defaults[key]; }
export async function setSetting(key, value) { S.kv[key] = value; await db.put("kv", { key, value }); changed(); }

// ---------- lessons: from the class settings (days of the week and a time), with the homework's own lesson on top ----------
export function lessonDays() { return (S.kv.classConfig?.lessonDays || S.config.defaults.lessonDays || [1, 3, 5]).map(Number); }
export function lessonTime() { return S.kv.classConfig?.lessonTime || setting("lessonTime"); }
export function lessonLink() { return S.kv.classConfig?.lessonLink || setting("meetingLink") || ""; }
export const isLessonDay = (iso) => lessonDays().includes(dowOf(iso) === 0 ? 7 : dowOf(iso));
export function lessonStart(iso) { return lessonMoment(iso, lessonTime()); }
// the next lesson from now: today's if it has not ended, else the next lesson day
export function nextLesson(now = new Date()) {
  const mins = Number(setting("lessonMinutes")) || 90; let d = todayISO();
  for (let i = 0; i < 14; i++, d = addDays(d, 1)) if (isLessonDay(d) && lessonStart(d).getTime() + mins * 60000 > now.getTime()) return { date: d, start: lessonStart(d) };
  return null;
}
export function lessonState(now = new Date()) {
  const t = todayISO(); if (!isLessonDay(t)) return { phase: "none" };
  const start = lessonStart(t), mins = Number(setting("lessonMinutes")) || 90, ms = start - now;
  if (ms > 3 * 3600000) return { phase: "day", start, ms };
  if (ms > 0) return { phase: "soon", start, ms };
  if (ms > -mins * 60000) return { phase: "during", start, ms };
  return { phase: "after", start, ms };
}

// ---------- decks (Anki) ----------
export function deckById(id) { return S.decks.find((d) => d.id === id) || null; }
export async function saveDeck(deck) {
  const i = S.decks.findIndex((d) => d.id === deck.id);
  if (i >= 0) S.decks[i] = deck; else S.decks.push(deck);
  await db.put("decks", deck); changed(); return deck;
}
export async function addDeck({ name, kind = "mine", note = "", id = null, cards = [] }) {
  const deck = { id: id || "d-" + uid(), name, kind, note, createdAt: new Date().toISOString() };
  await saveDeck(deck);
  for (const c of cards) await addCard({ ...c, deck: deck.id });
  return deck;
}
export async function removeDeck(id) {
  S.decks = S.decks.filter((d) => d.id !== id); await db.del("decks", id);
  for (const c of S.cards.filter((c) => c.deck === id)) await db.del("cards", c.id);
  S.cards = S.cards.filter((c) => c.deck !== id); changed();
}
export async function addCard({ deck, front, back, example = "", id = null, tag = "" }) {
  const card = { id: id || "c-" + uid(), deck, type: "basic", tag, front, back, example, fsrs: null, introduced: null, suspended: false, createdAt: new Date().toISOString() };
  S.cards.push(card); await db.put("cards", card); return card;
}
export async function saveCard(card) { const i = S.cards.findIndex((c) => c.id === card.id); if (i >= 0) S.cards[i] = card; else S.cards.push(card); await db.put("cards", card); changed(); }
export async function removeCard(id) { S.cards = S.cards.filter((c) => c.id !== id); await db.del("cards", id); changed(); }
// a deck set by the teacher (from the feed, or from a homework "new words" step): its cards join at once, nothing is lost on a second visit
export async function addTeacherDeck({ id, name, note = "", kind = "teacher", cards }) {
  if (!deckById(id)) await saveDeck({ id, name, kind, note, createdAt: new Date().toISOString() });
  const have = new Set(S.cards.map((c) => c.id)); let n = 0;
  for (const c of cards) { if (have.has(c.id)) continue; await addCard({ ...c, deck: id }); n++; }
  if (n) changed(); return n;
}

// ---------- mocks (results live on the device; the teacher's estimates arrive from the feed) ----------
export async function saveMock(row) { const i = S.mocks.findIndex((m) => m.id === row.id); if (i >= 0) S.mocks[i] = row; else S.mocks.push(row); await db.put("mocks", row); changed(); return row; }
export const mockRow = (id) => S.mocks.find((m) => m.id === id) || null;

// ---------- check-ins on Today ----------
export async function saveCheckin(row) { S.checkins.push(row); await db.put("checkins", row); changed(); }

// ---------- streak: days with any homework step done or a mock finished or a review; Sundays neither add nor break ----------
export function activeDates() {
  const s = new Set();
  for (const r of Object.values(S.hw)) if (Object.values(r.steps || {}).some((x) => x.done)) s.add(r.date);
  for (const m of S.mocks) if (m.finishedAt) s.add(m.finishedAt.slice(0, 10));
  for (const c of S.cards) if (c.fsrs?.last_review) s.add(String(c.fsrs.last_review).slice(0, 10));
  return s;
}
export function streak(today = todayISO()) {
  const act = activeDates(); let n = 0, d = today;
  if (!act.has(d)) d = addDays(d, -1);
  for (let i = 0; i < 400; i++, d = addDays(d, -1)) { if (dowOf(d) === 0) continue; if (act.has(d)) n++; else break; }
  return n;
}

// ---------- export / import of all her data ----------
const blobToB64 = (blob) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
const b64ToBlob = async (url) => (await fetch(url)).blob();
export async function exportAll() {
  const out = { app: "eight", version: 2, exportedAt: new Date().toISOString(), data: {} };
  for (const name of db.storeNames) {
    if (["pack", "feed", "outbox"].includes(name)) continue;
    const rows = await db.all(name);
    if (name === "mocks") for (const r of rows) for (const rec of r.recordings || []) if (rec.blob) { rec.blobData = await blobToB64(rec.blob); delete rec.blob; }
    out.data[name] = rows;
  }
  return out;
}
export async function importAll(obj) {
  if (obj?.app !== "eight" || !obj.data) throw new Error("This file is not an 8.5 backup.");
  for (const [name, rows] of Object.entries(obj.data)) {
    if (!db.storeNames.includes(name) || ["pack", "feed", "outbox"].includes(name)) continue;
    await db.clear(name);
    for (const r of rows) {
      if (name === "mocks") for (const rec of r.recordings || []) if (rec.blobData) { rec.blob = await b64ToBlob(rec.blobData); delete rec.blobData; }
      await db.put(name, r);
    }
  }
  await load(); changed();
}
export async function resetAll() {
  for (const name of db.storeNames) await db.clear(name);
  S.kv = {}; S.cards = []; S.decks = []; S.hw = {}; S.mocks = []; S.checkins = [];
  await setSetting("layout-2", new Date().toISOString()); changed();
}
