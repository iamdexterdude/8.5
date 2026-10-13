// Today: what day it is, what the lesson covers, and the homework, one step at a time.
import { h, icon, fmtDate, todayISO, countdownText, addDays } from "../util.js";
import * as store from "../store.js";
import * as srs from "../srs.js";
import * as hw from "../homework.js";
import { toast } from "../ui.js";
import { homeworkSection } from "./hwview.js";
import { openFinish } from "./finish.js";

const gear = () => h("a", { class: "iconbtn", href: "#/settings", "aria-label": "Settings" }, icon("settings"));
const tashkentTime = (iso) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tashkent", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));

export default async function (ctx) {
  const today = todayISO(), day = store.dayByDate(today);
  const root = h("div", { class: "two-col" }), main = h("div"); root.append(main);
  hw.refresh(today);                                         // look for new homework in the background
  const homework = hw.homeworkFor(today), name = hw.studentName();

  // ---- the day
  main.append(h("div", { class: "topbar" },
    h("div", null, h("h1", null, fmtDate(today, { weekday: "long" })), h("div", { class: "kicker" }, (name ? name + ", " : "") + fmtDate(today, { day: "numeric", month: "long" }))),
    gear()));

  main.append(lessonCard(ctx, today, day, homework));
  const prev = previousHomework(today); if (prev) main.append(prev);
  if (day?.lessonNo || homework?.lesson?.title) main.append(afterLesson(today));

  // ---- the homework
  if (!homework) main.append(noHomework(today, day));
  else {
    main.append(homeworkSection(today, homework));
    const row = hw.stateOf(today), p = hw.dayProgress(today, homework);
    if (p.complete) {
      main.append(doneBanner(today, homework, row));
      if (!row.finishShown) { hw.patchState(today, { finishShown: true }); setTimeout(() => openFinish(today, homework), 350); }
    }
  }

  // ---- one quiet line for the cards
  const due = srs.dueCount();
  if (due) main.append(h("a", { class: "quietline", href: "#/review" }, icon("review", 18), h("span", null, `${due} cards ready to review`), icon("chevron", 18)));

  root.append(sidePanel(today));
  return root;
}

// ---------------------------------------------------------------- lesson card
function lessonCard(ctx, today, day, homework) {
  const fl = homework?.lesson || {}, lessonNo = Number(fl.no) || day?.lessonNo;
  const isLesson = !!(lessonNo || fl.title);
  const time = fl.time || hw.F.config?.lessonTime || store.setting("lessonTime");
  const title = fl.title || day?.lessonTitle || (day?.type === "off" ? "Rest day" : day?.title || "Self-study");
  const focus = fl.focus || (day?.agenda?.length ? day.agenda.map((a) => a.title).join(", ") : "");
  const box = h("section", { class: "lessonbox", "aria-label": "Today's lesson" });
  box.append(h("div", { class: "lb-k" }, isLesson ? (lessonNo ? `Lesson ${lessonNo}` : "Lesson") : day?.type === "off" ? "Today" : "Study day"), h("h2", null, title));
  if (focus) box.append(h("p", { class: "lb-focus" }, h("span", { class: "muted" }, "Today we cover "), focus));
  if (isLesson) {
    const start = new Date(`${today}T${time}:00+05:00`), link = fl.link || hw.F.config?.lessonLink || store.setting("meetingLink");
    const when = h("span", { class: "num" }), act = h("span", { class: "row-actions" });
    const upd = () => {
      const ms = start - Date.now(), mins = Number(store.setting("lessonMinutes")) || 90, live = ms <= 15 * 60000 && ms > -mins * 60000;
      when.textContent = ms > 0 ? `at ${time}, in ${countdownText(ms)}` : ms > -mins * 60000 ? `started at ${time}` : `was at ${time}`;
      act.replaceChildren(...(live ? [link ? h("a", { class: "btn primary small", href: link, target: "_blank", rel: "noopener" }, "Join lesson") : h("a", { class: "btn small", href: "#/settings" }, "Add the lesson link")] : day?.lessonNo ? [h("a", { class: "btn small quiet", href: `#/lesson/${day.lessonNo}` }, "Lesson details")] : []));
    };
    upd(); const id = setInterval(upd, 1000); ctx.onLeave(() => clearInterval(id));
    box.append(h("div", { class: "lb-when" }, when, act));
  }
  return box;
}

function afterLesson(today) {
  const key = "after-" + today;
  const ta = h("textarea", { rows: 3, placeholder: "After the lesson: what did you learn today?", "aria-label": "What I learnt from today's lesson", value: store.S.kv[key] || "" });
  let t; const save = () => { if ((store.S.kv[key] || "") !== ta.value) store.setSetting(key, ta.value); };
  ta.addEventListener("input", () => { clearTimeout(t); t = setTimeout(save, 600); }); ta.addEventListener("blur", () => { clearTimeout(t); save(); });
  return h("div", { class: "afterlesson" }, h("label", { class: "muted small" }, "After the lesson, what I learnt"), ta);
}

function previousHomework(today) {
  const y = addDays(today, -1), prevHw = hw.homeworkFor(y);
  if (!prevHw) return null;
  const p = hw.dayProgress(y, prevHw);
  return h("div", { class: "prevhw" }, h("span", { class: "muted" }, "Previous homework"), h("span", { class: "pill " + (p.complete ? "ok" : p.stepsDone ? "warn" : "") }, p.complete ? "Done" : p.stepsDone ? `${p.stepsDone} of ${p.steps} steps` : "Not done"));
}

// ---------------------------------------------------------------- states
function noHomework(today, day) {
  const row = hw.stateOf(today), asked = row.asked, who = hw.F.config?.teacher;
  const rest = day?.type === "off", trouble = hw.F.status === "badkey";
  const sec = h("section", { class: "empty-hw" }, h("h2", null, rest ? "Rest day" : "No homework yet"),
    h("p", { class: "muted" }, trouble ? "The homework could not be read. Reload the app; if it keeps happening, tell your teacher." : rest ? "Nothing is set for today." : "Your teacher has not set it yet."));
  if (!rest) {
    const msg = h("div", { class: "small muted", "aria-live": "polite" }, asked ? `You asked at ${tashkentTime(asked)}.` : "");
    sec.append(h("div", { class: "row-actions" },
      h("button", { class: "btn primary", disabled: !!asked, onclick: async (e) => { const b = e.currentTarget; b.disabled = true; const r = await hw.askForHomework(today); toast(r === "sent" ? "Your teacher has been told." : "Saved. Message your teacher as well."); } }, asked ? "Asked" : "Ask for the homework"),
      who ? h("a", { class: "btn", href: `https://t.me/${who.replace(/^@/, "")}`, target: "_blank", rel: "noopener" }, "Message your teacher") : null), msg);
  }
  return sec;
}

function doneBanner(today, homework, row) {
  const t = row.completedAt ? tashkentTime(row.completedAt) : "";
  return h("div", { class: "donebar" }, h("div", null, h("b", null, "Homework done"), t ? h("span", { class: "muted num" }, ` at ${t}`) : null),
    h("button", { class: "btn small", onclick: () => openFinish(today, homework) }, "Open"));
}

// ---------------------------------------------------------------- the month, kept as it was
function sidePanel(today) {
  const S = store.S, aside = h("aside", { class: "no-print", "aria-label": "The month", style: { display: "none" } });
  if (matchMedia("(min-width: 1000px)").matches) {
    aside.style.display = "block";
    aside.append(h("h2", { style: { fontSize: "16px", marginBottom: "10px" } }, "The month"));
    const cal = h("div", { class: "cal" }, ["M", "T", "W", "T", "F", "S", "S"].map((d) => h("div", { class: "dow" }, d)));
    for (const d of S.plan.days) {
      const pr = S.hw[d.date]?.progress, frac = pr?.total ? pr.done / pr.total : 0;
      cal.append(h("a", { class: `cell ${d.type === "off" ? "off" : ""} ${d.lessonNo ? "lesson" : ""} ${d.checkpoint ? "cp" : ""} ${d.date === today ? "today" : ""}`, href: `#/plan/day/${d.date}`, style: { minHeight: "52px" }, "aria-label": `${fmtDate(d.date)}${d.lessonNo ? ", lesson " + d.lessonNo : ""}` },
        h("span", { class: "d" }, String(Number(d.date.slice(8)))), pr ? h("span", { class: "bar" }, h("i", { style: { width: `${Math.round(frac * 100)}%`, display: "block" } })) : null));
    }
    aside.append(cal);
  }
  return aside;
}
