// A mock she sat before the app (published by the teacher for her alone, history/<her id>.json): one card on Progress.
//   Listening and Reading: a ring of forty dots, one per question, lit for each one she got; tap for what she missed and why.
//   Writing: a room of its own. Her text with every mark (tap to step through them), the improved version (tap a phrase
//   to keep it in Writing phrases), and the four criteria. No band for writing: feedback, not numbers.
import { h, icon, fmtDate } from "../util.js";
import { sheet, toast } from "../ui.js";
import { room, keep, unkeep, kept } from "./rooms.js";

const TYPES = { task: "Task", link: "Linking", vocab: "Vocabulary", grammar: "Grammar", good: "Worth keeping" };

export function pastMockCard(m) {
  const sec = h("section", { class: "mockcard past" },
    h("div", { class: "pm-head" },
      h("div", null, h("div", { class: "kicker" }, `${fmtDate(m.date, { day: "numeric", month: "long" })} · ${m.source}`), h("h2", null, m.title))),
    h("div", { class: "pm-grid" },
      ring("Listening", m.listening, () => scoreSheet(m, "Listening", m.listening)),
      ring("Reading", m.reading, () => scoreSheet(m, "Reading", m.reading)),
      h("button", { class: "pm-tile pm-write", onclick: () => writingRoom(m) },
        h("span", { class: "pm-k" }, "Writing"),
        h("span", { class: "pm-pages", "aria-hidden": "true" }, m.writing.tasks.map((t) => h("i", null, h("b", { class: "num" }, t.n)))),
        h("span", { class: "pm-sub" }, "Your text, every note, the improved version"))),
    m.conduct ? h("p", { class: "pm-note" }, m.conduct) : null);
  return sec;
}

// forty dots around a circle, lit one by one on first sight
function ring(label, s, open) {
  const NS = "http://www.w3.org/2000/svg", R = 44, svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 120 120"); svg.setAttribute("class", "pm-ring"); svg.setAttribute("aria-hidden", "true");
  for (let i = 0; i < s.total; i++) {
    const a = -Math.PI / 2 + (i / s.total) * Math.PI * 2, c = document.createElementNS(NS, "circle");
    c.setAttribute("cx", 60 + Math.cos(a) * R); c.setAttribute("cy", 60 + Math.sin(a) * R); c.setAttribute("r", 3.1);
    c.setAttribute("class", i < s.raw ? "on" : "off"); c.style.setProperty("--d", `${i * 22}ms`); svg.append(c);
  }
  return h("button", { class: "pm-tile", onclick: open, "aria-label": `${label}: band ${s.band}, ${s.raw} of ${s.total}` },
    h("span", { class: "pm-k" }, label),
    h("span", { class: "pm-dial" }, svg, h("span", { class: "pm-band num" }, s.band.toFixed(1))),
    h("span", { class: "pm-sub num" }, `${s.raw} of ${s.total}`));
}

function scoreSheet(m, label, s) {
  sheet((close) => h("div", { class: "pm-sheet" },
    h("div", { class: "kicker" }, m.title), h("h2", { tabindex: "-1", autofocus: true }, label),
    h("p", { class: "pm-big num" }, h("b", null, s.band.toFixed(1)), h("span", null, `${s.raw} of ${s.total} correct`)),
    s.parts ? h("div", { class: "pm-parts" }, s.parts.map((p) => h("div", { class: "pm-part" },
      h("span", { class: "pm-pn" }, p.name), h("span", { class: "pm-dots", "aria-hidden": "true" }, Array.from({ length: p.of }, (_, i) => h("i", { class: i < p.raw ? "on" : "" }))), h("b", { class: "num" }, `${p.raw}/${p.of}`)))) : null,
    h("h3", { class: "pm-h3" }, s.misses.length === 1 ? "The one that got away" : "Where it slipped"),
    h("div", { class: "pm-misses" }, s.misses.map((x) => h("article", { class: "pm-miss" },
      h("div", { class: "pm-q" }, h("span", { class: "pm-n num" }, x.n), x.q),
      h("div", { class: "pm-ans" }, h("span", { class: "pm-mine" }, h("small", null, "You"), h("s", null, x.mine)), h("span", { class: "pm-key" }, h("small", null, "Answer"), x.key)),
      x.why ? h("p", { class: "pm-why" }, x.why) : null))),
    s.untold ? h("p", { class: "tiny faint" }, `${s.untold} more ${s.untold === 1 ? "miss isn't" : "misses aren't"} in the saved report.`) : null,
    h("div", { class: "row-actions", style: { marginTop: "16px" } }, h("button", { class: "btn", onclick: close }, "Close"))));
}

// ---------- the writing room ----------
function writingRoom(m) {
  const R = room("Writing", m.title);
  let ti = 0, view = "mine", at = -1, filter = null;
  const draw = () => {
    const t = m.writing.tasks[ti];
    const tabs = h("div", { class: "seg pm-tabs", role: "group", "aria-label": "Task" }, m.writing.tasks.map((x, i) => h("button", { "aria-pressed": String(i === ti), onclick: () => { ti = i; at = -1; filter = null; draw(); } }, `Task ${x.n}`)));
    const views = h("div", { class: "seg pm-views", role: "group", "aria-label": "View" }, [["mine", "Yours"], ["better", "Improved"], ["crit", "Criteria"]].map(([k, l]) => h("button", { "aria-pressed": String(view === k), onclick: () => { view = k; at = -1; draw(); } }, l)));
    const body = view === "mine" ? mine(t) : view === "better" ? better(t) : crit(t);
    R.body.replaceChildren(h("div", { class: "pm-room" }, h("div", { class: "pm-bar" }, tabs, views),
      h("h2", { class: "pm-title" }, t.title.charAt(0).toUpperCase() + t.title.slice(1)), h("p", { class: "pm-meta num" }, view === "better" ? `${words(t.improved.paras)} words` : `${t.words} words`), body));
  };

  // her text, with the marks placed where they belong
  function mine(t) {
    const marks = t.marks.map((x, i) => ({ ...x, i })), placed = [];
    let pi = 0, off = 0;
    for (const mk of marks) {
      if (mk.q) { for (let p = pi; p < t.mine.length; p++) { const j = t.mine[p].indexOf(mk.q, p === pi ? off : 0); if (j >= 0) { placed.push({ ...mk, p, s: j, e: j + mk.q.length }); pi = p; off = j + mk.q.length; break; } } }
      else { const j = t.mine[pi].indexOf(mk.after || ".", off); const e = j >= 0 ? j + (mk.after || ".").length : t.mine[pi].length; placed.push({ ...mk, p: pi, s: e, e, isGap: true }); off = e; }
    }
    const shown = placed.filter((x) => !filter || x.t === filter);
    const counts = {}; for (const x of placed) counts[x.t] = (counts[x.t] || 0) + 1;
    const legend = h("div", { class: "pm-legend" }, Object.keys(TYPES).filter((k) => counts[k]).map((k) => h("button", { class: `pm-chip t-${k}` + (filter === k ? " on" : ""), onclick: () => { filter = filter === k ? null : k; at = -1; draw(); } }, TYPES[k], h("span", { class: "num" }, counts[k]))));
    const paras = t.mine.map((text, p) => {
      const el = h("p", { class: "pm-p" }); let last = 0;
      for (const mk of placed.filter((x) => x.p === p).sort((a, b) => a.s - b.s)) {
        if (mk.s < last) continue;
        el.append(text.slice(last, mk.s));
        const idx = shown.indexOf(mk), dim = filter && mk.t !== filter;
        const mark = tap(mk.isGap ? "pm-gap" : "pm-mark", `t-${mk.t}` + (idx === at ? " on" : "") + (dim ? " dim" : ""), () => dim || go(idx), mk.isGap ? `+ ${mk.gap || "missing"}` : text.slice(mk.s, mk.e));
        el.append(mark); last = mk.e;
      }
      el.append(text.slice(last));
      return el;
    });
    const cur = shown[at];
    const card = cur ? h("div", { class: `pm-card t-${cur.t}` },
      h("div", { class: "pm-card-top" }, h("span", { class: "pm-type" }, TYPES[cur.t]), h("span", { class: "num faint" }, `${at + 1} of ${shown.length}`),
        h("span", { class: "grow" }), h("button", { class: "iconbtn", "aria-label": "Previous note", onclick: () => go(at - 1), disabled: at === 0 }, icon("back", 18)), h("button", { class: "iconbtn", "aria-label": "Next note", onclick: () => go(at + 1), disabled: at === shown.length - 1 }, icon("chevron", 18))),
      cur.q ? h("p", { class: "pm-was" }, cur.q) : null,
      cur.b ? h("p", { class: "pm-now" }, cur.b) : null,
      h("p", { class: "pm-w" }, cur.w)) : h("div", { class: "pm-start" }, h("button", { class: "btn primary", onclick: () => go(0) }, `Walk through ${shown.length} notes`));
    return h("div", null,
      h("details", { class: "pm-prompt" }, h("summary", null, "The question"), t.prompt.map((x) => h("p", null, x)), t.image ? h("img", { src: t.image, alt: "The two farm plans, 1950 and today" }) : null),
      legend, h("div", { class: "pm-text" }, paras), h("div", { class: "pm-dock" }, card));
  }
  function go(i) { at = Math.max(0, i); draw(); requestAnimationFrame(() => R.body.querySelector(".pm-mark.on, .pm-gap.on")?.scrollIntoView({ block: "center", behavior: "smooth" })); }

  // the improved version: phrases to keep
  function better(t) {
    const v = t.improved, all = [];
    const paras = v.paras.map((text) => {
      const el = h("p", { class: "pm-p" }); let rest = text;
      const hits = v.chunks.map((c) => ({ c, j: text.indexOf(c) })).filter((x) => x.j >= 0).sort((a, b) => a.j - b.j);
      let last = 0;
      for (const { c, j } of hits) {
        if (j < last) continue;
        el.append(text.slice(last, j));
        const b = tap("chunk pm-chunk", kept("writing", c) ? "kept" : "", async () => {
          if (kept("writing", c)) { await unkeep("writing", c); b.classList.remove("kept"); toast("Taken out of Writing phrases."); }
          else { await keep("writing", c, sentenceOf(text, j)); b.classList.add("kept"); toast(`“${c}” is in Writing phrases.`); }
        }, c);
        all.push([c, sentenceOf(text, j)]); el.append(b); last = j + c.length;
      }
      el.append(text.slice(last)); void rest;
      return el;
    });
    const keepAll = h("button", { class: "btn small", onclick: async () => { for (const [c, s] of all) await keep("writing", c, s); R.body.querySelectorAll(".pm-text .chunk").forEach((x) => x.classList.add("kept")); toast("Kept in Writing phrases."); } }, `Keep all ${all.length}`);
    return h("div", null,
      v.sub ? h("p", { class: "pm-subline" }, v.sub) : null,
      h("div", { class: "pm-text" }, paras),
      h("div", { class: "sp-keep" }, h("span", { class: "tiny muted grow" }, "Tap a highlighted phrase to keep it in Writing phrases."), keepAll),
      h("h3", { class: "pm-h3" }, "Use them elsewhere"),
      h("ul", { class: "pm-bank" }, v.bank.map(([p, ex]) => h("li", null, h("b", null, p), h("span", null, ex)))));
  }

  function crit(t) {
    return h("div", { class: "pm-crit" }, t.crit.map(([name, good, hold]) => h("article", { class: "pm-c" },
      h("h3", null, name),
      h("div", { class: "pm-c-row ok" }, h("small", null, "What works"), h("p", null, good)),
      h("div", { class: "pm-c-row hold" }, h("small", null, "What holds it back"), h("p", null, hold)))));
  }
  draw();
}
// a highlight that wraps with the line like text, and still works as a button (tap, Enter, Space)
function tap(base, extra, fn, label) {
  const el = h("span", { class: `${base} ${extra}`.trim(), role: "button", tabindex: "0" }, label);
  el.addEventListener("click", fn); el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } });
  return el;
}
const words = (ps) => ps.join(" ").split(/\s+/).filter(Boolean).length;
const sentenceOf = (text, at) => { const s = text.lastIndexOf(".", at) + 1, e = text.indexOf(".", at); return text.slice(s, e < 0 ? undefined : e + 1).trim(); };
