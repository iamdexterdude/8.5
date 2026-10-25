// The day's culture: a song (a film on Sundays) and a word, each pointing back at English. Chosen by the date, so the
// same day shows the same things wherever she opens it, and nothing comes round again for weeks. What she keeps goes
// into Anki; what she writes goes to the teacher.
import * as store from "./store.js";
import * as hw from "./homework.js";
import { todayISO, diffDays, dowOf } from "./util.js";

let data = null;
export async function load() {
  if (data) return data;
  const r = await fetch("data/daily.json"); data = await r.json(); return data;
}
const EPOCH = "2026-10-20";
const at = (list, n) => list[((n % list.length) + list.length) % list.length];

export async function forDay(date = todayISO()) {
  const d = await load(), n = diffDays(EPOCH, date), sunday = dowOf(date) === 0;
  const word = at(d.words, n);
  const film = sunday ? at(d.films, Math.floor(n / 7)) : null;
  let song = null;
  if (!film) {
    const mine = (hw.F.config?.music || []).filter((t) => t && (t.title || t.url));   // the teacher's own list takes every fourth day
    if (mine.length && n % 4 === 3) { const t = at(mine, Math.floor(n / 4)); song = { title: t.title || "A track from your teacher", artist: t.artist || "", year: t.year || "", url: t.url || "", teacher: true, why: "From your teacher's own list.", ask: "Catch one line you could sing back, and keep it below." }; }
    else song = at(d.songs, n);
  }
  return { date, word, song, film };
}

// ---------- links: nothing is embedded, nothing is stored; she opens the song or the film where it lives ----------
const q = (s) => encodeURIComponent(s);
export const listenLink = (s) => s.url || `https://www.youtube.com/results?search_query=${q(`${s.artist} ${s.title}`)}`;
export const lyricsLink = (s) => `https://www.google.com/search?q=${q(`${s.title} ${s.artist} lyrics`)}`;
export const trailerLink = (f) => `https://www.youtube.com/results?search_query=${q(`${f.title} ${f.year} trailer`)}`;
export const watchLink = (f) => `https://www.google.com/search?q=${q(`${f.title} ${f.year} film where to watch`)}`;

// ---------- what she did with today's pieces (kept for ten days) ----------
const KEY = "daily";
export const state = (date = todayISO()) => (store.S.kv[KEY] || {})[date] || {};
export async function mark(kind, value, date = todayISO()) {
  const all = { ...(store.S.kv[KEY] || {}) };
  all[date] = { ...(all[date] || {}), [kind]: value };
  for (const k of Object.keys(all).sort().slice(0, -10)) delete all[k];
  await store.setSetting(KEY, all);
}

// ---------- into Anki ----------
async function deckFor(id, name, note) {
  return store.deckById(id) || store.addDeck({ id, name, kind: "mine", note });
}
async function addOnce(deck, { front, back, example = "" }) {
  const have = store.S.cards.find((c) => c.deck === deck.id && c.front.trim().toLowerCase() === front.trim().toLowerCase());
  if (have) return have;
  return store.addCard({ deck: deck.id, front, back, example });
}
export async function keepWord(w) {
  const deck = await deckFor("daily-words", "Word of the day", "One word a day from Today. Use each one in a sentence within the week.");
  return addOnce(deck, { front: w.w, back: `${w.pos}: ${w.m}`, example: w.ex });
}
export async function keepPhrase(p, source) {
  const deck = await deckFor("daily-culture", "From songs and films", "Lines and phrases you kept from the songs and films on Today.");
  return addOnce(deck, { front: p.p, back: p.m, example: source ? `From ${source}` : "" });
}
export async function keepLine(line, source) {
  const deck = await deckFor("daily-culture", "From songs and films", "Lines and phrases you kept from the songs and films on Today.");
  return addOnce(deck, { front: line.trim(), back: `A line from ${source}. Say it, then use it in a sentence of your own.` });
}

// ---------- to the teacher: what she wrote about the word, the song, the film ----------
export async function tell(kind, prompt, text) {
  const row = { id: "ci-" + Date.now().toString(36), date: todayISO(), at: new Date().toISOString(), key: "daily-" + kind, prompt, answer: String(text).trim().slice(0, 400), slot: "" };
  await store.saveCheckin(row);
  hw.sendText(`${hw.studentName() || "Student"}, ${prompt}\n${row.answer}`);
  hw.report();
  return row;
}
export const sourceOf = (s) => (s.title ? `“${s.title}”${s.artist ? `, ${s.artist}` : ""}${s.year ? ` (${s.year})` : ""}` : "today's song");
