// Mock: the full tests the teacher has set, one card each, with what is done and what is next.
import { h, icon, fmtShort, todayISO } from "../util.js";
import * as store from "../store.js";
import * as hw from "../homework.js";
import * as M from "../mocks.js";
import { toast } from "../ui.js";

export default async function (ctx) {
  hw.refresh(todayISO());
  const mocks = [...(hw.F.mocks || [])].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const root = h("div", { class: "mockv" });
  const doneCount = mocks.filter((m) => M.SECTIONS.every((s) => M.attempt(m.id, s)?.status === "done")).length;
  root.append(h("header", { class: "hwhead-top" }, h("div", null, h("div", { class: "kicker" }, "Mock"), h("h1", null, mocks.length ? "Full tests" : "No tests yet"),
    h("div", { class: "hwmeta num" }, mocks.length ? `${mocks.length} ${mocks.length === 1 ? "test" : "tests"}${doneCount ? ` · ${doneCount} complete` : ""}` : "Your teacher adds one each week."))));

  for (const m of mocks) root.append(mockCard(m));
  if (!mocks.length) root.append(h("p", { class: "muted" }, "Each mock is a whole exam: Listening, Reading, Writing and Speaking, in the same screens as the computer-delivered IELTS. Listening and Reading are marked at once; Writing and Speaking go to your teacher."));
  return root;
}

function mockCard(m) {
  const sum = M.summary(m.id);
  const next = M.SECTIONS.find((s) => M.attempt(m.id, s)?.status !== "done");
  const card = h("section", { class: "mockcard" + (next ? "" : " complete") },
    h("div", { class: "mc-head" }, h("div", null, h("div", { class: "kicker" }, m.date ? fmtShort(m.date) : ""), h("h2", null, m.title || m.id)),
      sum.overall != null ? h("div", { class: "mc-band num" }, h("b", null, sum.overall.toFixed(1)), h("span", null, "overall")) : null));
  const rows = h("div", { class: "mc-rows" });
  for (const s of M.SECTIONS) {
    const a = M.attempt(m.id, s), est = sum.est;
    let state, right = null;
    if (a?.status === "done") {
      state = "done";
      if (s === "listening" || s === "reading") right = h("span", { class: "num" }, h("b", null, a.band?.toFixed?.(1) ?? "–"), h("span", { class: "faint" }, ` · ${a.raw}/${a.total}`));
      else if (est?.[s]?.band != null) right = h("span", { class: "num" }, h("b", null, est[s].band.toFixed(1)), h("span", { class: "faint" }, " · from your teacher"));
      else right = h("span", { class: "faint small" }, "With your teacher");
    } else if (a?.status === "in-progress") { state = "open"; right = h("span", { class: "small" }, "In progress"); }
    else { state = s === next ? "next" : "later"; }
    const href = `#/exam/${encodeURIComponent(m.id)}/${s}`;
    rows.append(h("a", { class: "mc-row " + state, href: state === "later" ? null : href, onclick: state === "later" ? (e) => { e.preventDefault(); toast("Do the parts in order, like the real test."); } : null },
      h("span", { class: "mc-ic" }, icon(s === "listening" ? "headphones" : s === "reading" ? "book" : s === "writing" ? "pen" : "mic", 18)),
      h("span", { class: "grow" }, h("b", null, M.LABEL[s]), h("span", { class: "sub" }, MINUTES[s])),
      right || (state === "next" ? h("span", { class: "btn small primary" }, a ? "Continue" : "Start") : h("span", { class: "faint small" }, "Next"))));
  }
  card.append(rows);
  if (sum.est?.note) card.append(h("p", { class: "mc-note" }, h("span", { class: "tnote-k" }, "Your teacher "), sum.est.note));
  return card;
}
const MINUTES = { listening: "about 30 min, then 2 min to check", reading: "60 min, three passages", writing: "60 min, two tasks", speaking: "about 14 min, recorded" };
