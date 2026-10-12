// Parses content/month-1-plan.md into app/data/plan.json.
// Usage: node tools/parse-plan.mjs   (re-run after re-exporting the plan)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const MONTHS = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
const YEAR = 2026;
const iso = (d, m) => `${YEAR}-${String(MONTHS[m]).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const strip = (s) => s.replace(/\*\*/g, "").replace(/\*/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").trim();

// "10 min", "1.5 h", "0:15–0:35" -> minutes (or null)
function minutesOf(text) {
  let m = text.match(/(\d+):(\d{2})\s*[–-]\s*(\d+):(\d{2})/);
  if (m) return (+m[3] * 60 + +m[4]) - (+m[1] * 60 + +m[2]);
  m = text.match(/(\d+(?:\.\d+)?)\s*h\b/);
  if (m) return Math.round(+m[1] * 60);
  m = text.match(/(\d+)\s*min/);
  if (m) return +m[1];
  return null;
}

// markdown table lines -> rows of cells (separator row dropped, header kept as row 0)
function tableRows(lines) {
  return lines.filter((l) => l.trim().startsWith("|"))
    .map((l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()))
    .filter((r) => !r.every((c) => /^-+$/.test(c)));
}
// all separate tables inside a list of lines
function tablesIn(lines) {
  const out = []; let cur = [];
  for (const l of lines) {
    if (l.trim().startsWith("|")) cur.push(l);
    else if (cur.length) { out.push(tableRows(cur)); cur = []; }
  }
  if (cur.length) out.push(tableRows(cur));
  return out;
}

export function parsePlan(md) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");

  // ---- sections on "## "
  const sections = []; let cur = null;
  for (const l of lines) {
    if (l.startsWith("## ")) { cur = { title: l.slice(3).trim(), lines: [] }; sections.push(cur); }
    else if (cur) cur.lines.push(l);
  }
  const sec = (prefix) => sections.find((s) => s.title.startsWith(prefix));

  // ---- weeks/phases and days ("### Mon 12 Oct — title")
  const phases = []; const days = [];
  for (const s of sections) {
    const w = s.title.match(/^Week (\d) — (.+?) \((.+)\)$/);
    if (!w) continue;
    const week = +w[1], phase = w[2];
    const intro = s.lines.find((l) => l.trim() && !l.startsWith("#"));
    phases.push({ week, name: phase, dates: w[3], intro: strip(intro || "") });
    let d = null;
    for (const l of s.lines) {
      if (l.startsWith("### ")) {
        const m = l.match(/^### (\w{3}) (\d+) (\w{3}) — (.+)$/);
        d = { date: iso(m[2], m[3]), dow: m[1], week, phase, title: m[4].trim(), body: [] };
        days.push(d);
      } else if (d) d.body.push(l);
    }
  }

  // ---- parse every day
  const BLOCKS = { Speak: 50, Write: 70, Read: 45, Fix: 15 };
  const blockOfTest = (t) => /listening/i.test(t) ? "listen" : /writing|rewrite/i.test(t) ? "write" : /reading/i.test(t) ? "read"
    : /speaking|part 2/i.test(t) ? "speak" : /error log|consolidate/i.test(t) ? "fix" : "other";

  for (const d of days) {
    const t = d.title;
    d.type = /^Lesson/.test(t) ? "lesson" : /Self-study/.test(t) ? "self" : /^Full mock/.test(t) ? "fullmock"
      : /Test day/.test(t) ? "test" : /Light day/.test(t) ? "light" : /^Off/.test(t) ? "off" : "other";
    const lm = t.match(/^Lesson (\d+): (.+?)(?: \(checkpoint\))?$/);
    if (lm) { d.lessonNo = +lm[1]; d.lessonTitle = lm[2]; }
    d.checkpoint = /checkpoint/i.test(t);
    d.agenda = []; d.tasks = []; d.homework = []; d.questions = null;
    let mode = "agenda";
    for (const raw of d.body) {
      const l = raw.trim(); if (!l) continue;
      if (/^\*\*Homework/.test(l)) { mode = "hw"; continue; }
      if (/^\*\*Baseline mock questions/.test(l)) { mode = "q"; d.questions = {}; continue; }
      if (mode === "q" && l.startsWith("- **Part")) {
        const m = l.match(/^- \*\*Part (\d)\.\*\* (.+)$/);
        d.questions["part" + m[1]] = strip(m[2]);
        continue;
      }
      if (l.startsWith("- [ ]")) {
        const text = strip(l.slice(5));
        if (d.type === "self") {
          const bm = text.match(/^(Speak|Write|Read|Fix):\s*(.+)$/);
          d.tasks.push({ block: bm[1].toLowerCase(), minutes: BLOCKS[bm[1]], text: bm[2], label: bm[1] });
        } else if (mode === "hw") {
          d.homework.push({ block: "homework", minutes: minutesOf(text), text: text.replace(/\s*\(\d+ min\)$/, "") });
        } else {
          d.tasks.push({ block: blockOfTest(text), minutes: minutesOf(text), text });
        }
        continue;
      }
      if (l.startsWith("- ") && mode === "agenda") {
        const m = l.match(/^- \*\*(.+?)\.\*\* ?(.*)$/);
        if (m) {
          const head = m[1];
          const tm = head.match(/^(\d+:\d{2}[–-]\d+:\d{2}) (.+)$/);
          d.agenda.push({ time: tm ? tm[1] : null, title: tm ? tm[2] : head.replace(/, \d+ min$/, ""),
                          minutes: minutesOf(head), text: strip(m[2]) });
        }
      }
    }
    // stable keys: date|block|position, so a re-import keeps progress when text changes
    const cnt = {};
    for (const x of d.tasks) { cnt[x.block] = (cnt[x.block] || 0) + 1; x.key = `${d.date}|${x.block}|${cnt[x.block]}`; }
    d.homework.forEach((x, i) => { x.key = `${d.date}|hw|${i + 1}`; });
    if (d.type === "lesson") d.lessonKey = `${d.date}|lesson|1`;
    for (const x of [...d.tasks, ...d.homework]) { const pm = x.text.match(/\bP(\d{1,2})\b/); if (pm) x.prompt = "P" + pm[1]; }
    delete d.body;
  }

  // ---- Task 2 prompt bank, error log
  const prompts = tableRows(sec("Task 2 prompt bank").lines).slice(1).map(([id, type, text, used]) => ({ id, type, text, used }));
  const errors = tableRows(sec("Error log").lines).slice(1).map(([source, wrote, correct, pattern, status], i) => ({
    id: "e" + String(i + 1).padStart(2, "0"), source, wrote: strip(wrote), correct: strip(correct), pattern, status }));

  // ---- starting point, routes, checkpoints, roadmap, gates, rhythm, rules, materials
  const mock = tableRows(sec("Starting point").lines).slice(1).map(([skill, result, band, target]) => ({ skill, result, band, target }));
  const tm = tablesIn(sec("Targets and the math").lines);
  const routes = tm[0].slice(1).map(([route, reading, writing, speaking, overall]) => ({ route, reading: +reading, writing: +writing, speaking: +speaking, overall: +overall }));
  const cpRows = tm[1].slice(1);
  const checkpoints = [
    { id: "cp1", name: "Checkpoint 1", dates: "23–24 Oct", from: "2026-10-23", to: "2026-10-24", targets: Object.fromEntries(cpRows.map((r) => [r[0], r[1]])) },
    { id: "cp2", name: "Checkpoint 2", dates: "5–6 Nov", from: "2026-11-05", to: "2026-11-06", targets: Object.fromEntries(cpRows.map((r) => [r[0], r[2]])) },
  ];
  const gl = tablesIn(sec("Month at a glance").lines);
  const roadmap = gl[0].slice(1).map(([phase, week, dates, focus]) => ({ phase, week: +week, dates, focus }));
  const gates = gl[1].slice(1).map(([gate, date, what]) => ({ gate, date, what }));
  const how = sec("How the month works").lines;
  const ruleStart = how.findIndex((l) => l.startsWith("**Rules**"));
  const rules = how.slice(ruleStart).filter((l) => /^\d\. /.test(l)).map((l) => strip(l.replace(/^\d\. /, "")));
  const rhythm = tablesIn(how.slice(0, ruleStart))[0].slice(1).map(([day, what, time]) => ({ day, what, time }));
  const materials = tableRows(sec("Materials").lines).slice(1).map(([resource, usedFor, note]) => ({ resource: strip(resource), usedFor, note: strip(note) }));

  return {
    title: "IELTS 8 — Month 1 Plan", start: "2026-10-12", end: "2026-11-08", tz: "Asia/Tashkent",
    mock, routes, checkpoints, roadmap, gates, rhythm, rules, materials, phases, days, prompts, errors, blockMinutes: BLOCKS,
  };
}

// run as a script
import { pathToFileURL } from "node:url";
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const plan = parsePlan(readFileSync(join(root, "content/month-1-plan.md"), "utf8"));
  mkdirSync(join(root, "app/data"), { recursive: true });
  writeFileSync(join(root, "app/data/plan.json"), JSON.stringify(plan, null, 1));
  console.log(`days ${plan.days.length} lessons ${plan.days.filter((d) => d.lessonNo).length} prompts ${plan.prompts.length} errors ${plan.errors.length} checkpoints ${plan.checkpoints.length} routes ${plan.routes.length}`);
}
