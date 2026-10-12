// Spaced repetition: FSRS through ts-fsrs, desired retention 0.90, a daily cap on new cards.
import { fsrs, generatorParameters, createEmptyCard, Rating } from "../vendor/ts-fsrs.mjs";
import * as db from "./db.js";
import * as store from "./store.js";
import { todayISO, diffDays, uid } from "./util.js";

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

// Cards for a session: learned cards that are due, then new ones up to today's cap.
export function queue({ tag = null, deck = null, day = null, includeNew = true } = {}) {
  const now = new Date();
  const dayDecks = day ? new Set((store.S.pack?.decks || []).filter((d) => d.date === day).map((d) => d.id)) : null;
  const ok = (c) => !c.suspended && (!tag || c.tag === tag || c.type === tag) && (!deck || c.deck === deck) && (!dayDecks || dayDecks.has(c.deck));
  const due = store.S.cards.filter((c) => ok(c) && c.fsrs && new Date(c.fsrs.due) <= now).sort((a, b) => new Date(a.fsrs.due) - new Date(b.fsrs.due));
  const room = newRemaining();
  const fresh = includeNew ? store.S.cards.filter((c) => ok(c) && !c.fsrs).slice(0, Number.isFinite(room) ? room : undefined) : [];
  return [...due, ...fresh];
}
export function dueCount() { return queue().length; }

export async function grade(card, rating) {
  const now = new Date(), rec = sched().repeat(stateOf(card), now)[rating];
  if (!card.fsrs) card.introduced = todayISO();
  card.fsrs = rec.card;
  await db.put("cards", card);
  await db.put("reviewlog", { cardId: card.id, rating, at: now.toISOString(), state: rec.log?.state ?? null });
  // an error becomes Fixed after three successful reviews spread over at least seven days
  if (card.errorId && rating >= Rating.Good) {
    const e = store.S.errors.find((x) => x.id === card.errorId);
    if (e) {
      const t = todayISO(); e.successDates = [...(e.successDates || []), t];
      const first = e.successDates[0];
      if (e.status !== "Fixed" && e.successDates.length >= 3 && diffDays(first, t) >= 7) e.status = "Fixed";
      await store.saveError(e);
    }
  } else if (card.errorId && rating === Rating.Again) {
    const e = store.S.errors.find((x) => x.id === card.errorId);
    if (e && e.successDates?.length) { e.successDates = []; await store.saveError(e); }
  }
  store.changed();
  return card;
}
export const isLeech = (card) => (card.fsrs?.lapses || 0) >= 5;

export async function addCard({ type = "custom", front, back, tag = "", prompt = "", source = "Added by you" }) {
  const card = { id: "c-" + uid(), deck: "mine", type, tag, front, back, prompt: prompt || "Say or write it, then check.", source, fsrs: null, introduced: null, suspended: false };
  store.S.cards.push(card); await db.put("cards", card); store.changed(); return card;
}
export async function removeCard(id) { store.S.cards = store.S.cards.filter((c) => c.id !== id); await db.del("cards", id); store.changed(); }

// cards from the course pack's vocabulary land here for approval before joining her deck
export function inbox() { return []; } // course cards now arrive in named decks on the day they are assigned
export function deckStats(id) {
  const cs = store.S.cards.filter((c) => c.deck === id && !c.suspended), now = new Date();
  return { total: cs.length, fresh: cs.filter((c) => !c.fsrs).length, due: cs.filter((c) => c.fsrs && new Date(c.fsrs.due) <= now).length, started: cs.filter((c) => c.fsrs).length };
}
export async function approve(c) { const card = { ...c, fsrs: null, introduced: null, suspended: false }; store.S.cards.push(card); await db.put("cards", card); store.changed(); }
