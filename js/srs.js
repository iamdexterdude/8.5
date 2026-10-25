// Spaced repetition: FSRS through ts-fsrs, desired retention 0.90, Anki-style intervals.
import { fsrs, generatorParameters, createEmptyCard, Rating } from "../vendor/ts-fsrs.mjs";
import * as db from "./db.js";
import * as store from "./store.js";
import { todayISO } from "./util.js";

export { Rating };
let scheduler = null, schedRetention = null;
function sched() {
  const r = store.setting("desiredRetention");
  if (!scheduler || r !== schedRetention) { scheduler = fsrs(generatorParameters({ request_retention: r, enable_fuzz: true })); schedRetention = r; }
  return scheduler;
}
function revive(s) {
  const c = { ...s };
  c.due = new Date(c.due); if (c.last_review) c.last_review = new Date(c.last_review);
  return c;
}
const stateOf = (card) => (card.fsrs ? revive(card.fsrs) : createEmptyCard(new Date()));
export const isNew = (card) => !card.fsrs;
export const dueDate = (card) => (card.fsrs ? new Date(card.fsrs.due) : null);

// What would each answer schedule? Used for the labels under the grade buttons.
export function preview(card) {
  const now = new Date(), rec = sched().repeat(stateOf(card), now), out = {};
  for (const r of [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy]) out[r] = rec[r].card.due;
  return out;
}
export function humanInterval(due, now = new Date()) {
  const min = Math.round((due - now) / 60000);
  if (min < 1) return "now";
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60); if (h < 24) return `${h} h`;
  const d = Math.round(h / 24); if (d < 30) return `${d} d`;
  const m = Math.round(d / 30); return m < 12 ? `${m} mo` : `${(d / 365).toFixed(1)} y`;
}

export function newToday() { const t = todayISO(); return store.S.cards.filter((c) => c.introduced === t).length; }
export function newRemaining() { const cap = Number(store.setting("newCardsPerDay")); return cap > 0 ? Math.max(0, cap - newToday()) : Infinity; } // 0 = no limit

// Cards for a session: learned cards that are due, then new ones (up to today's cap when one is set).
export function queue({ deck = null, includeNew = true } = {}) {
  const now = new Date();
  const ok = (c) => !c.suspended && (!deck || c.deck === deck);
  const due = store.S.cards.filter((c) => ok(c) && c.fsrs && new Date(c.fsrs.due) <= now).sort((a, b) => new Date(a.fsrs.due) - new Date(b.fsrs.due));
  const room = newRemaining();
  const fresh = includeNew ? store.S.cards.filter((c) => ok(c) && !c.fsrs).slice(0, Number.isFinite(room) ? room : undefined) : [];
  return [...due, ...fresh];
}
export function dueCount(deck = null) { return queue({ deck }).length; }

export async function grade(card, rating) {
  const now = new Date(), rec = sched().repeat(stateOf(card), now)[rating];
  if (!card.fsrs) card.introduced = todayISO();
  card.fsrs = rec.card;
  await db.put("cards", card);
  await db.put("reviewlog", { cardId: card.id, deck: card.deck, rating, at: now.toISOString(), state: rec.log?.state ?? null });
  store.changed();
  return card;
}
export const isLeech = (card) => (card.fsrs?.lapses || 0) >= 5;
export async function forget(card) { card.fsrs = null; card.introduced = null; await db.put("cards", card); store.changed(); }

export function deckStats(id) {
  const cs = store.S.cards.filter((c) => c.deck === id && !c.suspended), now = new Date();
  return { total: cs.length, fresh: cs.filter((c) => !c.fsrs).length, due: cs.filter((c) => c.fsrs && new Date(c.fsrs.due) <= now).length, started: cs.filter((c) => c.fsrs).length, suspended: store.S.cards.filter((c) => c.deck === id && c.suspended).length };
}
export async function reviewsByDay(days = 30) {
  const log = await db.all("reviewlog"), out = {};
  const since = Date.now() - days * 86400000;
  for (const l of log) { if (Date.parse(l.at) < since) continue; const d = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent" }).format(new Date(l.at)); out[d] = (out[d] || 0) + 1; }
  return out;
}
