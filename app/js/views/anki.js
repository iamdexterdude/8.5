// Anki: her decks and her cards. Study with four answers and real intervals; make decks; add, edit, suspend and delete cards.
import { h, icon, mmss, todayISO, fmtShort } from "../util.js";
import * as store from "../store.js";
import * as srs from "../srs.js";
import * as hw from "../homework.js";
import { head, toast, sheet, confirmSheet } from "../ui.js";

export const live = false;

export default async function (ctx) {
  const [mode, arg] = ctx.params;
  if (mode === "study") return study(ctx, arg || null);
  if (mode === "deck" && arg) return deckView(ctx, arg);
  return hub(ctx);
}

// ---------- the decks ----------
function hub(ctx) {
  const S = store.S, dueAll = srs.dueCount();
  const root = h("div", { class: "ankiv" });
  root.append(h("header", { class: "hwhead-top" }, h("div", null, h("div", { class: "kicker" }, "Anki"), h("h1", null, dueAll ? `${dueAll} to review` : "Nothing due"),
    h("div", { class: "hwmeta num" }, `${S.cards.length} ${S.cards.length === 1 ? "card" : "cards"} in ${S.decks.length} ${S.decks.length === 1 ? "deck" : "decks"}`)),
    dueAll ? h("a", { class: "btn primary", href: "#/anki/study" }, icon("play", 18), "Study") : null));

  // a word from the teacher about her Anki, shown once, quietly
  const note = hw.F.config?.ankiNote;
  if (note?.text && note.at !== S.kv["anki-note-seen"]) root.append(h("section", { class: "tnote" }, h("div", { class: "tnote-k" }, "From your teacher"), h("p", null, note.text),
    h("button", { class: "btn small quiet", onclick: () => store.setSetting("anki-note-seen", note.at) }, "Got it")));

  const list = h("ul", { class: "rows decks" });
  for (const d of [...S.decks].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))) {
    const st = srs.deckStats(d.id);
    list.append(h("li", null, h("div", { class: "row" },
      h("a", { class: "grow", href: `#/anki/deck/${encodeURIComponent(d.id)}` }, h("div", { class: "title" }, d.name), h("div", { class: "counts num" }, h("span", { class: "c-new" }, st.fresh), h("span", { class: "c-due" }, st.due), h("span", { class: "c-all" }, st.total))),
      st.fresh + st.due ? h("a", { class: "btn small primary", href: `#/anki/study/${encodeURIComponent(d.id)}` }, "Study") : st.total ? h("a", { class: "btn small quiet", href: `#/anki/study/${encodeURIComponent(d.id)}?all=1` }, "Practise") : null)));
  }
  root.append(h("section", { class: "section" },
    h("div", { class: "shead" }, h("h2", null, "Decks"), h("span", { class: "legend num" }, h("span", { class: "c-new" }, "new"), h("span", { class: "c-due" }, "due"), h("span", { class: "c-all" }, "all"))),
    S.decks.length ? list : h("p", { class: "muted" }, "No decks yet. Make one for each lesson, or wait for your teacher's."),
    h("div", { class: "row-actions", style: { marginTop: "12px" } }, h("button", { class: "btn", onclick: () => newDeck(ctx) }, icon("plus", 18), "New deck"), S.decks.length ? h("button", { class: "btn quiet", onclick: () => addCardSheet(ctx) }, "Add a card") : null)));
  return root;
}

function newDeck(ctx, after) {
  const name = h("input", { type: "text", placeholder: "Lesson 3: Part 2 phrases", "aria-label": "Deck name", maxLength: 60 });
  sheet((close) => h("div", null, h("h2", null, "New deck"), h("div", { class: "field", style: { marginTop: "12px" } }, h("label", null, "Name"), name),
    h("div", { class: "row-actions", style: { justifyContent: "flex-end" } }, h("button", { class: "btn", onclick: close }, "Cancel"),
      h("button", { class: "btn primary", onclick: async () => { if (!name.value.trim()) return; const d = await store.addDeck({ name: name.value.trim() }); close(); (after || (() => { location.hash = `#/anki/deck/${encodeURIComponent(d.id)}`; }))(d); } }, "Create"))));
  setTimeout(() => name.focus(), 60);
}

function addCardSheet(ctx, deckId = null, card = null) {
  const decks = store.S.decks;
  const deckSel = h("select", { "aria-label": "Deck" }, decks.map((d) => h("option", { value: d.id, selected: d.id === (card?.deck || deckId) }, d.name)));
  const front = h("textarea", { rows: 2, "aria-label": "Front", placeholder: "Front: the word or phrase", value: card?.front || "" });
  const back = h("textarea", { rows: 2, "aria-label": "Back", placeholder: "Back: the meaning", value: card?.back || "" });
  const ex = h("input", { type: "text", "aria-label": "Example", placeholder: "Example sentence (optional)", value: card?.example || "" });
  sheet((close) => h("div", null, h("h2", null, card ? "Edit card" : "Add a card"),
    h("div", { class: "field", style: { marginTop: "12px" } }, h("label", null, "Deck"), deckSel),
    h("div", { class: "field" }, h("label", null, "Front"), front), h("div", { class: "field" }, h("label", null, "Back"), back), h("div", { class: "field" }, h("label", null, "Example"), ex),
    h("div", { class: "row-actions", style: { justifyContent: "flex-end" } }, h("button", { class: "btn", onclick: close }, "Cancel"),
      h("button", { class: "btn primary", onclick: async () => {
        if (!front.value.trim() || !back.value.trim()) { toast("Fill in both sides."); return; }
        if (card) { await store.saveCard({ ...card, deck: deckSel.value, front: front.value.trim(), back: back.value.trim(), example: ex.value.trim() }); toast("Saved."); }
        else { await store.addCard({ deck: deckSel.value, front: front.value.trim(), back: back.value.trim(), example: ex.value.trim() }); store.changed(); toast("Added."); }
        close(); ctx.rerender();
      } }, card ? "Save" : "Add"))));
  setTimeout(() => front.focus(), 60);
}

// ---------- one deck: its cards ----------
function deckView(ctx, id) {
  const d = store.deckById(id);
  if (!d) return h("div", null, head("Anki", { back: "#/anki" }), h("div", { class: "empty" }, "That deck does not exist."));
  const st = srs.deckStats(id);
  let q = "";
  const root = h("div", { class: "ankiv" });
  root.append(head(d.name, { back: "#/anki", sub: `${st.total} cards · ${st.fresh} new · ${st.due} due${st.suspended ? ` · ${st.suspended} suspended` : ""}`,
    actions: h("button", { class: "iconbtn", "aria-label": "Deck options", onclick: () => deckMenu(ctx, d) }, icon("list")) }));
  root.append(h("div", { class: "row-actions" },
    st.fresh + st.due ? h("a", { class: "btn primary", href: `#/anki/study/${encodeURIComponent(id)}` }, icon("play", 18), `Study ${st.fresh + st.due}`) : null,
    st.total ? h("a", { class: "btn", href: `#/anki/study/${encodeURIComponent(id)}?all=1` }, "Practise all") : null,
    h("button", { class: "btn", onclick: () => addCardSheet(ctx, id) }, icon("plus", 18), "Add a card")));
  const search = h("input", { type: "search", placeholder: "Search this deck", "aria-label": "Search", oninput: (e) => { q = e.target.value.toLowerCase(); draw(); } });
  const list = h("ul", { class: "rows cards" });
  function draw() {
    const cs = store.S.cards.filter((c) => c.deck === id && (!q || (c.front + " " + c.back + " " + (c.example || "")).toLowerCase().includes(q)));
    list.replaceChildren(...cs.map((c) => h("li", { class: c.suspended ? "susp" : "" }, h("div", { class: "row card-row" },
      h("button", { class: "grow plain", onclick: () => cardMenu(ctx, c, draw) },
        h("div", { class: "title" }, c.front), h("div", { class: "sub" }, c.back), c.example ? h("div", { class: "tiny faint" }, c.example) : null),
      h("span", { class: "tiny faint num" }, c.suspended ? "suspended" : c.fsrs ? srs.humanInterval(new Date(c.fsrs.due)) : "new")))));
    if (!cs.length) list.append(h("li", { class: "muted small", style: { padding: "12px 0" } }, q ? "No cards match." : "No cards yet. Add the first one."));
  }
  draw();
  root.append(h("section", { class: "section" }, h("div", { class: "field" }, search), list));
  return root;
}

function deckMenu(ctx, d) {
  const name = h("input", { type: "text", value: d.name, "aria-label": "Deck name", maxLength: 60 });
  sheet((close) => h("div", null, h("h2", null, "Deck"),
    h("div", { class: "field", style: { marginTop: "12px" } }, h("label", null, "Name"), name),
    h("div", { class: "row-actions" },
      h("button", { class: "btn primary", onclick: async () => { if (name.value.trim()) { await store.saveDeck({ ...d, name: name.value.trim() }); } close(); ctx.rerender(); } }, "Save"),
      h("button", { class: "btn", onclick: async () => { for (const c of store.S.cards.filter((c) => c.deck === d.id)) await srs.forget(c); close(); toast("Progress reset. Every card is new again."); ctx.rerender(); } }, "Reset progress"),
      h("button", { class: "btn danger", onclick: () => { close(); confirmSheet("Delete this deck?", `${d.name} and its cards go. This cannot be undone.`, "Delete", async () => { await store.removeDeck(d.id); if (d.kind === "teacher") await store.setSetting("deck-removed-" + d.id, true); location.hash = "#/anki"; }, { danger: true }); } }, "Delete"))));
}
function cardMenu(ctx, c, redraw) {
  sheet((close) => h("div", null, h("div", { class: "kicker" }, "Card"), h("h2", { style: { marginTop: "4px" } }, c.front), h("p", { class: "muted" }, c.back), c.example ? h("p", { class: "small faint" }, c.example) : null,
    h("div", { class: "row-actions", style: { marginTop: "12px" } },
      h("button", { class: "btn", onclick: () => { close(); addCardSheet(ctx, c.deck, c); } }, icon("edit", 16), "Edit"),
      h("button", { class: "btn", onclick: async () => { await store.saveCard({ ...c, suspended: !c.suspended }); close(); redraw(); } }, c.suspended ? "Unsuspend" : "Suspend"),
      c.fsrs ? h("button", { class: "btn quiet", onclick: async () => { await srs.forget(c); close(); redraw(); } }, "Forget") : null,
      h("button", { class: "btn quiet danger", onclick: async () => { await store.removeCard(c.id); close(); redraw(); toast("Deleted."); } }, icon("trash", 16), "Delete"))));
}

// ---------- study ----------
async function study(ctx, deckId) {
  const all = ctx.query.all === "1";
  let queue = all ? store.S.cards.filter((c) => (!deckId || c.deck === deckId) && !c.suspended) : srs.queue({ deck: deckId });
  if (all) queue = queue.sort(() => Math.random() - 0.5);
  const total = queue.length, deck = deckId ? store.deckById(deckId) : null;
  const root = h("div", { class: "ankiv study" });
  let done = 0, again = 0, startedAt = Date.now(), revealed = false, current = null, busy = false;
  const count = h("span", { class: "num faint small" });
  const bar = h("i", { style: { width: "0%" } });
  const body = h("div");
  root.append(head(deck ? deck.name : "Study", { back: deckId ? `#/anki/deck/${encodeURIComponent(deckId)}` : "#/anki", actions: count }), h("div", { class: "progressline" }, bar), body);
  ctx.onLeave(() => { document.removeEventListener("keydown", onKey); hw.report(); });

  function finish() {
    document.removeEventListener("keydown", onKey);
    const mins = Math.max(1, Math.round((Date.now() - startedAt) / 60000));
    const nextDue = store.S.cards.filter((c) => c.fsrs && (!deckId || c.deck === deckId)).map((c) => new Date(c.fsrs.due)).filter((d) => d > new Date()).sort((a, b) => a - b)[0];
    body.replaceChildren(h("div", { class: "rest" }, h("h1", null, done ? "Done" : "Nothing to study"),
      h("p", { class: "lead muted" }, done ? `${done} ${done === 1 ? "card" : "cards"} in ${mins} min.` : "Come back when cards are due."),
      done ? h("p", { class: "muted num" }, `${done - again} remembered, ${again} to see again.`) : null,
      nextDue ? h("p", { class: "small faint" }, "Next card in " + srs.humanInterval(nextDue) + ".") : null,
      h("div", { class: "row-actions", style: { justifyContent: "center", marginTop: "16px" } }, h("a", { class: "btn primary", href: "#/anki" }, "Back to Anki"))));
    hw.report();
  }
  function show() {
    current = queue[0];
    if (!current) { finish(); return; }
    revealed = false; busy = false;
    count.textContent = `${queue.length} left`;
    bar.style.width = `${total ? (done / (done + queue.length)) * 100 : 0}%`;
    const card = h("div", { class: "flash", role: "group", "aria-label": "Card" },
      h("div", { class: "kicker" }, store.deckById(current.deck)?.name || ""),
      h("div", { class: "q" }, current.front));
    const reveal = h("button", { class: "btn primary block", style: { marginTop: "16px" }, onclick: doReveal }, "Show answer ", h("span", { class: "kbd" }, "Space"));
    const answerArea = h("div");
    body.replaceChildren(card, answerArea, reveal);
    function doReveal() {
      if (revealed) return; revealed = true;
      card.classList.add("flip"); card.append(h("div", { class: "a" }, current.back), current.example ? h("div", { class: "ex" }, current.example) : null);
      reveal.remove();
      const pv = srs.preview(current), R = srs.Rating;
      const btn = (rating, label, cls) => h("button", { class: cls, onclick: () => rate(rating), "aria-label": `${label}, next in ${srs.humanInterval(pv[rating])}` }, h("span", null, label), h("small", null, srs.humanInterval(pv[rating])), h("span", { class: "kbd", "aria-hidden": "true" }, String(rating)));
      answerArea.append(h("div", { class: "grades" }, btn(R.Again, "Again", "again"), btn(R.Hard, "Hard", "hard"), btn(R.Good, "Good", "good"), btn(R.Easy, "Easy", "easy")));
    }
    show.reveal = doReveal;
    async function rate(rating) {
      if (busy) return; busy = true;
      const c = queue.shift(); if (!all) await srs.grade(c, rating); done++;
      if (rating === srs.Rating.Again) { again++; if (queue.length > 2) queue.splice(3, 0, c); else queue.push(c); }
      card.classList.add("out"); setTimeout(show, 180);
    }
    show.rate = rate;
  }
  function onKey(e) {
    if (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT") return;
    if (e.code === "Space") { e.preventDefault(); if (!revealed) show.reveal?.(); }
    else if (revealed && ["1", "2", "3", "4"].includes(e.key)) show.rate?.(Number(e.key));
  }
  document.addEventListener("keydown", onKey);
  show();
  return root;
}
