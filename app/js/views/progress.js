// Progress: every mock she has done, the bands, her writing and her recordings, then and now.
import { h, icon, fmtShort, fmtDate } from "../util.js";
import * as store from "../store.js";
import * as hw from "../homework.js";
import * as M from "../mocks.js";
import { head, sheet } from "../ui.js";

export default async function (ctx) {
  const mocks = [...(hw.F.mocks || [])].filter((m) => M.SECTIONS.some((s) => M.attempt(m.id, s)?.status === "done")).sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const root = h("div", { class: "progv" });
  const done = mocks.map((m) => ({ m, sum: M.summary(m.id) }));
  const overalls = done.filter((d) => d.sum.overall != null);
  const latest = overalls.at(-1), first = overalls[0];
  root.append(h("header", { class: "hwhead-top" }, h("div", null, h("div", { class: "kicker" }, "Progress"), h("h1", null, done.length ? `${done.length} ${done.length === 1 ? "mock" : "mocks"}` : "Nothing yet"),
    h("div", { class: "hwmeta num" }, latest ? `Latest overall ${latest.sum.overall.toFixed(1)}${first && first !== latest ? `, from ${first.sum.overall.toFixed(1)}` : ""}` : "Your mock results and recordings collect here."))));

  if (done.length) root.append(trend(done));
  for (const { m, sum } of [...done].reverse()) root.append(mockBlock(ctx, m, sum));
  return root;
}

// a quiet line chart of overall (and each skill) across mocks
function trend(done) {
  const rows = done.filter((d) => Object.keys(d.sum.bands).length);
  if (rows.length < 2) return h("div");
  const W = 600, H = 150, pad = 28, xs = rows.map((_, i) => pad + (i * (W - 2 * pad)) / (rows.length - 1)), y = (b) => H - pad - ((b - 4) / 5) * (H - 2 * pad);
  const NS = "http://www.w3.org/2000/svg", el = (n, a = {}) => { const e = document.createElementNS(NS, n); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); return e; };
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, class: "trend", role: "img", "aria-label": "Bands across mocks" });
  for (const b of [5, 6, 7, 8, 9]) { svg.append(el("line", { x1: pad, x2: W - pad, y1: y(b), y2: y(b), class: "grid" })); const t = el("text", { x: pad - 8, y: y(b) + 4, "text-anchor": "end" }); t.textContent = b; svg.append(t); }
  const series = [["overall", (d) => d.sum.overall, "ov"], ["listening", (d) => d.sum.bands.listening, "li"], ["reading", (d) => d.sum.bands.reading, "re"], ["writing", (d) => d.sum.bands.writing, "wr"], ["speaking", (d) => d.sum.bands.speaking, "sp"]];
  for (const [name, f, cls] of series) {
    const pts = rows.map((d, i) => [xs[i], f(d)]).filter((p) => p[1] != null);
    if (pts.length < 2) continue;
    svg.append(el("polyline", { points: pts.map(([x, b]) => `${x},${y(b)}`).join(" "), class: "s-" + cls, fill: "none" }));
    for (const [x, b] of pts) svg.append(el("circle", { cx: x, cy: y(b), r: 3.5, class: "s-" + cls }));
  }
  rows.forEach((d, i) => { const t = el("text", { x: xs[i], y: H - 6, "text-anchor": "middle" }); t.textContent = d.m.title || d.m.id; svg.append(t); });
  return h("section", { class: "section" }, svg, h("div", { class: "legend-row" }, ["Overall", "Listening", "Reading", "Writing", "Speaking"].map((n, i) => h("span", { class: "lg s-" + ["ov", "li", "re", "wr", "sp"][i] }, n))));
}

function mockBlock(ctx, m, sum) {
  const sec = h("section", { class: "mockcard done" });
  sec.append(h("div", { class: "mc-head" }, h("div", null, h("div", { class: "kicker" }, sum.last ? fmtDate(sum.last.slice(0, 10), { day: "numeric", month: "long" }) : ""), h("h2", null, m.title || m.id)),
    sum.overall != null ? h("div", { class: "mc-band num" }, h("b", null, sum.overall.toFixed(1)), h("span", null, "overall")) : null));
  const grid = h("div", { class: "bands4" });
  for (const s of M.SECTIONS) {
    const a = M.attempt(m.id, s), b = sum.bands[s];
    grid.append(h("button", { class: "band4" + (a?.status === "done" ? "" : " off"), onclick: a?.status === "done" ? () => detail(m, s, a, sum.est?.[s]) : null },
      h("span", { class: "k" }, M.LABEL[s]), h("b", { class: "num" }, b != null ? b.toFixed(1) : a?.status === "done" ? "…" : "–"),
      h("span", { class: "sub" }, a?.status !== "done" ? "not done" : s === "listening" || s === "reading" ? `${a.raw} of ${a.total}` : b != null ? "your teacher's estimate" : "with your teacher")));
  }
  sec.append(grid);
  if (sum.est?.note) sec.append(h("p", { class: "mc-note" }, h("span", { class: "tnote-k" }, "Your teacher "), sum.est.note));
  // her voice, then and now
  const sp = M.attempt(m.id, "speaking");
  if (sp?.recordings?.length) sec.append(h("div", { class: "recs" }, sp.recordings.slice(0, 3).map((r) => h("div", { class: "rec" }, h("span", { class: "small muted" }, r.label), h("audio", { controls: true, preload: "none", src: r.url ||= URL.createObjectURL(r.blob) })))),
    sp.recordings.length > 3 ? h("button", { class: "btn small quiet", onclick: () => detail(m, "speaking", sp, sum.est?.speaking) }, `All ${sp.recordings.length} recordings`) : null);
  return sec;
}

function detail(m, s, a, est) {
  sheet((close) => {
    const box = h("div", { class: "mockdetail" }, h("div", { class: "kicker" }, m.title || m.id), h("h2", null, M.LABEL[s]));
    if (s === "listening" || s === "reading") {
      box.append(h("p", { class: "lead num" }, h("b", null, a.band?.toFixed(1)), ` · ${a.raw} of ${a.total} correct`), a.leaves ? h("p", { class: "small muted" }, `You left the exam screen ${a.leaves} ${a.leaves === 1 ? "time" : "times"}.`) : null,
        h("ol", { class: "answers" }, (a.detail || []).map((d) => h("li", { class: d.ok ? "ok" : "no" }, h("span", { class: "n num" }, d.n), h("span", { class: "mine" }, d.mine || "—"), d.ok ? null : h("span", { class: "key" }, d.key)))));
    } else if (s === "writing") {
      if (est?.band != null) box.append(h("p", { class: "lead num" }, h("b", null, est.band.toFixed(1)), " from your teacher"), est.note ? h("p", { class: "muted" }, est.note) : null);
      for (const [k, t] of Object.entries(a.texts || {})) box.append(h("h3", null, `Task ${k}`, h("span", { class: "faint small num" }, ` · ${M.countWords(t)} words`)), h("div", { class: "essay" }, t));
    } else {
      if (est?.band != null) box.append(h("p", { class: "lead num" }, h("b", null, est.band.toFixed(1)), " from your teacher"), est.note ? h("p", { class: "muted" }, est.note) : null);
      box.append(h("div", { class: "recs" }, (a.recordings || []).map((r) => h("div", { class: "rec" }, h("span", { class: "small muted" }, r.label), h("audio", { controls: true, preload: "none", src: r.url ||= URL.createObjectURL(r.blob) })))));
    }
    box.append(h("div", { class: "row-actions", style: { marginTop: "14px" } }, h("button", { class: "btn", onclick: close }, "Close")));
    return box;
  });
}
