// A course model answer: the questions, the answer text, the words and phrases to take from it.
import { h, icon } from "../util.js";
import * as store from "../store.js";
import * as srs from "../srs.js";
import { head, toast } from "../ui.js";

export const live = true;

export default async function (ctx) {
  const id = decodeURIComponent(ctx.params[0] || ""), u = store.unitById(id);
  const root = h("div");
  if (!u) { root.append(head("Model answer", { back: "#/today" }), h("div", { class: "empty" }, "That model answer is not in your course pack. Load the pack in Settings.")); return root; }
  const S = store.S, bank = S.bank;
  root.append(head(u.title, { back: "#/today", sub: u.modelFor && u.kind === "p2" ? `Model answer: ${u.modelFor}` : "Course model answer" }));

  const task = (store.courseDay(u.date)?.tasks || []).find((t) => t.unit === u.id);
  const key = task ? `${u.date}|course|${task.id}` : null, done = key && store.isDone(key);
  const rec = u.kind === "p2" ? `#/speak?mode=part2&card=${u.cardId}&from=${u.date}` : u.kind === "p3" ? `#/speak?mode=part3&unit=${encodeURIComponent(u.id)}&from=${u.date}` : `#/speak?mode=part1&unit=${encodeURIComponent(u.id)}&from=${u.date}`;
  const cards = (S.pack?.cards || []).filter((c) => c.deck === u.deck);
  const st = u.deck ? srs.deckStats(u.deck) : null;

  root.append(h("div", { class: "row-actions" },
    u.audio ? h("a", { class: "btn", href: u.audio.url, target: "_blank", rel: "noopener" }, icon("headphones", 18), "Listen to the voice model") : null,
    h("a", { class: "btn", href: u.pdf.url, target: "_blank", rel: "noopener" }, icon("link", 18), "Open the PDF in Telegram"),
    h("a", { class: "btn", href: rec }, icon("mic", 18), "Record your answer"),
    u.deck ? h("a", { class: "btn primary", href: `#/review/session?deck=${encodeURIComponent(u.deck)}` }, icon("review", 18), st && st.fresh + st.due ? `Learn the words (${st.fresh + st.due})` : "Review the words") : null));

  if (u.kind === "p2" && bank.cards[u.cardId]) {
    const c = bank.cards[u.cardId];
    root.append(h("div", { class: "cue", style: { margin: "16px 0", maxWidth: "none" } }, h("h2", { style: { fontSize: "18px" } }, c.title), h("ul", null, c.say.map((x) => h("li", null, x)))));
    if (u.approx) root.append(h("p", { class: "small muted" }, `This is the closest model answer in the course ("${u.modelFor}"). Take its phrases and tell your own story.`));
  }
  if (u.questions?.length) root.append(h("section", { class: "section" }, h("div", { class: "shead" }, h("h2", null, "Questions")), h("ol", { style: { paddingLeft: "22px", margin: 0 } }, u.questions.map((q) => h("li", { style: { margin: "4px 0" } }, q)))));

  if (u.text?.length) root.append(h("section", { class: "section" }, h("div", { class: "shead" }, h("h2", null, "Model answer")), h("div", { class: "model-text" }, u.text.map((p) => h("p", null, p))),
    h("p", { class: "tiny faint" }, "Read it for structure and phrases, not to memorise. Then record your own answer.")));

  if (cards.length) root.append(h("section", { class: "section" }, h("div", { class: "shead" }, h("h2", null, "Words and phrases"), h("span", { class: "kicker num" }, `${cards.length} in your deck`)),
    h("ul", { class: "rows" }, cards.map((c) => h("li", null, h("div", { class: "row", style: { alignItems: "flex-start" } }, h("div", { class: "grow" }, h("div", { class: "title" }, c.front), h("div", { class: "sub", style: { whiteSpace: "pre-line" } }, c.back))))))));
  else if (u.deck == null && !u.again) root.append(h("p", { class: "small muted", style: { marginTop: "16px" } }, "This model answer has no word list in the course."));

  if (key) root.append(h("div", { class: "row-actions", style: { margin: "24px 0 8px" } },
    done ? h("button", { class: "btn", onclick: () => store.unmarkDone(key) }, "Mark as not read")
      : h("button", { class: "btn primary", onclick: async () => { await store.markDone(key); toast("Marked as read."); location.hash = "#/today"; } }, icon("check", 18), "I have read and listened to this")));
  return root;
}
