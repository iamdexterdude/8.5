// The progress report: one self-contained HTML dashboard that she shares with her teacher.
// It is built on her device from her own data; nothing is uploaded anywhere.
import { h, icon, todayISO, uid } from "./util.js";
import * as store from "./store.js";
import * as db from "./db.js";
import * as srs from "./srs.js";
import { writingBand, rawToBand } from "./bands.js";
import { toast } from "./ui.js";
import { cpResults } from "./views/progress.js";

const tashkentDate = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent" }).format(new Date(iso));
const blobToDataUrl = (blob) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => res(null); r.readAsDataURL(blob); });
const bufToB64 = (buf) => { let s = ""; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };

// everything the dashboard shows, as plain data
export async function collect({ includeAudio = false } = {}) {
  const S = store.S, today = todayISO(), plan = S.plan, now = new Date();
  const days = plan.days.map((d) => {
    const items = store.dayItems(d).map((t) => {
      const st = S.tasks[t.key] || {};
      const late = !!(st.done && st.doneAt && tashkentDate(st.doneAt) > d.date);
      return { text: t.text, block: t.block, minutes: t.minutes || 0, done: !!st.done, doneAt: st.doneAt || null, lesson: !!t.lesson, late };
    });
    const minDone = ["speak", "read", "fix"].filter((b) => S.tasks[`${d.date}|min|${b}`]?.done).length;
    return { date: d.date, dow: d.dow, type: d.type, title: d.title, lessonNo: d.lessonNo || null, checkpoint: !!d.checkpoint, week: d.week, items, minDone };
  });
  const study = Object.fromEntries(Object.entries(S.study).map(([k, v]) => [k, v.minutes]));
  const minimumDays = plan.days.filter((d) => store.minimumDay(d.date)).map((d) => d.date);

  const est = store.estimate();
  const baseline = { listening: 8.5, reading: 7.5, writing: writingBand(6, 6.5), speaking: null };
  // writing band over time: Task 2 counts double
  const w1 = S.scores.filter((s) => s.skill === "writing1").sort((a, b) => a.date.localeCompare(b.date)), w2 = S.scores.filter((s) => s.skill === "writing2").sort((a, b) => a.date.localeCompare(b.date));
  const wDates = [...new Set([...w1, ...w2].map((s) => s.date))].sort();
  const writingSeries = wDates.map((d) => ({ d, v: writingBand(w1.filter((s) => s.date <= d).at(-1)?.band ?? null, w2.filter((s) => s.date <= d).at(-1)?.band ?? null) })).filter((p) => p.v != null);

  const cur = store.currentSkills();
  const checkpoints = plan.checkpoints.map((cp) => { const r = cpResults(cp, cur), early = today < cp.from; return { name: cp.name, dates: cp.dates, rows: ["Speaking", "Writing", "Reading", "Listening"].map((sk) => ({ skill: sk, target: cp.targets[sk], result: early ? "–" : r[sk].text, pass: early ? null : r[sk].pass })) }; });

  const essays = (await db.all("essays")).map((e) => ({ id: e.id, createdAt: e.createdAt, part: e.part, promptId: e.promptId, promptText: e.promptText, words: e.words, seconds: e.seconds, minutes: e.minutes, rewrite: !!e.rewrite,
    text: e.text, plan: e.plan || "", skipPlan: e.skipReason || "", band: e.bands?.overall ?? null, checksDone: (e.checks || []).filter(Boolean).length, checksTotal: (e.checks || []).length ? (e.part === 1 ? 4 : 5) : 0 }));
  const recordings = [];
  for (const r of (await db.all("recordings")).sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const row = { id: r.id, createdAt: r.createdAt, date: r.date, part: r.part, prompt: r.prompt, seconds: r.seconds, attempts: r.attempts || 1, lessonNo: r.lessonNo || null, mode: r.mode || "" };
    if (includeAudio && r.blob) row.audio = await blobToDataUrl(r.blob);
    recordings.push(row);
  }
  const reading = (await db.all("reading")).map((r) => ({ date: r.date, source: r.source, type: r.type, raw: r.raw, total: r.total, minutesUsed: r.minutesUsed, causes: r.causes || {} }));
  const log = await db.all("reviewlog"), reviews = {};
  for (const l of log) { const d = tashkentDate(l.at); const o = (reviews[d] ||= { n: 0, again: 0, hard: 0, good: 0, easy: 0 }); o.n++; o[["", "again", "hard", "good", "easy"][l.rating]]++; }
  const cards = { total: S.cards.length, started: S.cards.filter((c) => c.fsrs).length, due: S.cards.filter((c) => c.fsrs && new Date(c.fsrs.due) <= now).length,
    leeches: S.cards.filter(srs.isLeech).map((c) => ({ front: c.front, lapses: c.fsrs.lapses })) };
  const errors = S.errors.map((e) => ({ pattern: e.pattern, wrote: e.wrote, correct: e.correct, seen: e.seen, status: e.status, source: e.source, firstSeen: e.firstSeen, lastSeen: e.lastSeen, fromPlan: !!e.fromPlan }));

  return { app: "8.5", generatedAt: now.toISOString(), name: store.setting("name") || "", today, planStart: plan.start, planEnd: plan.end, target: S.config.target, aims: S.config.skillTargets,
    est, baseline, scores: S.scores.map((s) => ({ skill: s.skill, date: s.date, band: s.band ?? (s.raw != null && S.config.rawToBand[s.skill] ? rawToBand(S.config.rawToBand[s.skill], s.raw) : null), raw: s.raw ?? null, note: s.note || "", baseline: !!s.baseline })), writingSeries, checkpoints,
    days, study, minimumDays, streak: store.streak(today), essays, recordings, reading, reviews, reviewTotal: log.length, cards, errors };
}

export async function buildReportHtml(opts = {}) {
  const [tpl, f1, f2] = await Promise.all([fetch("report/template.html").then((r) => r.text()), fetch("fonts/display.woff2").then((r) => r.arrayBuffer()).catch(() => null), fetch("fonts/text.woff2").then((r) => r.arrayBuffer()).catch(() => null)]);
  const data = await collect(opts);
  const BS = String.fromCharCode(92); // a backslash, so the escapes below stay as text
  const json = JSON.stringify(data).replace(/</g, BS + "u003c").split(String.fromCharCode(8232)).join(BS + "u2028").split(String.fromCharCode(8233)).join(BS + "u2029");
  const fonts = (f1 ? `@font-face{font-family:"Bricolage";src:url(data:font/woff2;base64,${bufToB64(f1)}) format("woff2");font-weight:200 800}` : "") + (f2 ? `@font-face{font-family:"Instrument";src:url(data:font/woff2;base64,${bufToB64(f2)}) format("woff2");font-weight:400 700}` : "");
  const html = tpl.replace("/*FONTS*/", () => fonts).replace("/*DATA*/", () => json);
  const who = (store.setting("name") || "student").toString().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "student";
  return { html, filename: `8.5-progress-${who}-${data.today}.html`, data };
}

async function make(opts) {
  const { html, filename } = await buildReportHtml(opts);
  return { blob: new Blob([html], { type: "text/html" }), filename };
}
function download(blob, filename) {
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: filename });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export async function shareReport(opts) {
  const { blob, filename } = await make(opts);
  const file = new File([blob], filename, { type: "text/html" });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: "8.5 progress report", text: "My 8.5 progress report. Open the file in a browser." }); return "shared"; }
    catch (e) { if (e.name === "AbortError") return "cancelled"; }
  }
  download(blob, filename); return "saved";
}
export async function saveReport(opts) { const { blob, filename } = await make(opts); download(blob, filename); return filename; }
export async function previewReport(opts) { const { blob } = await make(opts); window.open(URL.createObjectURL(blob), "_blank"); }

// the card on Progress and Today (Sunday)
export function reportCard({ compact = false } = {}) {
  const audio = h("input", { type: "checkbox", id: "rep-audio" });
  const msg = h("div", { class: "small muted", "aria-live": "polite" });
  const run = async (fn, label) => { msg.textContent = "Building the report…"; try { const r = await fn({ includeAudio: audio.checked }); msg.textContent = r === "shared" ? "Shared." : r === "cancelled" ? "" : "Saved to your downloads. Send the file to your teacher in Telegram."; } catch (e) { console.error(e); msg.textContent = "The report could not be built. Reload the page and try again."; } };
  const canShare = !!navigator.canShare;
  return h("section", { class: "section no-print" }, h("div", { class: "shead" }, h("h2", null, "Send your progress to your teacher")),
    h("p", { class: "small muted" }, "This makes one file with your charts, essays, scores and mistakes. Your teacher opens it in any browser and sees everything you did. It is built on your device and goes nowhere until you send it."),
    h("label", { style: { display: "flex", gap: "10px", alignItems: "center", minHeight: "44px" } }, audio, h("span", null, "Include my recordings (a bigger file)")),
    h("div", { class: "row-actions", style: { marginTop: "6px" } },
      canShare ? h("button", { class: "btn primary", onclick: () => run(shareReport) }, icon("upload", 18), "Share report") : null,
      h("button", { class: "btn" + (canShare ? "" : " primary"), onclick: () => run(async (o) => { await saveReport(o); return "saved"; }) }, icon("download", 18), "Save report file"),
      h("button", { class: "btn", onclick: () => run(async (o) => { await previewReport(o); return "cancelled"; }) }, "Preview")),
    msg);
}
