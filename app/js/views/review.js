// Review: spaced repetition with FSRS. Quick review (five minutes), a full session, or by tag.
import { h, icon, mmss, todayISO, uid } from "../util.js";
import * as store from "../store.js";
import * as srs from "../srs.js";
import { head, toast, makeTimer, sheet, segLinks } from "../ui.js";
import { patternMark } from "../util.js";

export const live = false;

const TAGS = [["article", "Articles"], ["collocation", "Collocations"], ["grammar", "Grammar"], ["template", "Templates"], ["task", "Task"], ["vocab", "Vocabulary"], ["paraphrase", "Paraphrases"], ["chunk", "Speaking chunks"]];
const patternOf = (c) => ({ article: "Article", collocation: "Collocation", grammar: "Grammar", template: "Template", task: "Task" })[c.tag];

export default async function (ctx) {
  if (ctx.params[0] === "session") return session(ctx);
  if (ctx.params[0] === "inbox") return inbox(ctx);
  return hub(ctx);
}

// ---------- hub ----------
function hub(ctx) {
  const S = store.S, due = srs.queue(), total = S.cards.length;
  const learned = S.cards.filter((c) => c.fsrs).length, leeches = S.cards.filter(srs.isLeech);
  const root = h("div");
  root.append(head("Review", { sub: "Words, phrases and fixes" }));
  root.append(segLinks("Review sections", [["cards", "Cards", "#/review"], ["errors", "Error log", "#/errors"]], "cards"));

  root.append(h("section", { class: "section", style: { marginTop: 0 } },
    h("div", { class: "band" }, h("div", { class: "big num", "aria-label": `${due.length} cards ready` }, String(due.length)), h("div", { class: "side" }, h("div", { class: "kicker" }, "cards ready"), h("div", { class: "kicker" }, `${srs.newRemaining()} new allowed today`))),
    h("div", { class: "row-actions" },
      h("a", { class: "btn primary", href: "#/review/session?mode=quick", "aria-disabled": due.length ? null : "true" }, icon("play", 18), "Quick review, 5 min"),
      h("a", { class: "btn", href: "#/review/session?mode=full" }, "Full session"))));
  if (!due.length) root.append(h("p", { class: "muted", style: { marginTop: "10px" } }, "Nothing is due. Come back tomorrow, or add a card from something you read today."));

  root.append(h("section", { class: "section" }, h("div", { class: "shead" }, h("h2", null, "By tag")),
    h("div", { class: "row-actions" }, TAGS.map(([k, l]) => { const n = srs.queue({ tag: k }).length, all = S.cards.filter((c) => c.tag === k).length;
      return all ? h("a", { class: "btn small", href: `#/review/session?mode=full&tag=${k}` }, patternOf({ tag: k }) ? patternMark(patternOf({ tag: k })) : null, `${l} `, h("span", { class: "faint num" }, String(n))) : null; }))));

  const inb = srs.inbox();
  if (inb.length) root.append(h("section", { class: "section" }, h("div", { class: "row", style: { borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)" } },
    h("div", { class: "grow" }, h("div", { class: "title num" }, `${inb.length} suggested cards from the course`), h("div", { class: "sub" }, "Nothing joins your deck until you approve it.")),
    h("a", { class: "btn", href: "#/review/inbox" }, "Open the card inbox"))));

  root.append(h("section", { class: "section" }, h("div", { class: "shead" }, h("h2", null, "Your deck")),
    h("div", { class: "small muted num" }, `${total} cards, ${learned} started`, leeches.length ? `, ${leeches.length} you keep missing` : ""),
    h("div", { class: "row-actions", style: { marginTop: "10px" } }, h("button", { class: "btn", onclick: addCardSheet }, icon("plus", 18), "Add a card"))));

  if (leeches.length) root.append(h("section", { class: "section" }, h("div", { class: "shead" }, h("h2", null, "Cards you keep missing")), h("p", { class: "small muted" }, "Failed five times or more. Good material for the next lesson warm-up."),
    h("ul", { class: "rows" }, leeches.slice(0, 8).map((c) => h("li", null, h("div", { class: "row" }, h("div", { class: "grow" }, h("div", { class: "small" }, c.front), h("div", { class: "sub" }, c.back))))))));
  return root;
}

function addCardSheet() {
  const types = { custom: "Front and back", vocab: "Vocabulary", chunk: "Speaking chunk", paraphrase: "Paraphrase pair" };
  const type = h("select", { "aria-label": "Type" }, Object.entries(types).map(([k, v]) => h("option", { value: k }, v)));
  const front = h("textarea", { rows: 2, "aria-label": "Front", placeholder: "Front: a word, a question, or your wrong sentence" });
  const back = h("textarea", { rows: 2, "aria-label": "Back", placeholder: "Back: the answer" });
  return sheet((close) => h("div", null, h("h2", null, "Add a card"),
    h("div", { class: "field", style: { marginTop: "12px" } }, type, front, back),
    h("div", { class: "row-actions", style: { justifyContent: "flex-end" } }, h("button", { class: "btn", onclick: close }, "Cancel"),
      h("button", { class: "btn primary", onclick: async () => { if (!front.value.trim() || !back.value.trim()) { toast("Fill in both sides."); return; } await srs.addCard({ type: type.value, tag: type.value === "custom" ? "" : type.value === "vocab" ? "vocab" : type.value, front: front.value.trim(), back: back.value.trim() }); close(); toast("Card added. It will appear in tomorrow's new cards."); } }, "Add card"))));
}

// ---------- card inbox ----------
function inbox(ctx) {
  const cards = srs.inbox();
  const root = h("div");
  root.append(head("Card inbox", { back: "#/review", sub: `${cards.length} waiting` }));
  if (!cards.length) { root.append(h("div", { class: "empty" }, "The inbox is empty.")); return root; }
  root.append(h("div", { class: "row-actions" }, h("button", { class: "btn primary", onclick: async () => { for (const c of cards.slice(0, 50)) await srs.approve(c); toast("Added 50 cards."); ctx.rerender(); } }, `Approve the first ${Math.min(50, cards.length)}`)));
  root.append(h("ul", { class: "rows", style: { marginTop: "12px" } }, cards.slice(0, 60).map((c) => h("li", null, h("div", { class: "row", style: { flexWrap: "wrap" } },
    h("div", { class: "grow" }, h("div", { class: "title" }, c.front), h("div", { class: "sub", style: { whiteSpace: "pre-line" } }, c.back), c.source ? h("div", { class: "tiny faint" }, c.source) : null),
    h("button", { class: "btn small", onclick: async () => { await srs.approve(c); ctx.rerender(); } }, "Approve"),
    h("button", { class: "btn small quiet", onclick: async () => { await store.setSetting("rej-" + c.id, true); ctx.rerender(); } }, "Reject"))))));
  return root;
}

// ---------- session ----------
async function session(ctx) {
  const q = ctx.query, quick = q.mode === "quick", tag = q.tag || null;
  let queue = srs.queue({ tag }); const total = queue.length;
  const root = h("div");
  const back = q.session ? "#/session" : q.task ? "#/today" : "#/review";
  const limit = quick ? Number(store.setting("quickReviewMinutes")) * 60 : 0;
  let done = 0, again = 0, startedAt = Date.now(), revealed = false, current = null, busy = false;

  const clock = h("span", { class: "faint num small" });
  const bar = h("i", { style: { width: "0%" } });
  const body = h("div");
  root.append(head(quick ? "Quick review" : "Review", { back, sub: tag ? (TAGS.find((t) => t[0] === tag) || [])[1] : null, actions: limit ? clock : null }), h("div", { class: "progressline" }, bar), body);

  let timer = null;
  if (limit) { timer = makeTimer(limit, { onTick: (s) => { clock.textContent = mmss(s); }, onEnd: () => finish("Five minutes are up. Well done.") }); timer.start(); }
  ctx.onLeave(() => { timer?.destroy(); document.removeEventListener("keydown", onKey); speechSynthesis?.cancel?.(); });

  function finish(msg) {
    timer?.destroy(); document.removeEventListener("keydown", onKey);
    const spent = Math.max(1, Math.round((Date.now() - startedAt) / 60000));
    if (done) store.addStudy(spent, "review");
    if (q.task && (done || !total)) store.markDone(q.task);
    const nextDue = store.S.cards.filter((c) => c.fsrs).map((c) => new Date(c.fsrs.due)).filter((d) => d > new Date()).sort((a, b) => a - b)[0];
    body.replaceChildren(h("div", { class: "rest" }, h("h1", null, done ? "Session complete" : "Nothing to review"), h("p", { class: "lead muted" }, msg || (done ? `${done} ${done === 1 ? "card" : "cards"} reviewed.` : "Come back when new cards are due.")),
      done ? h("p", { class: "muted num" }, `${done - again} remembered, ${again} to see again soon.`) : null,
      nextDue ? h("p", { class: "small faint" }, "Next card is due in " + srs.humanInterval(nextDue) + ".") : null,
      h("div", { class: "row-actions", style: { justifyContent: "center", marginTop: "16px" } }, h("a", { class: "btn primary", href: q.session ? "#/session" : "#/today" }, q.session ? "Back to the session" : "Back to Today"), h("a", { class: "btn", href: "#/review" }, "Review home"))));
  }

  function show() {
    current = queue[0];
    if (!current) { finish(); return; }
    revealed = false; busy = false;
    bar.style.width = `${total ? (done / (done + queue.length)) * 100 : 0}%`;
    const patt = patternOf(current);
    const typed = h("textarea", { rows: 2, placeholder: "Type the correct version, or say it aloud (optional)", "aria-label": "Your answer", spellcheck: false, autocomplete: "off", style: { maxWidth: "480px", margin: "0 auto" } });
    const flash = h("div", { class: "flash", role: "group", "aria-label": "Card" },
      h("div", { class: "tagchip", style: { justifySelf: "center" } }, patt ? patternMark(patt) : null, labelOf(current)),
      h("div", { class: "kicker" }, current.prompt || ""),
      h("div", { class: "q" }, current.front),
      (current.type === "chunk" || current.type === "vocab") ? h("button", { class: "btn small quiet", style: { justifySelf: "center" }, onclick: () => speak(current.type === "chunk" ? current.back : current.front.split(/[\n(]/)[0]) }, icon("headphones", 18), "Listen") : null,
      ["fix", "swap"].includes(current.type) ? typed : null);
    const reveal = h("button", { class: "btn primary block", style: { marginTop: "16px" }, onclick: doReveal }, "Show answer ", h("span", { class: "kbd" }, "Space"));
    const answerArea = h("div");
    body.replaceChildren(flash, answerArea, reveal);
    function doReveal() {
      if (revealed) return; revealed = true;
      flash.classList.add("flip"); flash.append(h("div", { class: "a", style: { whiteSpace: "pre-line" } }, current.back), current.source ? h("div", { class: "tiny faint" }, current.source) : null);
      reveal.remove();
      const pv = srs.preview(current), R = srs.Rating;
      const btn = (rating, label, cls) => h("button", { class: cls, onclick: () => rate(rating), "aria-label": `${label}, next in ${srs.humanInterval(pv[rating])}` }, h("span", null, label), h("small", null, srs.humanInterval(pv[rating])), h("span", { class: "kbd", "aria-hidden": "true", style: { justifySelf: "center" } }, String(rating)));
      answerArea.append(h("div", { class: "grades" }, btn(R.Again, "Again", "again"), btn(R.Hard, "Hard", "hard"), btn(R.Good, "Good", "good"), btn(R.Easy, "Easy", "easy")));
    }
    show.reveal = doReveal;
    async function rate(rating) {
      if (busy) return; busy = true;
      const card = queue.shift(); await srs.grade(card, rating); done++;
      if (rating === srs.Rating.Again) { again++; if (queue.length > 2) queue.splice(3, 0, card); else queue.push(card); }
      flash.classList.add("out"); setTimeout(show, 200);
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
const labelOf = (c) => ({ fix: "Fix it", swap: "Template swap", pair: "Paraphrase", vocab: "Vocabulary", chunk: "Speaking chunk", custom: "Card" })[c.type] || "Card";
function speak(text) { try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = "en-GB"; u.rate = .9; speechSynthesis.speak(u); } catch {} }
