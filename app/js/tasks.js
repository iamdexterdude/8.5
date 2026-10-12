// Which tool opens for which task, and which tasks need evidence before they count as done.
import * as store from "./store.js";

const enc = encodeURIComponent;

// kind: where Start goes. evidence: the task completes only when that work is submitted.
export function toolFor(t, { session = false } = {}) {
  const text = t.text || "";
  const q = `task=${enc(t.key)}${session ? "&session=1" : ""}`;
  if (t.course) return { kind: "course", href: t.route, evidence: false, label: /\/model\//.test(t.route || "") ? "Open" : "Learn" };
  if (t.lesson) return { kind: "lesson", href: `#/lesson/${t.key.split("|")[0]}`, evidence: false, label: "Open lesson" };
  const block = t.block;
  if (block === "homework") {
    if (/rewrite/i.test(text)) return writeTool(t, q, true);
    if (/re-record|record/i.test(text)) return { kind: "speak", href: `#/speak?${q}&from=${t.date}`, evidence: true, label: "Record" };
    if (/reading passage|passage|reading/i.test(text)) return { kind: "read", href: `#/read?${q}`, evidence: false, label: "Start" };
    if (/transcribe/i.test(text)) return { kind: "errors", href: `#/errors?${q}`, evidence: false, label: "Open error log" };
    if (/error log|collocations/i.test(text)) return { kind: "errors", href: `#/errors?${q}`, evidence: false, label: "Open error log" };
    return { kind: "plain", href: null, evidence: false };
  }
  if (block === "write") return writeTool(t, q, /task|P\d|rewrite|test|writing/i.test(text));
  if (block === "speak") return { kind: "speak", href: `#/speak?${q}&from=${t.date}`, evidence: true, label: "Record" };
  if (block === "read") return { kind: "read", href: `#/read?${q}&min=${/60/.test(text) ? 60 : 20}`, evidence: false, label: "Start" };
  if (block === "listen") return { kind: "timer", href: `#/timer?${q}&m=40&label=Listening`, evidence: false, label: "Start timer" };
  if (block === "fix") {
    const tag = /article/i.test(text) ? "article" : /collocation/i.test(text) ? "collocation" : /template/i.test(text) ? "template" : null;
    if (/recur|consolidate/i.test(text)) return { kind: "errors", href: `#/errors?${q}&view=top`, evidence: false, label: "Open error log" };
    if (/error log \(/i.test(text)) return { kind: "errors", href: `#/errors?${q}`, evidence: false, label: "Open error log" };
    return { kind: "review", href: `#/review/session?${q}${tag ? "&tag=" + tag : ""}`, evidence: false, label: "Start drill" };
  }
  return { kind: "plain", href: null, evidence: false };
}

function writeTool(t, q, evidence) {
  const text = t.text || "";
  const m = text.match(/\bP(\d{1,2})\b/);
  const full = /\b60 min\b/.test(text) && /task 1/i.test(text) && /task 2|P\d/i.test(text) || /Writing, 60 min|Writing test, 60/i.test(text);
  const t1only = /^(Task 1|overview)/i.test(text) && !/task 2/i.test(text);
  const part = full || t1only ? 1 : 2;
  const minutes = full ? 20 : part === 1 ? 20 : /rewrite/i.test(text) ? (t.minutes || 30) : 40;
  const url = `#/write?${q}&part=${part}&min=${minutes}${m ? "&p=P" + m[1] : ""}${full ? "&full=1" : ""}${/rewrite/i.test(text) ? "&rewrite=1" : ""}`;
  return { kind: "write", href: url, evidence, label: "Write" };
}

// Tasks she can complete with a tap
export const needsEvidence = (t) => toolFor(t).evidence;

// the minimum day (plan rule 5): one Part 2 recording, one reading passage, 10 minutes of error log
export function minimumTasks(date) {
  return [
    { key: `${date}|min|speak`, block: "speak", minutes: 15, text: "One Part 2 recording", date, min: true },
    { key: `${date}|min|read`, block: "read", minutes: 20, text: "One reading passage", date, min: true },
    { key: `${date}|min|fix`, block: "fix", minutes: 10, text: "Error log, 10 minutes", date, min: true },
  ];
}
export function minimumTool(t) {
  const q = `task=${enc(t.key)}`;
  if (t.block === "speak") return { kind: "speak", href: `#/speak?${q}&from=${t.date}&min=1`, evidence: true, label: "Record" };
  if (t.block === "read") return { kind: "read", href: `#/read?${q}&min=20`, evidence: false, label: "Start" };
  return { kind: "errors", href: `#/errors?${q}`, evidence: false, label: "Open error log" };
}

// Which course videos belong to this day (from the private pack, if she loaded it)
export function watchFor(date) {
  const pack = store.S.pack; if (!pack?.watch) return [];
  return pack.watch[date] || [];
}
