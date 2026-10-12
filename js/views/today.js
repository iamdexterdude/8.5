// Today: what to do now. One screen, one question: "What should I do today?"
import { h, icon, fmtDate, todayISO, countdownText, lessonMoment, addDays, dowOf, hm, fmtShort, diffDays } from "../util.js";
import * as store from "../store.js";
import * as srs from "../srs.js";
import { head, toast, taskRow, skillName } from "../ui.js";
import { toolFor, needsEvidence, minimumTasks, minimumTool, watchFor } from "../tasks.js";
import { bandBlock } from "./bandblock.js";
import { watchRow } from "./watch.js";

const TYPE_LABEL = { lesson: "Lesson day", self: "Self-study", test: "Test day", fullmock: "Full mock", light: "Light day", off: "Rest day", other: "" };

export default async function (ctx) {
  const S = store.S, today = todayISO(), plan = S.plan;
  const before = today < plan.start, after = today > plan.end;
  const day = store.dayByDate(before ? plan.start : after ? plan.end : today);
  const name = store.setting("name") || (S.kv.name || "");
  const root = h("div", { class: "two-col" });
  const main = h("div"); root.append(main);

  const greet = name ? `${name}` : "Today";
  main.append(head(before ? "Your month starts soon" : after ? "Month 1 is complete" : fmtDate(today, { weekday: "long" }),
    { sub: before || after ? null : fmtDate(today, { day: "numeric", month: "long" }) }));

  if (after) {
    main.append(h("p", { class: "lead" }, "Month 1 is done. Open Progress to see where you stand against the checkpoints."), h("a", { class: "btn primary", href: "#/progress" }, "Open Progress"));
    return root;
  }

  // header: day type, week and phase
  main.append(h("div", { class: "dayhead" },
    h("div", { class: "chips" },
      day.type !== "other" ? h("span", { class: "pill accent" }, before ? `Starts ${fmtDate(day.date, { weekday: "long", day: "numeric", month: "long" })}` : TYPE_LABEL[day.type]) : null,
      h("span", { class: "pill" }, `Week ${day.week}`), h("span", { class: "pill" }, day.phase),
      day.checkpoint ? h("span", { class: "pill turq" }, "Checkpoint") : null,
      store.setting("examDate") && store.setting("examDate") >= today ? h("span", { class: "pill num" }, `${diffDays(today, store.setting("examDate"))} days to the exam`) : null)));

  main.append(bandBlock({ detail: false }));
  main.append(await lessonCountdown(ctx));

  if (day.type === "off" && !before) { main.append(restScreen(today)); return root; }

  main.append(missedBlock(today));
  main.append(taskStack(ctx, day, today, before));

  // course videos for tonight (private pack only)
  const vids = watchFor(day.date);
  if (vids.length) {
    main.append(h("section", { class: "section" }, h("div", { class: "shead" }, h("h2", null, "Watch tonight"), h("span", { class: "kicker" }, "While you eat or before sleep")),
      h("ul", { class: "rows" }, vids.map((v) => watchRow(v, day.date)))));
  }

  // reviews due
  const due = srs.dueCount();
  main.append(h("section", { class: "section" },
    h("div", { class: "shead" }, h("h2", null, "Review")),
    due ? h("div", { class: "row", style: { borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)" } },
      h("div", { class: "grow" }, h("div", { class: "title num" }, `${due} ${due === 1 ? "card" : "cards"} ready`), h("div", { class: "sub" }, "Five minutes is enough.")),
      h("a", { class: "btn primary", href: "#/review/session?mode=quick" }, "Quick review"))
      : h("div", { class: "muted" }, "Nothing is due right now. New cards arrive tomorrow.")));

  // side panel on wide screens: the month at a glance
  root.append(sidePanel(today));
  return root;
}

// ---------- pieces ----------
async function lessonCountdown(ctx) {
  const S = store.S, nl = store.nextLesson();
  if (!nl) return h("div");
  const start = store.lessonStart(nl), link = store.setting("meetingLink");
  const timeEl = h("span", { class: "t" }), act = h("div", { class: "row-actions" });
  const lab = h("div", { class: "grow" });
  const box = h("div", { class: "countdown" }, lab, timeEl, act);
  const upd = () => {
    const ms = start - Date.now(), mins = Number(store.setting("lessonMinutes")) || 90;
    const live = ms <= 15 * 60000 && ms > -mins * 60000;
    lab.replaceChildren(h("div", { class: "title" }, `Lesson ${nl.lessonNo}`), h("div", { class: "sub" }, nl.lessonTitle + ", " + fmtDate(nl.date, { weekday: "long" }) + " at " + store.setting("lessonTime")));
    timeEl.textContent = ms > 0 ? countdownText(ms) : "In progress";
    act.replaceChildren(live
      ? (link ? h("a", { class: "btn primary", href: link, target: "_blank", rel: "noopener" }, "Join lesson") : h("a", { class: "btn", href: "#/settings" }, "Add the lesson link"))
      : h("a", { class: "btn small", href: `#/lesson/${nl.lessonNo}` }, "Lesson details"));
  };
  upd(); const id = setInterval(upd, 1000); ctx.onLeave(() => clearInterval(id));
  return box;
}

function missedBlock(today) {
  const missed = store.missedTasks(today);
  if (!missed.length) return h("div");
  const next = store.nextStudyDay(today);
  const el = h("details", { class: "quiet-box", open: missed.length <= 2 },
    h("summary", { style: { cursor: "pointer", minHeight: "32px" } }, h("b", null, missed.length === 1 ? "One task didn't happen" : `${missed.length} tasks didn't happen`), h("span", { class: "small muted", style: { marginLeft: "10px" } }, "Decide once, then move on")),
    h("ul", { class: "rows" }, missed.slice(0, 6).map((t) => h("li", null, h("div", { class: "row", style: { flexWrap: "wrap" } },
      h("div", { class: "grow" }, h("div", { class: "title small" }, t.text), h("div", { class: "sub" }, `${skillName(t.block)}, ${fmtShort(t.date)}`)),
      h("div", { class: "row-actions" },
        h("button", { class: "btn small", onclick: async () => { await store.setTask(t.key, { movedTo: next }); toast("Moved to " + fmtDate(next, { weekday: "long" })); } }, "Move to " + fmtDate(next, { weekday: "short" })),
        h("button", { class: "btn small", onclick: async () => { await store.setTask(t.key, { skipped: true }); } }, "Skip"),
        h("button", { class: "btn small", onclick: async () => { await store.markDone(t.key); } }, "Mark done")))))),
    missed.length > 6 ? h("p", { class: "tiny muted", style: { marginTop: "8px" } }, `${missed.length - 6} more after these.`) : null);
  return el;
}

function taskStack(ctx, day, today, before) {
  const sec = h("section", { class: "section" });
  const isMin = store.minimumDay(today) && !before;
  const items = store.dayItems(day);
  const progress = store.dayProgress(day);
  const total = items.reduce((a, t) => a + (t.minutes || 0), 0);

  const onToggle = async (t) => {
    if (store.isDone(t.key)) { await store.unmarkDone(t.key); return; }
    const tool = t.min ? minimumTool(t) : toolFor(t);
    if (tool.evidence && !store.minimumDay(today)) {
      toast("This one completes when you submit your work."); return;
    }
    await store.markDone(t.key);
  };

  sec.append(h("div", { class: "shead" },
    h("h2", null, isMin ? "Minimum day" : "Today's tasks"),
    h("span", { class: "kicker num" }, isMin ? "45 minutes" : `${progress.done} of ${progress.total} done${total ? ", " + hm(total) : ""}`)));

  // actions: session mode, minimum day
  if (!before) {
    sec.append(h("div", { class: "row-actions", style: { marginBottom: "6px" } },
      h("a", { class: "btn primary", href: "#/session" }, icon("play", 18), "Start session"),
      isMin
        ? h("button", { class: "btn", onclick: () => store.setMinimumDay(today, false) }, "Back to the full day")
        : h("button", { class: "btn", onclick: async () => { await store.setMinimumDay(today, true); toast("Today is the 45-minute minimum. It still counts."); } }, "Minimum day")));
  }

  if (isMin) {
    sec.append(h("ul", { class: "rows" }, minimumTasks(today).map((t) => taskRow(t, { onToggle, startHref: minimumTool(t).href, startLabel: minimumTool(t).label, evidence: false }))));
    sec.append(h("p", { class: "small muted", style: { marginTop: "10px" } }, "A bad day still counts for your streak. Never zero."));
    return sec;
  }

  // lesson first, then the rest grouped by block
  const groups = [];
  for (const t of items) {
    const g = groups.find((x) => x.block === t.block);
    if (g) g.items.push(t); else groups.push({ block: t.block, items: [t] });
  }
  for (const g of groups) {
    const mins = g.items.reduce((a, t) => a + (t.minutes || 0), 0);
    sec.append(h("div", { class: "block-label" }, h("span", { class: "sk-dot sk-" + g.block }), skillName(g.block === "lesson" ? "lesson" : g.block),
      mins ? h("span", { class: "faint small num", style: { fontWeight: 400 } }, hm(mins)) : null));
    sec.append(h("ul", { class: "rows" }, g.items.map((t) => {
      const tool = toolFor(t);
      const sub = t.movedFrom ? "Moved from " + fmtShort(t.movedFrom) : (t.lesson ? store.setting("lessonTime") : null);
      return taskRow(t, { onToggle, startHref: tool.href, startLabel: tool.label || "Start", sub, evidence: tool.evidence });
    })));
  }
  if (day.type === "lesson" && day.agenda.length) {
    sec.append(h("p", { class: "small", style: { marginTop: "10px" } }, h("a", { href: `#/lesson/${day.lessonNo}` }, "See the lesson agenda")));
  }
  return sec;
}

function restScreen(today) {
  const S = store.S;
  // this week's summary (Monday to Saturday)
  const dow = dowOf(today); const monday = addDays(today, -((dow + 6) % 7));
  let done = 0, total = 0, minutes = 0;
  for (let i = 0; i < 6; i++) {
    const iso = addDays(monday, i), d = store.dayByDate(iso); if (!d) continue;
    const p = store.dayProgress(d); done += p.done; total += p.total; minutes += S.study[iso]?.minutes || 0;
  }
  return h("section", { class: "rest" },
    h("h1", null, "Rest day"),
    h("p", { class: "lead muted" }, "Rest is part of the plan. Nothing to do today."),
    h("div", { class: "skillbars", style: { maxWidth: "360px", margin: "24px auto 0", textAlign: "left" } },
      h("div", { class: "row", style: { minHeight: "auto" } }, h("div", { class: "grow" }, "Tasks done this week"), h("b", { class: "num" }, `${done} of ${total}`)),
      h("div", { class: "row", style: { minHeight: "auto" } }, h("div", { class: "grow" }, "Minutes timed"), h("b", { class: "num" }, minutes)),
      h("div", { class: "row", style: { minHeight: "auto" } }, h("div", { class: "grow" }, "Day streak"), h("b", { class: "num" }, store.streak(today)))));
}

function sidePanel(today) {
  const S = store.S;
  const aside = h("aside", { class: "no-print", "aria-label": "The month", style: { display: "none" } });
  if (matchMedia("(min-width: 1280px)").matches) {
    aside.style.display = "block";
    aside.append(h("h2", { style: { fontSize: "16px", marginBottom: "10px" } }, "The month"));
    const cal = h("div", { class: "cal" }, ["M", "T", "W", "T", "F", "S", "S"].map((d) => h("div", { class: "dow" }, d)));
    for (const d of S.plan.days) {
      const p = store.dayProgress(d);
      cal.append(h("a", { class: `cell ${d.type === "off" ? "off" : ""} ${d.lessonNo ? "lesson" : ""} ${d.checkpoint ? "cp" : ""} ${d.date === today ? "today" : ""}`, href: `#/plan/day/${d.date}`, style: { minHeight: "52px" } },
        h("span", { class: "d" }, String(Number(d.date.slice(8)))), p.total ? h("span", { class: "bar" }, h("i", { style: { width: `${(100 * p.done) / p.total}%`, display: "block" } })) : null));
    }
    aside.append(cal);
  }
  return aside;
}
