// Homework: today's tasks, one step at a time, and the days before. Nothing else lives here.
import { h, icon, fmtDate, todayISO, addDays } from "../util.js";
import * as store from "../store.js";
import * as hw from "../homework.js";
import { toast } from "../ui.js";
import { homeworkSection } from "./hwview.js";
import { openFinish } from "./finish.js";

const tashkentTime = (iso) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tashkent", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));

export default async function (ctx) {
  const today = todayISO();
  hw.refresh(today);
  const date = ctx.params[0] && /^\d{4}-\d{2}-\d{2}$/.test(ctx.params[0]) ? ctx.params[0] : today;
  const homework = hw.homeworkFor(date);
  const root = h("div", { class: "hwv" });
  const isToday = date === today;

  const p = homework ? hw.dayProgress(date, homework) : null;
  const minutes = homework ? homework.tasks.reduce((a, t) => a + (t.minutes || 0), 0) : 0;
  root.append(h("header", { class: "hwhead-top" },
    h("div", null,
      h("div", { class: "kicker" }, isToday ? "Today" : fmtDate(date, { weekday: "long" })),
      h("h1", null, isToday ? "Homework" : fmtDate(date, { day: "numeric", month: "long" })),
      homework ? h("div", { class: "hwmeta num" }, p.complete ? "Everything is in" : `${p.tasks} ${p.tasks === 1 ? "task" : "tasks"}${minutes ? ` · about ${minutes >= 90 ? (minutes / 60).toFixed(1).replace(".0", "") + " h" : minutes + " min"}` : ""}${p.stepsDone ? ` · ${p.stepsDone} of ${p.steps} steps done` : ""}`) : null),
    !isToday ? h("a", { class: "btn small quiet", href: "#/homework" }, "Today") : null));

  if (!homework) root.append(noHomework(date, isToday));
  else {
    root.append(homeworkSection(date, homework));
    const row = hw.stateOf(date);
    if (p.complete) {
      root.append(h("div", { class: "donebar" }, h("div", null, h("b", null, "Done"), row.completedAt ? h("span", { class: "muted num" }, ` at ${tashkentTime(row.completedAt)}`) : null), h("button", { class: "btn small", onclick: () => openFinish(date, homework) }, "Open")));
      if (isToday && !row.finishShown) { hw.patchState(date, { finishShown: true }); setTimeout(() => openFinish(date, homework), 350); }
    }
  }

  // the days before, so nothing is lost
  const days = hw.homeworkDays().filter((d) => d !== date);
  if (days.length) root.append(h("section", { class: "section" }, h("div", { class: "shead" }, h("h2", null, "Other days")),
    h("ul", { class: "rows" }, days.slice(0, 14).map((d) => { const pp = hw.dayProgress(d, hw.homeworkFor(d)); return h("li", null, h("a", { class: "row", href: `#/homework/${d}` },
      h("div", { class: "grow" }, h("div", { class: "title" }, fmtDate(d, { weekday: "long", day: "numeric", month: "long" })), h("div", { class: "sub" }, pp.complete ? "Done" : pp.stepsDone ? `${pp.stepsDone} of ${pp.steps} steps` : "Not started")),
      h("span", { class: "pill " + (pp.complete ? "ok" : pp.stepsDone ? "warn" : "") }, pp.complete ? "Done" : pp.stepsDone ? "Open" : "New"), icon("chevron", 18))); }))));
  return root;
}

function noHomework(date, isToday) {
  const row = hw.stateOf(date), asked = row.asked, who = hw.F.config?.teacher;
  const sec = h("section", { class: "empty-hw" }, h("h2", null, isToday ? "Nothing yet" : "Nothing was set"), h("p", { class: "muted" }, isToday ? "Your teacher has not set today's homework. It appears here the moment it is published." : "No homework was published for this day."));
  if (isToday) sec.append(h("div", { class: "row-actions" },
    h("button", { class: "btn primary", disabled: !!asked, onclick: async (e) => { const b = e.currentTarget; b.disabled = true; const r = await hw.askForHomework(date); toast(r === "sent" ? "Your teacher has been told." : "Saved. Message your teacher as well."); } }, asked ? `Asked at ${tashkentTime(asked)}` : "Ask for it"),
    who ? h("a", { class: "btn", href: `https://t.me/${who.replace(/^@/, "")}`, target: "_blank", rel: "noopener" }, "Message your teacher") : null));
  return sec;
}
