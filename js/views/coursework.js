// Today's speaking and Today's reading: what to prepare, the course's model answers, and the day's word decks.
import { h, icon, fmtShort } from "../util.js";
import * as store from "../store.js";
import * as srs from "../srs.js";

const link = (href, text, ic) => h("a", { class: "btn small", href, target: href.startsWith("http") ? "_blank" : null, rel: href.startsWith("http") ? "noopener" : null }, ic ? icon(ic, 18) : null, text);

function deckButton(deckId, words) {
  if (!deckId) return null;
  const st = srs.deckStats(deckId);
  const left = st.fresh + st.due;
  return h("a", { class: "btn small primary", href: `#/review/session?deck=${encodeURIComponent(deckId)}` }, icon("review", 18), left ? `Learn words (${left})` : `Words (${st.total}, done)`);
}

function questionList(qs) {
  if (!qs?.length) return null;
  return h("div", null, h("div", { class: "small muted", style: { margin: "8px 0 4px" } }, "Be ready for these questions"),
    h("ol", { style: { margin: 0, paddingLeft: "22px" } }, qs.slice(0, 8).map((q) => h("li", { style: { margin: "3px 0" } }, q))));
}

function unitBlock(u, date) {
  const S = store.S, bank = S.bank;
  const done = S.tasks[`${date}|course|${(store.courseDay(date)?.tasks || []).find((t) => t.unit === u.id)?.id}`]?.done;
  const kids = [h("div", { style: { display: "flex", gap: "8px", alignItems: "baseline", flexWrap: "wrap" } }, h("h3", { style: { margin: 0 } }, u.title), u.words ? h("span", { class: "pill turq" }, `${u.words} words`) : null, done ? h("span", { class: "pill ok" }, "Read") : null)];
  if (u.kind === "p2") {
    const c = bank.cards[u.cardId];
    if (c) kids.push(h("div", { class: "cue", style: { margin: "10px 0", maxWidth: "none" } }, h("h2", { style: { fontSize: "17px" } }, c.title), h("ul", null, c.say.map((x) => h("li", null, x)))));
    if (u.approx) kids.push(h("p", { class: "tiny faint", style: { margin: "0 0 6px" } }, `The closest model answer in the course: "${u.modelFor}". Use its phrases, tell your own story.`));
    else if (u.modelFor) kids.push(h("p", { class: "tiny faint", style: { margin: "0 0 6px" } }, `Model answer: "${u.modelFor}".`));
  } else kids.push(questionList(u.questions));
  const rec = u.kind === "p2" ? `#/speak?mode=part2&card=${u.cardId}&from=${date}` : u.kind === "p3" ? `#/speak?mode=part3&unit=${encodeURIComponent(u.id)}&from=${date}` : `#/speak?mode=part1&unit=${encodeURIComponent(u.id)}&from=${date}`;
  kids.push(h("div", { class: "row-actions", style: { marginTop: "10px" } },
    link(`#/model/${encodeURIComponent(u.id)}`, "Model answer", "book"),
    u.audio ? link(u.audio.url, "Listen", "headphones") : null,
    link(rec, "Record", "mic"),
    deckButton(u.deck, u.words),
    u.again ? h("span", { class: "tiny faint" }, "Words already in your decks") : null));
  return h("div", { class: "unit" }, kids);
}

function readingBlock(r) {
  const st = srs.deckStats(r.deck), left = st.fresh + st.due;
  return h("div", { class: "unit" },
    h("div", { style: { display: "flex", gap: "8px", alignItems: "baseline", flexWrap: "wrap" } }, h("h3", { style: { margin: 0 } }, r.title), h("span", { class: "pill turq" }, `${r.words} words`)),
    h("div", { class: "row-actions", style: { marginTop: "10px" } },
      r.passage ? link(r.passage.url, "Open the passage (PDF)", "book") : null,
      r.notes ? link(r.notes.url, "Answers and notes", "list") : null,
      r.video ? link(r.video.url, `Watch the walkthrough${r.video.minutes ? ` (${r.video.minutes} min)` : ""}`, "video") : null,
      r.deck ? h("a", { class: "btn small primary", href: `#/review/session?deck=${encodeURIComponent(r.deck)}` }, icon("review", 18), left ? `Learn words (${left})` : `Words (${st.total}, done)`) : null),
    !r.passage && !r.video ? h("p", { class: "tiny faint", style: { margin: "8px 0 0" } }, "This is an article word list from the reading marathon.") : null);
}

// the plan's own Part 1 topics, used when the course pack is not loaded
function fallbackSpeaking(date) {
  const S = store.S, d = store.dayByDate(date); if (!d) return null;
  const w = d.agenda?.find((a) => /warm-up/i.test(a.title))?.text || "";
  const topics = ((w.match(/Part 1:\s*([^.]+)/i)?.[1] || "").split(/,| and /).map((x) => x.trim().toLowerCase()).filter(Boolean));
  const keys = topics.length ? topics : ["work", "hometown", "free time"];
  const qs = keys.flatMap((k) => S.bank.part1[k] || []).slice(0, 8);
  if (!qs.length) return null;
  return h("section", { class: "section" }, h("div", { class: "shead" }, h("h2", null, "Today's speaking")),
    h("div", { class: "unit" }, h("h3", { style: { margin: 0 } }, `Part 1: ${keys.join(", ")}`), questionList(qs),
      h("div", { class: "row-actions", style: { marginTop: "10px" } }, link(`#/speak?mode=part1&from=${date}`, "Record your answers", "mic")),
      h("p", { class: "tiny faint", style: { margin: "10px 0 0" } }, "Load the course pack in Settings to get the course's model answers and a word deck for each topic.")));
}

export function courseWork(date) {
  const cd = store.courseDay(date), out = [];
  if (!cd) { const f = fallbackSpeaking(date); return f ? [f] : []; }
  const sp = cd.speaking || {}, units = [...(sp.part1 || []), ...(sp.part2 || []), ...(sp.part3 || [])];
  if (units.length) out.push(h("section", { class: "section" }, h("div", { class: "shead" }, h("h2", null, "Today's speaking"), h("span", { class: "kicker" }, "Prepare, then read the model answers")), ...units.map((u) => unitBlock(u, date))));
  if (cd.reading?.length) out.push(h("section", { class: "section" }, h("div", { class: "shead" }, h("h2", null, "Today's reading"), h("span", { class: "kicker" }, "Passage, walkthrough and words")), ...cd.reading.map(readingBlock)));
  return out;
}

// every deck of the day with its counts, for Today
export function todaysDecks(date) {
  const decks = (store.S.pack?.decks || []).filter((d) => d.date === date);
  if (!decks.length) return null;
  const rows = decks.map((d) => { const st = srs.deckStats(d.id); return h("li", null, h("a", { class: "row", href: `#/review/session?deck=${encodeURIComponent(d.id)}` },
    h("div", { class: "grow" }, h("div", { class: "title small" }, d.name), h("div", { class: "sub" }, `${st.fresh} new, ${st.due} due, ${st.total} cards`)), icon("chevron", 18))); });
  return h("section", { class: "section" }, h("div", { class: "shead" }, h("h2", null, "Today's decks"), h("a", { class: "btn small", href: `#/review/session?day=${date}` }, "Review them all")), h("ul", { class: "rows" }, rows));
}

export default async function () { return h("div"); }
