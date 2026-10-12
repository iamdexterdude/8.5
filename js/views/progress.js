// Progress: band board, calculator, checkpoints, charts, then and now.
import { h, icon, fmtShort, todayISO, addDays, diffDays, mmss } from "../util.js";
import * as store from "../store.js";
import * as db from "../db.js";
import { head, toast, sheet } from "../ui.js";
import { overall, rawToBand, nextHalfBand, writingBand, speakingBand, minAverageFor } from "../bands.js";
import { bandBlock } from "./bandblock.js";
import { ikat } from "./welcome.js";

export const live = true;
const f1 = (x) => (x == null ? "–" : Number(x).toFixed(1));
const SKILLS = [["listening", "Listening"], ["reading", "Reading"], ["writing", "Writing"], ["speaking", "Speaking"]];
const HALVES = Array.from({ length: 15 }, (_, i) => 9 - i * 0.5);

export default async function (ctx) {
  const S = store.S;
  const root = h("div");
  root.append(head("Progress", { sub: "Where you stand against band 8" }));
  root.append(bandBlock());

  const cur = store.currentSkills();
  root.append(h("div", { class: "row-actions", style: { marginTop: "6px" } }, h("button", { class: "btn primary", onclick: addResult }, icon("plus", 18), "Add a result")));

  root.append(calculator(cur));
  root.append(routes());
  root.append(checkpoints(cur));
  root.append(await charts());
  root.append(await thenNow());
  root.append(resultsList());
  return root;
}

// ---------- add a result ----------
function addResult() {
  const S = store.S;
  const kind = h("select", { "aria-label": "What are you adding?" }, [["listening", "Listening, raw score"], ["reading", "Reading, raw score"], ["writing1", "Writing Task 1, band"], ["writing2", "Writing Task 2, band"], ["speaking", "Speaking, four criteria"]].map(([k, l]) => h("option", { value: k }, l)));
  const raw = h("input", { type: "number", min: 0, max: 40, inputMode: "numeric", "aria-label": "Raw score out of 40" });
  const bandSel = h("select", { "aria-label": "Band" }, HALVES.map((b) => h("option", { value: b }, b.toFixed(1))));
  const crit = ["Fluency and coherence", "Lexical resource", "Grammatical range and accuracy", "Pronunciation"].map((n) => h("select", { "aria-label": n }, HALVES.map((b) => h("option", { value: b, selected: b === 6.5 }, b.toFixed(1)))));
  const note = h("input", { type: "text", placeholder: "Note (for example: Lesson 6 mock, scored by your teacher)", "aria-label": "Note" });
  const area = h("div");
  const draw = () => {
    const k = kind.value; area.replaceChildren();
    if (k === "listening" || k === "reading") area.append(h("div", { class: "field" }, h("label", null, "Raw score out of 40"), raw));
    else if (k === "speaking") area.append(h("div", { class: "field" }, ["Fluency and coherence", "Lexical resource", "Grammatical range and accuracy", "Pronunciation"].map((n, i) => h("div", null, h("label", { class: "small muted" }, n), crit[i]))));
    else area.append(h("div", { class: "field" }, h("label", null, "Band"), bandSel));
  };
  kind.onchange = draw; draw();
  return sheet((close) => h("div", null, h("h2", null, "Add a result"), h("div", { class: "field", style: { marginTop: "12px" } }, kind), area, h("div", { class: "field" }, note),
    h("div", { class: "row-actions", style: { justifyContent: "flex-end" } }, h("button", { class: "btn", onclick: close }, "Cancel"), h("button", { class: "btn primary", onclick: async () => {
      const k = kind.value, n = note.value.trim();
      if (k === "listening" || k === "reading") { const v = Number(raw.value); if (!raw.value || v < 0 || v > 40) { toast("Enter a score from 0 to 40."); return; } await store.addScore({ skill: k, raw: v, note: n }); }
      else if (k === "speaking") { const c = crit.map((s) => Number(s.value)); await store.addScore({ skill: "speaking", criteria: c, band: speakingBand(c), note: n }); }
      else await store.addScore({ skill: k, band: Number(bandSel.value), note: n });
      close(); toast("Result saved. Your estimate has updated.");
    } }, "Save"))));
}

// ---------- calculator ----------
function calculator(cur) {
  const S = store.S;
  const vals = { listening: cur.listening ?? 8.5, reading: cur.reading ?? 7.5, writing: cur.writing ?? 7, speaking: cur.speaking ?? 7 };
  const out = h("b", { class: "num" }), next = h("div", { class: "small muted" }), need = h("div", { class: "small muted" });
  const selects = Object.fromEntries(SKILLS.map(([k, l]) => [k, h("select", { "aria-label": l, onchange: (e) => { vals[k] = Number(e.target.value); upd(); } }, HALVES.map((b) => h("option", { value: b, selected: b === vals[k] }, b.toFixed(1))))]));
  const upd = () => {
    const o = overall(vals.listening, vals.reading, vals.writing, vals.speaking), avg = (vals.listening + vals.reading + vals.writing + vals.speaking) / 4;
    out.textContent = f1(o);
    need.textContent = `Average ${avg.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}. Overall 8 needs an average of ${minAverageFor(8)}, because .75 rounds up.`;
    const nb = nextHalfBand(vals);
    next.replaceChildren(...SKILLS.map(([k, l]) => nb.bySkill[k] ? h("div", null, `${l} +0.5: overall ${f1(nb.bySkill[k].overall)}${nb.bySkill[k].gain > 0 ? ", it moves the overall" : ", no change to the overall"}`) : null));
  };
  const node = h("section", { class: "section" }, h("div", { class: "shead" }, h("h2", null, "Band calculator")),
    h("div", { class: "calc" }, SKILLS.map(([k, l]) => h("div", { class: "field", style: { margin: 0 } }, h("label", null, l), selects[k])), h("div", { class: "out" }, out, h("div", null, h("div", { class: "kicker" }, "Overall"), need))), next);
  upd();
  // raw score converter, from config
  const rs = h("input", { type: "number", min: 0, max: 40, inputMode: "numeric", "aria-label": "Raw score", style: { width: "90px" } });
  const rsOut = h("span", { class: "num", style: { fontWeight: 600 } });
  const sk = h("select", { "aria-label": "Test", style: { width: "auto" } }, h("option", { value: "reading" }, "Reading"), h("option", { value: "listening" }, "Listening"));
  const conv = () => { const v = Number(rs.value); rsOut.textContent = rs.value === "" ? "" : `= band ${f1(rawToBand(S.config.rawToBand[sk.value], v))}`; };
  rs.oninput = conv; sk.onchange = conv;
  node.append(h("div", { class: "row-actions", style: { marginTop: "14px" } }, h("span", { class: "muted" }, "Raw score to band:"), sk, rs, h("span", null, "/ 40"), rsOut));
  return node;
}

// ---------- routes A to E ----------
function routes() {
  const S = store.S, cur = store.currentSkills();
  return h("section", { class: "section" }, h("div", { class: "shead" }, h("h2", null, "Routes to 8 and 8.5")),
    h("p", { class: "small muted" }, "Every route assumes listening holds at 8.5."),
    h("table", { class: "t" }, h("thead", null, h("tr", null, ["Route", "Reading", "Writing", "Speaking", "Overall"].map((x) => h("th", null, x)))),
      h("tbody", null, S.plan.routes.map((r) => {
        const ok = (k) => cur[k] != null && cur[k] >= r[k];
        const c = (k) => h("td", { class: "n", style: { color: ok(k) ? "var(--ok)" : "" } }, f1(r[k]), ok(k) ? h("span", { class: "sr" }, " reached") : null);
        return h("tr", null, h("td", null, h("b", null, r.route)), c("reading"), c("writing"), c("speaking"), h("td", { class: "n" }, f1(r.overall)));
      }))));
}

// ---------- checkpoints ----------
function checkpoints(cur) {
  const S = store.S, today = todayISO();
  const sec = h("section", { class: "section" }, h("div", { class: "shead" }, h("h2", null, "Checkpoints")));
  const live = S.plan.checkpoints.find((c) => today >= c.from && today <= c.to);
  if (live) sec.append(h("div", { class: "checkpoint-card", style: { marginBottom: "16px", background: "#0B1120", color: "#F4F1E8" } }, ikat({ opacity: .35 }), h("div", { style: { position: "relative" } }, h("h3", null, `Today is ${live.name}`), h("p", { style: { margin: "4px 0 0", opacity: .85 } }, "Add your results below as you finish each part."))));
  for (const cp of S.plan.checkpoints) {
    const results = cpResults(cp, cur);
    const box = h("div", { style: { marginBottom: "22px" } }, h("h3", null, `${cp.name}, ${cp.dates}`),
      h("table", { class: "t" }, h("thead", null, h("tr", null, ["Skill", "Target", "Result", ""].map((x) => h("th", null, x)))),
        h("tbody", null, ["Speaking", "Writing", "Reading", "Listening"].map((sk) => {
          const r = results[sk];
          return h("tr", null, h("td", null, sk), h("td", null, cp.targets[sk]), h("td", { class: "n" }, r.text), h("td", { class: r.pass == null ? "faint" : r.pass ? "passed" : "missed" }, r.pass == null ? "Not yet" : r.pass ? "Passed" : "Missed"));
        }))));
    sec.append(box);
  }
  sec.append(h("div", { class: "row-actions no-print" }, h("button", { class: "btn", onclick: () => printReport(cur) }, icon("download", 18), "Checkpoint report")));
  sec.append(h("p", { class: "small faint" }, "A missed checkpoint moves lesson time to that skill in Month 2."));
  return sec;
}
// pass or miss per skill, from the latest result on or before the checkpoint's last day
function cpResults(cp, cur) {
  const S = store.S, upto = (s) => s.date <= cp.to && !s.baseline;
  const latest = (skill) => S.scores.filter((s) => s.skill === skill && upto(s)).sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  const out = {};
  const bs = S.scores.filter((s) => s.skill === "speaking").sort((a, b) => a.date.localeCompare(b.date));
  const spk = latest("speaking"), baseSpk = bs[0];
  out.Speaking = spk ? { text: f1(spk.band), pass: cp.id === "cp1" ? (baseSpk && spk !== baseSpk ? spk.band >= baseSpk.band + 0.5 : null) : spk.band >= 7 } : { text: "–", pass: null };
  const w1 = latest("writing1"), w2 = latest("writing2");
  out.Writing = (w1 || w2) ? { text: `T1 ${f1(w1?.band)}, T2 ${f1(w2?.band)}`, pass: cp.id === "cp1" ? (Math.max(w1?.band ?? 0, w2?.band ?? 0) >= 7) : ((w1?.band ?? 0) >= 7 && (w2?.band ?? 0) >= 7) } : { text: "–", pass: null };
  const rd = latest("reading"); const rmin = cp.id === "cp1" ? 35 : 36;
  out.Reading = rd?.raw != null ? { text: `${rd.raw}/40`, pass: rd.raw >= rmin } : { text: "–", pass: null };
  const ls = latest("listening");
  out.Listening = ls?.raw != null ? { text: `${ls.raw}/40`, pass: ls.raw >= 36 } : { text: "–", pass: null };
  return out;
}
function printReport(cur) {
  const S = store.S, e = store.estimate();
  const doc = h("div", { class: "fullscreen", style: { background: "#fff", color: "#000" } },
    h("div", { class: "inner" }, h("div", { class: "no-print row-actions", style: { marginBottom: "12px" } }, h("button", { class: "btn primary", onclick: () => window.print() }, "Print or save as PDF"), h("button", { class: "btn", onclick: () => doc.remove() }, "Close")),
      h("h1", null, "Eight, checkpoint report"), h("p", null, `${store.setting("name") || ""} ${todayISO()}`),
      h("p", null, `Estimated overall: ${f1(e.overall)}. Target: ${S.config.target}.${e.assumed ? " Speaking is not scored yet." : ""}`),
      ...S.plan.checkpoints.map((cp) => { const r = cpResults(cp, cur); return h("div", null, h("h2", { style: { marginTop: "16px" } }, `${cp.name}, ${cp.dates}`),
        h("table", { class: "t" }, h("tbody", null, ["Speaking", "Writing", "Reading", "Listening"].map((sk) => h("tr", null, h("td", null, sk), h("td", null, cp.targets[sk]), h("td", { class: "n" }, r[sk].text), h("td", null, r[sk].pass == null ? "Not yet" : r[sk].pass ? "Passed" : "Missed")))))); })));
  document.body.append(doc);
}

// ---------- charts ----------
async function charts() {
  const S = store.S, sec = h("section", { class: "section" }, h("div", { class: "shead" }, h("h2", null, "Over time")));
  // band per skill over time
  const series = [["reading", "Reading"], ["writing1", "Writing T1"], ["writing2", "Writing T2"], ["speaking", "Speaking"], ["listening", "Listening"]];
  const pts = (k) => S.scores.filter((s) => s.skill === k).map((s) => ({ d: s.date, v: s.band ?? (s.raw != null ? rawToBand(S.config.rawToBand[k], s.raw) : null) })).filter((p) => p.v != null).sort((a, b) => a.d.localeCompare(b.d));
  sec.append(h("h3", { style: { fontSize: "15px", margin: "8px 0" } }, "Band per skill"), lineChart(series.map(([k, l]) => ({ name: l, key: k, pts: pts(k) }))));
  // minutes studied per day
  const days = S.plan.days.filter((d) => d.date <= todayISO() && d.type !== "off");
  const data = days.map((d) => { const st = S.study[d.date]?.minutes || 0, planned = store.dayProgress(d).minutesDone; return { d: d.date, v: Math.max(st, planned) }; });
  sec.append(h("h3", { style: { fontSize: "15px", margin: "18px 0 8px" } }, "Minutes studied per day"), data.length ? barChart(data) : h("p", { class: "muted small" }, "Your days will appear here as you work."));
  // streak
  sec.append(h("p", { class: "muted small", style: { marginTop: "10px" } }, `Day streak: ${store.streak(todayISO())}. Sundays and minimum days don't break it.`));
  return sec;
}
function svgEl(n, a = {}, kids = []) { const e = document.createElementNS("http://www.w3.org/2000/svg", n); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); for (const c of kids) e.append(c); return e; }
const txt = (x, y, t, a = {}) => { const e = svgEl("text", { x, y, ...a }); e.textContent = t; return e; };
const COLORS = { reading: "var(--sk-read)", writing1: "var(--sk-write)", writing2: "var(--accent)", speaking: "var(--sk-speak)", listening: "var(--sk-listen)" };
function lineChart(series) {
  const W = 640, H = 220, L = 34, R = 12, T = 10, B = 28;
  const all = series.flatMap((s) => s.pts); if (!all.length) return h("p", { class: "muted small" }, "No results yet.");
  const dates = [...new Set(all.map((p) => p.d))].sort(); const d0 = dates[0], d1 = dates.at(-1) === dates[0] ? addDays(dates[0], 14) : dates.at(-1);
  const span = Math.max(1, diffDays(d0, d1)); const y = (v) => T + (H - T - B) * (1 - (v - 5) / 4), x = (d) => L + (W - L - R) * (diffDays(d0, d) / span);
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart", role: "img", "aria-label": "Band per skill over time" });
  for (const v of [5, 6, 7, 8, 9]) { svg.append(svgEl("line", { x1: L, x2: W - R, y1: y(v), y2: y(v), class: "grid", "stroke-width": 1, ...(v === 8 ? { "stroke-dasharray": "4 4", stroke: "var(--text-3)" } : {}) }), txt(4, y(v) + 4, String(v))); }
  svg.append(txt(L, H - 8, fmtShort(d0)), txt(W - R, H - 8, fmtShort(d1), { "text-anchor": "end" }));
  for (const s of series) { if (!s.pts.length) continue; const c = COLORS[s.key];
    svg.append(svgEl("polyline", { points: s.pts.map((p) => `${x(p.d)},${y(p.v)}`).join(" "), fill: "none", stroke: c, "stroke-width": 2.5, "stroke-linejoin": "round" }));
    for (const p of s.pts) svg.append(svgEl("circle", { cx: x(p.d), cy: y(p.v), r: 4, fill: c }, [svgEl("title", {}, [document.createTextNode(`${s.name} ${p.v.toFixed(1)}, ${fmtShort(p.d)}`)])])); }
  const legend = h("div", { class: "row-actions small", style: { gap: "14px" } }, series.filter((s) => s.pts.length).map((s) => h("span", { style: { display: "inline-flex", alignItems: "center", gap: "6px" } }, h("span", { style: { width: "18px", height: "3px", background: COLORS[s.key], display: "inline-block" } }), s.name)));
  return h("div", null, svg, legend);
}
function barChart(data) {
  const W = 640, H = 160, L = 30, R = 8, T = 8, B = 24, max = Math.max(60, ...data.map((d) => d.v));
  const bw = (W - L - R) / data.length; const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart", role: "img", "aria-label": "Minutes studied per day" });
  const top = Math.ceil(max / 30) * 30;
  for (const v of [0, top / 2, top]) { const yy = T + (H - T - B) * (1 - v / top); svg.append(svgEl("line", { x1: L, x2: W - R, y1: yy, y2: yy, class: "grid" }), txt(2, yy + 4, String(v))); }
  data.forEach((d, i) => { const hh = (H - T - B) * (d.v / top); svg.append(svgEl("rect", { x: L + i * bw + 2, y: H - B - hh, width: Math.max(2, bw - 4), height: hh, rx: 3, fill: "var(--accent)" }, [svgEl("title", {}, [document.createTextNode(`${fmtShort(d.d)}: ${d.v} min`)])])); });
  svg.append(txt(L, H - 6, fmtShort(data[0].d)), txt(W - R, H - 6, fmtShort(data.at(-1).d), { "text-anchor": "end" }));
  return svg;
}

// ---------- then and now ----------
async function thenNow() {
  const recs = (await db.all("recordings")).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const sec = h("section", { class: "section" }, h("div", { class: "shead" }, h("h2", null, "Then and now")));
  const baseline = recs.find((r) => r.lessonNo === 1) || recs.find((r) => r.part === 2);
  const latest = [...recs].reverse().find((r) => r.part === 2 && r !== baseline);
  const imported = await db.get("kv", "baseline-audio");
  if (!baseline && !imported) { sec.append(h("p", { class: "muted" }, "Your Lesson 1 recording will sit here next to your latest Part 2 answer. Record Lesson 1's mock in the Speaking studio, or load an audio file from the lesson.")); }
  const col = (title, rec) => h("div", { style: { flex: "1 1 240px" } }, h("h3", { style: { fontSize: "15px" } }, title), rec ? [h("div", { class: "small muted" }, `${fmtShort(rec.date)}, ${mmss(rec.seconds)}`), h("audio", { controls: true, src: URL.createObjectURL(rec.blob), style: { width: "100%", marginTop: "6px" } })] : h("p", { class: "small muted" }, "Not recorded yet."));
  if (baseline || latest) sec.append(h("div", { style: { display: "flex", gap: "20px", flexWrap: "wrap" } }, col("Then, " + (baseline?.lessonNo === 1 ? "Lesson 1" : "first Part 2"), baseline), col("Now, latest Part 2", latest)));
  const file = h("input", { type: "file", accept: "audio/*,.m4a,.mp3,.ogg,.webm,.wav", "aria-label": "Load the Lesson 1 audio file", onchange: async (e) => { const f = e.target.files[0]; if (!f) return; await db.put("recordings", { id: "baseline", createdAt: "2026-10-12T00:00:00.000Z", date: "2026-10-12", part: 2, prompt: "Lesson 1 baseline mock", seconds: 0, blob: f, mime: f.type, lessonNo: 1, mode: "baseline" }); toast("Lesson 1 audio loaded."); location.reload(); } });
  sec.append(h("div", { class: "field", style: { marginTop: "14px" } }, h("label", null, "Load the Lesson 1 recording from a file (m4a, mp3, ogg, webm or wav)"), file));
  return sec;
}

function resultsList() {
  const S = store.S, rows = [...S.scores].sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id));
  const names = { listening: "Listening", reading: "Reading", writing1: "Writing Task 1", writing2: "Writing Task 2", speaking: "Speaking" };
  return h("section", { class: "section" }, h("div", { class: "shead" }, h("h2", null, "All results")),
    h("ul", { class: "rows" }, rows.map((s) => h("li", null, h("div", { class: "row", style: { minHeight: "48px" } },
      h("div", { class: "grow" }, h("div", { class: "title small" }, names[s.skill]), h("div", { class: "sub" }, `${fmtShort(s.date)}${s.note ? ", " + s.note : ""}`)),
      h("b", { class: "num" }, s.raw != null ? `${s.raw}/40` : f1(s.band)),
      !s.baseline ? h("button", { class: "btn small quiet danger", "aria-label": "Delete result", onclick: () => store.removeScore(s.id) }, icon("trash", 18)) : null)))));
}
