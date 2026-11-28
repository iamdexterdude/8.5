// Feedback and review for one mock: every mistake in Listening and Reading explained, Writing sentence by sentence,
// Speaking answer by answer with a better version. Written by the marker on the teacher's PC (results/<mock>--<student>.json).
import { h, icon } from "../util.js";
import * as hw from "../homework.js";
import * as M from "../mocks.js";
import { toast } from "../ui.js";
import { keep, kept } from "./rooms.js";

export default async function (ctx) {
  const id = ctx.params[0];
  const had = JSON.stringify(M.estimate(id) || null);   // marks that arrive while she reads appear without a tap
  hw.refresh(undefined, { force: true }).then(() => { if (location.hash.startsWith("#/review/" + id) && JSON.stringify(M.estimate(id) || null) !== had) ctx.rerender(); }).catch(() => {});
  const m = (hw.F.mocks || []).find((x) => x.id === id);
  const root = h("div", { class: "review" });
  if (!m) { root.append(h("p", { class: "muted" }, "This mock is not here.")); return root; }
  const done = M.SECTIONS.filter((s) => M.attempt(id, s)?.status === "done");
  const sec = done.includes(ctx.params[1]) ? ctx.params[1] : done[0];
  const est = M.estimate(id) || {};
  root.append(h("header", { class: "rv-head" },
    h("a", { class: "btn small quiet", href: "#/mock" }, icon("back", 16), "Mocks"),
    h("div", { class: "kicker" }, m.title || m.id), h("h1", null, "Feedback & review")));
  if (!sec) { root.append(h("p", { class: "muted" }, "Finish a part of this mock and its review appears here.")); return root; }
  root.append(h("nav", { class: "seg rv-tabs", "aria-label": "Part" }, done.map((s) => h("a", { class: "chip" + (s === sec ? " on" : ""), href: `#/review/${id}/${s}`, "aria-current": s === sec ? "page" : null }, M.LABEL[s]))));
  const a = M.attempt(id, sec), r = est[sec] || {};
  root.append(sec === "listening" || sec === "reading" ? lr(a, r) : sec === "writing" ? writing(a, r) : speaking(a, r));
  return root;
}

const waiting = () => h("p", { class: "rv-wait" }, "Your review is being written. It appears here a few minutes after you finish.");
const lines = (title, list) => (list || []).length ? h("section", { class: "rv-box" }, h("h3", null, title), h("ul", null, list.map((x) => h("li", null, x)))) : null;

function lr(a, r) {
  const box = h("div", { class: "rv-body" });
  box.append(h("p", { class: "lead num" }, h("b", null, a.band?.toFixed?.(1) ?? "–"), ` · ${a.raw} of ${a.total} correct`));
  if (r.note) box.append(h("p", { class: "rv-note" }, r.note));
  const mistakes = r.review?.mistakes;
  if (!mistakes) {
    box.append(waiting());
    box.append(h("ol", { class: "answers" }, (a.detail || []).filter((d) => !d.ok).map((d) => h("li", { class: "no" }, h("span", { class: "n num" }, d.n), h("span", { class: "mine" }, d.mine || "—"), h("span", { class: "key" }, d.key)))));
    return box;
  }
  box.append(lines("What your mistakes have in common", r.review.patterns), lines("Practise first", r.review.plan));
  box.append(h("h2", { class: "rv-h2" }, `Your ${mistakes.length} ${mistakes.length === 1 ? "mistake" : "mistakes"}`));
  for (const x of mistakes) box.append(h("article", { class: "rv-card" },
    h("div", { class: "rv-q" }, h("span", { class: "qn num" }, x.n), h("span", { class: "small muted" }, x.type || "")),
    h("p", { class: "rv-ans" }, h("span", { class: "bad" }, x.mine || "blank"), " → ", h("span", { class: "good" }, x.key)),
    x.evidence ? h("blockquote", { class: "rv-ev" }, `“${x.evidence}”`) : null,
    x.why ? h("p", null, x.why) : null,
    x.tip ? h("p", { class: "rv-tip" }, h("b", null, "Next time: "), x.tip) : null));
  return box;
}

function writing(a, r) {
  const box = h("div", { class: "rv-body" });
  if (r.band == null) { box.append(waiting()); for (const [k, t] of Object.entries(a.texts || {})) box.append(h("h3", null, `Task ${k}`), h("div", { class: "essay" }, t)); return box; }
  box.append(h("p", { class: "lead num" }, h("b", null, r.band.toFixed(1)), " Writing"),
    h("div", { class: "chips" }, Object.entries(r.criteria || {}).map(([k, v]) => h("span", { class: "chip on" }, `${NAMES[k] || k} ${Number(v).toFixed(1)}`))));
  if (r.note) box.append(h("p", { class: "rv-note" }, r.note));
  let onlyFix = false;
  const toggle = h("label", { class: "rv-toggle" }, h("input", { type: "checkbox", onchange: (e) => { onlyFix = e.target.checked; box.classList.toggle("only-fix", onlyFix); } }), " Show only the sentences to fix");
  box.append(toggle);
  for (const t of r.review?.tasks || []) {
    const info = (r.tasks || []).find((x) => x.no === t.no) || {};
    const sents = t.sentences || [], bad = sents.filter((s) => !s.ok).length;
    box.append(h("section", { class: "rv-task" },
      h("h2", { class: "rv-h2" }, `Task ${t.no}`, info.band != null ? h("span", { class: "num faint" }, ` · ${Number(info.band).toFixed(1)} · ${info.words ?? "?"} words`) : null),
      info.comment ? h("p", null, info.comment) : null,
      t.structure ? h("p", { class: "small" }, h("b", null, "Structure: "), t.structure) : null,
      t.missing ? h("p", { class: "small" }, h("b", null, "For Band 7+: "), t.missing) : null,
      h("p", { class: "small muted" }, `${sents.length - bad} of ${sents.length} sentences are fine · ${bad} to fix`),
      h("ol", { class: "rv-sents" }, sents.map((s) => h("li", { class: s.ok ? "ok" : "fix" },
        h("p", { class: "orig" }, s.s),
        s.ok ? null : h("p", { class: "better" }, s.better),
        s.ok || !s.why ? null : h("p", { class: "why" }, s.why))))));
  }
  return box;
}

function speaking(a, r) {
  const box = h("div", { class: "rv-body" });
  if (r.band == null) { box.append(waiting()); return box; }
  box.append(h("p", { class: "lead num" }, h("b", null, r.band.toFixed(1)), " Speaking"),
    h("div", { class: "chips" }, Object.entries(r.criteria || {}).map(([k, v]) => h("span", { class: "chip on" }, `${NAMES[k] || k} ${Number(v).toFixed(1)}`))));
  if (r.note) box.append(h("p", { class: "rv-note" }, r.note));
  (r.review?.answers || []).forEach((x, i) => {
    const rec = (a.recordings || [])[i];
    box.append(h("article", { class: "rv-card" },
      h("div", { class: "rv-q" }, h("span", { class: "qn num" }, `P${x.part ?? rec?.part ?? ""}`), h("b", null, x.question || rec?.label || "")),
      rec?.blob ? h("audio", { controls: true, preload: "none", src: rec.url ||= URL.createObjectURL(rec.blob) }) : null,
      x.said ? h("p", { class: "orig" }, h("span", { class: "small muted" }, "You said: "), x.said) : null,
      (x.issues || []).length ? h("ul", { class: "rv-issues" }, x.issues.map((t) => h("li", null, t))) : null,
      x.better ? h("p", { class: "better" }, h("span", { class: "small muted" }, "Better: "), x.better) : null,
      (x.phrases || []).length ? h("div", { class: "chips" }, x.phrases.map((p) => {
        const c = h("button", { class: "chip" + (kept("speaking", p) ? " on" : ""), title: "Keep this phrase in Anki", onclick: async () => { await keep("speaking", p, x.better || ""); c.classList.add("on"); toast(`"${p}" is in Speaking phrases.`); } }, p);
        return c;
      })) : null));
  });
  return box;
}
const NAMES = { "TA/TR": "Task", TA: "Task achievement", TR: "Task response", CC: "Coherence", LR: "Vocabulary", GRA: "Grammar", FC: "Fluency", P: "Pronunciation" };
