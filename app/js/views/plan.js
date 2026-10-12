// Plan: the month, the week, any day.
import { h, icon, fmtDate, fmtShort, todayISO, addDays, dowOf, hm } from "../util.js";
import * as store from "../store.js";
import { head, taskRow, skillName } from "../ui.js";
import { toolFor, watchFor } from "../tasks.js";
import { watchRow } from "./watch.js";

const SHORT = { lesson: "Lesson", self: "Self-study", test: "Test day", fullmock: "Full mock", light: "Light day", off: "Off", other: "" };

export default async function (ctx) {
  const [mode, arg] = ctx.params;
  if (mode === "day") return dayView(ctx, arg);
  if (mode === "week") return weekView(ctx, Number(arg) || 1);
  return monthView(ctx);
}

function tabs(active, weekNo) {
  const t = todayISO();
  return h("div", { class: "seg", role: "tablist", style: { marginBottom: "16px" } },
    h("a", { class: "btn quiet", href: "#/plan", role: "tab", "aria-selected": String(active === "month"), style: segStyle(active === "month") }, "Month"),
    h("a", { class: "btn quiet", href: `#/plan/week/${weekNo}`, role: "tab", "aria-selected": String(active === "week"), style: segStyle(active === "week") }, "Week"),
    h("a", { class: "btn quiet", href: `#/plan/day/${store.dayByDate(t) ? t : store.S.plan.start}`, role: "tab", "aria-selected": String(active === "day"), style: segStyle(active === "day") }, "Day"));
}
const segStyle = (on) => ({ minHeight: "40px", background: on ? "var(--surface)" : "transparent", color: on ? "var(--text)" : "var(--text-2)", boxShadow: on ? "var(--shadow)" : "none", borderRadius: "9px" });
const weekOf = (iso) => store.dayByDate(iso)?.week || 1;

// ---------- month ----------
function monthView(ctx) {
  const S = store.S, plan = S.plan, today = todayISO();
  const root = h("div");
  root.append(head("Plan", { sub: "Month 1: 12 October to 8 November" }), tabs("month", weekOf(today)));
  const nowWeek = store.dayByDate(today)?.week;
  root.append(h("div", { class: "roadmap", role: "list" }, plan.roadmap.map((r) =>
    h("a", { class: "ph" + (nowWeek === r.week ? " now" : ""), href: `#/plan/week/${r.week}`, role: "listitem", style: { textDecoration: "none", color: "inherit" } },
      h("b", null, r.phase), `Week ${r.week}`, h("div", { class: "tiny", style: { opacity: .85 } }, r.dates)))));
  root.append(h("p", { class: "small muted" }, plan.roadmap.find((r) => r.week === nowWeek)?.focus ? "This week: " + plan.roadmap.find((r) => r.week === nowWeek).focus : "Weeks 1 and 2 build technique, weeks 3 and 4 build accuracy and stamina."));

  const cal = h("div", { class: "cal", style: { marginTop: "14px" } }, ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => h("div", { class: "dow" }, d)));
  for (const d of plan.days) {
    const p = store.dayProgress(d);
    const label = d.lessonNo ? `Lesson ${d.lessonNo}` : SHORT[d.type];
    cal.append(h("a", { class: `cell ${d.type === "off" ? "off" : ""} ${d.lessonNo ? "lesson" : ""} ${d.checkpoint ? "cp" : ""} ${d.date === today ? "today" : ""}`, href: `#/plan/day/${d.date}`,
      "aria-label": `${fmtDate(d.date)}, ${label}${p.total ? `, ${p.done} of ${p.total} done` : ""}${d.checkpoint ? ", checkpoint" : ""}` },
      h("div", null, h("span", { class: "d" }, String(Number(d.date.slice(8)))), h("div", { class: "ty" }, label)),
      p.total ? h("span", { class: "bar" }, h("i", { style: { width: `${(100 * p.done) / p.total}%` } })) : null));
  }
  root.append(cal);

  root.append(h("section", { class: "section" }, h("div", { class: "shead" }, h("h2", null, "Gates")),
    h("ul", { class: "rows" }, plan.gates.map((g) => h("li", null, h("div", { class: "row" }, h("div", { class: "grow" }, h("div", { class: "title" }, g.gate), h("div", { class: "sub" }, g.what)), h("span", { class: "pill num" }, g.date)))))));
  root.append(h("section", { class: "section" }, h("div", { class: "shead" }, h("h2", null, "How the month works")),
    h("ul", { class: "rows" }, plan.rhythm.map((r) => h("li", null, h("div", { class: "row", style: { minHeight: "48px" } }, h("div", { style: { width: "44px", fontWeight: 600 } }, r.day), h("div", { class: "grow" }, r.what), h("span", { class: "faint small num" }, r.time))))),
    h("ol", { class: "small", style: { paddingLeft: "20px", marginTop: "14px" } }, plan.rules.map((r) => h("li", { style: { marginBottom: "6px" } }, r)))));
  return root;
}

// ---------- week ----------
function weekView(ctx, week) {
  const S = store.S, days = S.plan.days.filter((d) => d.week === week), today = todayISO();
  const ph = S.plan.phases.find((p) => p.week === week);
  const root = h("div");
  root.append(head(`Week ${week}, ${ph.name}`, { sub: ph.dates }), tabs("week", week));
  root.append(h("p", { class: "muted" }, ph.intro));
  root.append(h("div", { class: "row-actions", style: { marginBottom: "12px" } },
    week > 1 ? h("a", { class: "btn small", href: `#/plan/week/${week - 1}` }, "Week " + (week - 1)) : null,
    week < 4 ? h("a", { class: "btn small", href: `#/plan/week/${week + 1}` }, "Week " + (week + 1)) : null));
  root.append(h("div", { class: "weekcols" }, days.map((d) => {
    const items = store.dayItems(d);
    return h("div", { class: "col", style: d.date === today ? { outline: "2px solid var(--accent)" } : null },
      h("h3", null, h("a", { href: `#/plan/day/${d.date}`, style: { color: "inherit", textDecoration: "none" } }, `${d.dow} ${Number(d.date.slice(8))}`)),
      h("div", { class: "tiny muted", style: { marginBottom: "6px" } }, d.lessonNo ? `Lesson ${d.lessonNo}: ${d.lessonTitle}` : SHORT[d.type]),
      h("ul", { style: { listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "4px" } }, items.map((t) =>
        h("li", { style: { display: "flex", gap: "6px", alignItems: "flex-start" } },
          h("span", { "aria-label": store.isDone(t.key) ? "done" : "not done", style: { color: store.isDone(t.key) ? "var(--ok)" : "var(--text-3)", flex: "none", width: "16px" } }, store.isDone(t.key) ? icon("check", 16) : "○"),
          h("span", { class: store.isDone(t.key) ? "faint" : "", style: { fontSize: "13px", lineHeight: 1.3 } }, clip(t.text, 60))))));
  })));
  return root;
}
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

// ---------- day ----------
export function dayContent(d, { tasks = true } = {}) {
  const S = store.S, bank = S.bank, nodes = [];
  const info = bank.days[d.date] || {};
  // lesson agenda
  if (d.agenda.length) {
    nodes.push(h("section", { class: "section" }, h("div", { class: "shead" }, h("h2", null, "Agenda"), h("span", { class: "kicker num" }, "90 min")),
      h("ol", { class: "agenda" }, d.agenda.map((a) => h("li", null,
        h("div", { class: "time" }, a.time ? h("b", null, a.time.split(/[–-]/)[0]) : null, a.minutes ? `${a.minutes} min` : ""),
        h("div", null, h("div", { class: "title" }, a.title), h("div", { class: "muted" }, a.text)))))));
  }
  // questions: Lesson 1 baseline questions come from the plan
  if (d.questions) {
    nodes.push(h("section", { class: "section" }, h("div", { class: "shead" }, h("h2", null, "Baseline mock questions")),
      ["part1", "part2", "part3"].map((k, i) => h("div", { style: { marginBottom: "10px" } }, h("div", { class: "title" }, `Part ${i + 1}`), h("div", { class: "muted" }, d.questions[k])))));
  }
  // cue cards and Part 3 for the day
  const cards = (info.cards || []).map((id) => bank.cards[id]).filter(Boolean);
  if (cards.length) {
    nodes.push(h("section", { class: "section" }, h("div", { class: "shead" }, h("h2", null, cards.length > 1 ? "Part 2 cards" : "Part 2 card")),
      h("ul", { class: "rows" }, cards.map((c, i) => h("li", null, h("a", { class: "row", href: `#/speak?mode=part2&card=${info.cards[i]}&from=${d.date}` },
        h("div", { class: "grow" }, h("div", { class: "title" }, c.title.replace(/^Describe /, "Describe ")), h("div", { class: "sub" }, c.cat)), icon("mic", 20)))))));
  }
  if (info.part3?.length) {
    nodes.push(h("section", { class: "section" }, h("div", { class: "shead" }, h("h2", null, "Part 3 themes")),
      h("div", { class: "row-actions" }, info.part3.map((th) => h("a", { class: "btn small", href: `#/speak?mode=part3&theme=${th}&from=${d.date}` }, bank.labels[th] || th)))));
  }
  // writing prompts linked from the day's tasks
  const ps = [...new Set([...d.tasks, ...d.homework].map((t) => t.prompt).filter(Boolean))];
  if (ps.length) {
    nodes.push(h("section", { class: "section" }, h("div", { class: "shead" }, h("h2", null, "Task 2 prompt")),
      ps.map((id) => { const p = S.plan.prompts.find((x) => x.id === id); return p ? h("div", { class: "quiet-box", style: { borderStyle: "solid" } }, h("div", { class: "pill", style: { marginBottom: "8px" } }, `${p.id}, ${p.type}`), h("div", null, p.text)) : null; })));
  }
  return nodes;
}

function dayView(ctx, date) {
  const S = store.S, d = store.dayByDate(date);
  const root = h("div");
  if (!d) { root.append(head("Plan", { back: "#/plan" }), h("div", { class: "empty" }, "That day is not in Month 1.")); return root; }
  const idx = S.plan.days.indexOf(d), prev = S.plan.days[idx - 1], next = S.plan.days[idx + 1];
  root.append(head(fmtDate(d.date, { weekday: "long", day: "numeric", month: "long" }), { sub: d.lessonNo ? `Lesson ${d.lessonNo}: ${d.lessonTitle}` : d.title, back: "#/plan" }), tabs("day", d.week));
  root.append(h("div", { class: "row-actions", style: { marginBottom: "8px" } },
    prev ? h("a", { class: "btn small", href: `#/plan/day/${prev.date}` }, icon("back", 16), fmtDate(prev.date, { weekday: "short", day: "numeric" })) : null,
    next ? h("a", { class: "btn small", href: `#/plan/day/${next.date}` }, fmtDate(next.date, { weekday: "short", day: "numeric" }), icon("chevron", 16)) : null,
    d.type === "lesson" ? h("a", { class: "btn small", href: `#/lesson/${d.lessonNo}` }, "Lesson page") : null));
  if (d.type === "off") { root.append(h("div", { class: "rest" }, h("h2", null, "Rest day"), h("p", { class: "muted" }, "Rest is part of the plan."))); return root; }

  const items = store.dayItems(d);
  root.append(h("section", { class: "section" }, h("div", { class: "shead" }, h("h2", null, d.type === "lesson" ? "Homework" : "Tasks")),
    h("ul", { class: "rows" }, items.filter((t) => !t.lesson).map((t) => {
      const tool = toolFor(t);
      return taskRow(t, { onToggle: async (x) => { if (store.isDone(x.key)) await store.unmarkDone(x.key); else if (tool.evidence) { location.hash = tool.href; } else await store.markDone(x.key); }, startHref: tool.href, startLabel: tool.label, evidence: tool.evidence });
    }))));
  root.append(...dayContent(d));
  const vids = watchFor(d.date);
  if (vids.length) root.append(h("section", { class: "section" }, h("div", { class: "shead" }, h("h2", null, "Watch")), h("ul", { class: "rows" }, vids.map((v) => watchRow(v, d.date)))));
  const mats = S.pack?.materials?.[d.date];
  root.append(h("section", { class: "section" }, h("div", { class: "shead" }, h("h2", null, "Materials")),
    mats?.length
      ? h("ul", { class: "rows" }, mats.map((m) => h("li", null, h("a", { class: "row", href: m.url || null, target: "_blank", rel: "noopener" }, h("div", { class: "grow" }, h("div", { class: "title" }, m.title), h("div", { class: "sub" }, m.where)), icon("link", 18)))))
      : h("p", { class: "muted small" }, S.plan.materials[0].usedFor + ". " + (S.pack ? "No course item is matched to this day." : "Load the course pack in Settings to see the exact course lessons for this day."))));
  return root;
}
