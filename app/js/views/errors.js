// Error log: every mistake, corrected and tagged. Rows are marked fixed, never deleted.
import { h, icon, fmtShort, patternMark } from "../util.js";
import * as store from "../store.js";
import { head, toast, segLinks } from "../ui.js";
import { errorForm } from "./write.js";

export const live = true;
const F = { view: "all", pattern: "", status: "Open" }; // filters survive a re-render

export default async function (ctx) {
  const S = store.S, q = ctx.query;
  if (q.view) F.view = q.view;
  const setF = (k, v) => { F[k] = v; render(); };
  const root = h("div");
  root.append(head("Error log", { sub: `${S.errors.filter((e) => e.status === "Open").length} open, ${S.errors.filter((e) => e.status === "Fixed").length} fixed`, back: q.task ? "#/today" : null }));
  root.append(segLinks("Review sections", [["cards", "Cards", "#/review"], ["errors", "Error log", "#/errors"]], "errors"));

  if (q.task) {
    root.append(h("div", { class: "notice" }, "Add every new mistake from today, then mark this task done.",
      h("div", { style: { marginTop: "8px" } }, h("button", { class: "btn primary small", onclick: async () => { await store.markDone(q.task); await store.addStudy(10, "error log"); toast("Error log done."); location.hash = q.session ? "#/session" : "#/today"; } }, icon("check", 18), "I have updated the log"))));
  }

  // filters
  const list = h("div");
  const chips = h("div", { class: "row-actions", style: { marginBottom: "10px" } });
  const render = () => {
    chips.replaceChildren(
      h("div", { class: "seg", role: "group", "aria-label": "View" }, [["all", "All"], ["top", "Top recurring"]].map(([k, l]) => h("button", { "aria-pressed": String(F.view === k), onclick: () => setF("view", k) }, l))),
      h("div", { class: "seg", role: "group", "aria-label": "Status" }, ["Open", "Fixed", "All"].map((k) => h("button", { "aria-pressed": String(F.status === k), onclick: () => setF("status", k) }, k))),
      h("select", { "aria-label": "Pattern", style: { width: "auto" }, onchange: (e) => setF("pattern", e.target.value) }, [h("option", { value: "" }, "All patterns"), ...Object.keys(S.config.patterns).map((k) => h("option", { value: k, selected: F.pattern === k }, k))]));
    let rows = S.errors.filter((e) => (F.status === "All" || e.status === F.status) && (!F.pattern || e.pattern === F.pattern));
    if (F.view === "top") rows = [...rows].sort((a, b) => b.seen - a.seen).slice(0, q.view === "top" ? 20 : 10);
    list.replaceChildren(rows.length ? h("ul", { class: "rows" }, rows.map(row)) : h("div", { class: "empty" }, "Nothing here. Add a mistake below, or change the filter."));
  };
  const row = (e) => h("li", null, h("div", { class: "row" + (e.status === "Fixed" ? " done" : ""), style: { alignItems: "flex-start", flexWrap: "wrap" } },
    h("span", { style: { marginTop: "6px" }, "aria-hidden": "true" }, patternMark(e.pattern, 14)),
    h("div", { class: "grow" },
      h("div", { class: "tag p-" + e.pattern.toLowerCase(), style: { marginBottom: "2px" } }, e.pattern),
      h("div", { style: { textDecoration: e.status === "Fixed" ? "none" : "none" } }, h("span", { class: "muted" }, "Wrote: "), e.wrote),
      h("div", null, h("span", { class: "muted" }, "Better: "), h("b", { style: { fontWeight: 600 } }, e.correct)),
      h("div", { class: "tiny faint", style: { marginTop: "2px" } }, `${e.source}, seen ${e.seen} ${e.seen === 1 ? "time" : "times"}${e.lastSeen ? ", last " + fmtShort(e.lastSeen) : ""}`)),
    h("button", { class: "btn small", onclick: async () => { await store.setErrorStatus(e.id, e.status === "Fixed" ? "Open" : "Fixed"); } }, e.status === "Fixed" ? "Reopen" : "Mark fixed"),
    h("button", { class: "btn small quiet", "aria-label": "Seen again", title: "Seen again", onclick: async () => { e.seen += 1; e.lastSeen = new Date().toISOString().slice(0, 10); if (e.status === "Fixed") e.status = "Open"; await store.saveError(e); toast(`Seen again. Times seen: ${e.seen}.`); } }, icon("repeat", 18), "Seen again")));
  root.append(chips, list);
  render();

  root.append(h("section", { class: "section" }, h("div", { class: "shead" }, h("h2", null, "Add a mistake")), h("p", { class: "small muted" }, "From a lesson, an essay, a recording or a reading passage. A repeat of a known mistake raises its count instead of making a duplicate."), errorForm(null)));
  root.append(h("p", { class: "small faint" }, "A mistake becomes Fixed after three correct reviews spread over at least a week, or when you mark it."));
  return root;
}
