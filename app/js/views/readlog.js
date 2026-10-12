// Reading: a 20-minute passage timer (60 for a full test), then a log of the score and the causes of each mistake.
import { h, icon, uid, todayISO, fmtShort } from "../util.js";
import * as store from "../store.js";
import * as db from "../db.js";
import * as srs from "../srs.js";
import { head, ring, makeTimer, chime, toast } from "../ui.js";
import { rawToBand } from "../bands.js";

export const live = false;
const TYPES = ["True/False/Not Given", "Yes/No/Not Given", "Matching headings", "Matching information", "Matching features", "Matching sentence endings", "Summary completion", "Notes, table or flow-chart completion", "Sentence completion", "Short answer", "Multiple choice", "Diagram labelling", "Mixed"];
const CAUSES = [["paraphrase", "Missed paraphrase"], ["fvng", "False vs Not Given"], ["time", "Ran out of time"], ["careless", "Careless"], ["vocab", "Vocabulary"]];

export default async function (ctx) {
  const q = ctx.query, minutes = Number(q.min) || 20, full = minutes >= 60;
  const root = h("div");
  root.append(head("Reading", { back: "#/practice", sub: full ? "A full test, 60 minutes" : "One passage, 20 minutes" }));

  // timer
  const r = ring(minutes * 60, "Reading");
  let started = 0;
  const startBtn = h("button", { class: "btn primary" }, icon("play", 18), "Start timer");
  const t = makeTimer(minutes * 60, { onTick: (s) => r.set(s, minutes * 60), onEnd: () => { chime(); toast("Time is up. Stop writing and log your result."); } });
  ctx.onLeave(() => t.destroy());
  startBtn.onclick = () => { if (t.running) { t.pause(); startBtn.replaceChildren(icon("play", 18), "Resume"); } else { started ||= Date.now(); t.start(); startBtn.replaceChildren(icon("pause", 18), "Pause"); } };
  root.append(h("section", { class: "section" }, r.el, h("div", { class: "row-actions", style: { justifyContent: "center" } }, startBtn),
    h("p", { class: "small muted", style: { textAlign: "center", marginTop: "10px" } }, "Timed means timed. Phone in another room.")));

  // log
  const f = { source: h("input", { type: "text", placeholder: "Cambridge 17, Test 2, Passage 3", "aria-label": "Source" }),
    type: h("select", { "aria-label": "Question type" }, TYPES.map((x) => h("option", null, x))),
    raw: h("input", { type: "number", min: 0, max: 40, inputMode: "numeric", "aria-label": "Raw score" }),
    total: h("select", { "aria-label": "Out of" }, [13, 40].map((n) => h("option", { selected: n === (full ? 40 : 13) }, n))),
    used: h("input", { type: "number", min: 0, max: 90, inputMode: "numeric", "aria-label": "Minutes used", value: minutes }) };
  const causes = Object.fromEntries(CAUSES.map(([k]) => [k, h("input", { type: "number", min: 0, max: 40, value: 0, inputMode: "numeric", "aria-label": k })]));
  const pairText = h("input", { type: "text", placeholder: "What the text said", "aria-label": "Paraphrase: the text" });
  const pairQ = h("input", { type: "text", placeholder: "What the question said", "aria-label": "Paraphrase: the question" });

  const save = async () => {
    const raw = Number(f.raw.value), total = Number(f.total.value);
    if (!f.raw.value || raw < 0 || raw > total) { toast("Enter your raw score, from 0 to " + total + "."); return; }
    const row = { id: uid(), date: todayISO(), source: f.source.value.trim() || "Reading practice", type: f.type.value, raw, total, minutesUsed: Number(f.used.value) || minutes,
      causes: Object.fromEntries(CAUSES.map(([k]) => [k, Number(causes[k].value) || 0])) };
    await db.put("reading", row);
    if (total === 40) await store.addScore({ skill: "reading", raw, note: row.source });
    if (pairText.value.trim() && pairQ.value.trim()) await srs.addCard({ type: "pair", tag: "paraphrase", front: pairQ.value.trim(), back: pairText.value.trim(), prompt: "The question said this. How did the text say it?", source: row.source });
    await store.addStudy(Math.max(1, row.minutesUsed), "reading");
    if (q.task) await store.markDone(q.task, { raw, total });
    toast("Result logged.");
    location.hash = q.session ? "#/session" : "#/today";
  };

  const rows = (await db.all("reading")).sort((a, b) => b.date.localeCompare(a.date));
  root.append(h("section", { class: "section" }, h("div", { class: "shead" }, h("h2", null, "Log your result")),
    h("div", { class: "field" }, h("label", null, "Source"), f.source),
    h("div", { class: "field" }, h("label", null, "Question type"), f.type),
    h("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" } },
      h("div", { class: "field" }, h("label", null, "Score"), f.raw), h("div", { class: "field" }, h("label", null, "Out of"), f.total), h("div", { class: "field" }, h("label", null, "Minutes used"), f.used)),
    h("div", { class: "field" }, h("div", { class: "lbl" }, "Why did you lose marks? Count each cause."),
      h("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "10px" } }, CAUSES.map(([k, l]) => h("div", null, h("label", { class: "small muted" }, l), causes[k])))),
    h("div", { class: "field" }, h("div", { class: "lbl" }, "A paraphrase you missed (optional, becomes a review card)"), pairText, pairQ),
    h("button", { class: "btn primary block", onclick: save }, "Save result")));

  if (rows.length) {
    root.append(h("section", { class: "section" }, h("div", { class: "shead" }, h("h2", null, "Recent results")),
      h("table", { class: "t" }, h("thead", null, h("tr", null, ["Date", "Source", "Score", "Band"].map((x) => h("th", null, x)))),
        h("tbody", null, rows.slice(0, 8).map((r) => h("tr", null, h("td", { class: "n" }, fmtShort(r.date)), h("td", null, r.source), h("td", { class: "n" }, `${r.raw}/${r.total}`), h("td", { class: "n" }, r.total === 40 ? rawToBand(store.S.config.rawToBand.reading, r.raw).toFixed(1) : "–")))))));
  }
  return root;
}
