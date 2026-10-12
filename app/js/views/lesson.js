// Lessons: the list, and each lesson with its countdown, agenda, questions, homework and notes.
import { h, icon, fmtDate, countdownText, todayISO } from "../util.js";
import * as store from "../store.js";
import { head, taskRow } from "../ui.js";
import { toolFor } from "../tasks.js";
import { dayContent } from "./plan.js";
import { downloadIcs } from "../ics.js";

export const live = true;

export default async function (ctx) {
  const no = Number(ctx.params[0]);
  if (!no) return listView();
  const d = store.lessonDays().find((x) => x.lessonNo === no);
  if (!d) return h("div", null, head("Lessons", { back: "#/lesson" }), h("div", { class: "empty" }, "That lesson does not exist."));
  return lessonView(ctx, d);
}

function listView() {
  const root = h("div");
  root.append(head("Lessons", { sub: "Monday, Wednesday and Friday" }));
  root.append(h("div", { class: "row-actions" }, h("button", { class: "btn", onclick: downloadIcs }, icon("download", 18), "Add to your calendar")));
  const nl = store.nextLesson();
  root.append(h("ul", { class: "rows", style: { marginTop: "12px" } }, store.lessonDays().map((d) => {
    const done = store.isDone(d.lessonKey);
    return h("li", null, h("a", { class: "row" + (done ? " done" : ""), href: `#/lesson/${d.lessonNo}` },
      h("div", { style: { width: "36px", fontFamily: "var(--f-display)", fontWeight: 600, fontSize: "22px" }, class: "num" }, String(d.lessonNo)),
      h("div", { class: "grow" }, h("div", { class: "title" }, d.lessonTitle), h("div", { class: "sub" }, fmtDate(d.date, { weekday: "long", day: "numeric", month: "long" }))),
      nl?.lessonNo === d.lessonNo ? h("span", { class: "pill accent" }, "Next") : d.checkpoint ? h("span", { class: "pill turq" }, "Checkpoint") : null, icon("chevron", 18)));
  })));
  return root;
}

function lessonView(ctx, d) {
  const S = store.S, start = store.lessonStart(d), link = store.setting("meetingLink");
  const root = h("div");
  root.append(head(`Lesson ${d.lessonNo}`, { sub: d.lessonTitle, back: "#/lesson" }));
  const when = h("div", { class: "countdown" });
  const lab = h("div", { class: "grow" }), t = h("span", { class: "t" }), act = h("div", { class: "row-actions" });
  when.append(lab, t, act);
  const upd = () => {
    const ms = start - Date.now(), mins = Number(store.setting("lessonMinutes")) || 90;
    lab.replaceChildren(h("div", { class: "title" }, fmtDate(d.date, { weekday: "long", day: "numeric", month: "long" })), h("div", { class: "sub" }, `${store.setting("lessonTime")}, ${mins} minutes`));
    t.textContent = ms > 0 ? countdownText(ms) : ms > -mins * 60000 ? "In progress" : "Finished";
    const live = ms <= 15 * 60000 && ms > -mins * 60000;
    act.replaceChildren(...(live ? [link ? h("a", { class: "btn primary", href: link, target: "_blank", rel: "noopener" }, "Join lesson") : h("a", { class: "btn", href: "#/settings" }, "Add the lesson link")] : []));
  };
  upd(); const id = setInterval(upd, 1000); ctx.onLeave(() => clearInterval(id));
  root.append(when);
  if (d.checkpoint) root.append(h("div", { class: "notice" }, "This lesson is a checkpoint. Scores go into Progress."));
  if ([1, 6, 10, 12].includes(d.lessonNo)) root.append(h("div", { class: "notice" }, "This lesson includes a recorded speaking mock. Record it in the Speaking studio so it is kept for the then-and-now comparison.", h("div", { style: { marginTop: "8px" } }, h("a", { class: "btn small", href: `#/speak?mode=mock&lesson=${d.lessonNo}&from=${d.date}` }, icon("mic", 18), "Open the speaking mock"))));

  root.append(...dayContent(d));

  // homework
  if (d.homework.length) {
    root.append(h("section", { class: "section" }, h("div", { class: "shead" }, h("h2", null, "Homework"), h("span", { class: "kicker" }, "1.5 hours")),
      h("ul", { class: "rows" }, d.homework.map((t) => {
        const tool = toolFor({ ...t, date: d.date });
        return taskRow({ ...t, date: d.date }, { onToggle: async (x) => { if (store.isDone(x.key)) await store.unmarkDone(x.key); else if (tool.evidence) location.hash = tool.href; else await store.markDone(x.key); }, startHref: tool.href, startLabel: tool.label, evidence: tool.evidence });
      }))));
  }

  // notes after the lesson (teacher notes go here)
  const key = `lessonnote-${d.lessonNo}`;
  const ta = h("textarea", { rows: 5, placeholder: "Notes from the lesson: what to remember, what to fix.", "aria-label": "Lesson notes", spellcheck: true, value: S.kv[key] || "" });
  let timer; ta.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => store.setSetting(key, ta.value), 600); });
  ta.addEventListener("blur", () => store.setSetting(key, ta.value));
  root.append(h("section", { class: "section" }, h("div", { class: "shead" }, h("h2", null, "Lesson notes")), ta));

  root.append(h("div", { class: "row-actions", style: { marginTop: "20px" } },
    store.isDone(d.lessonKey)
      ? h("button", { class: "btn", onclick: () => store.unmarkDone(d.lessonKey) }, "Mark lesson as not attended")
      : h("button", { class: "btn primary", onclick: () => store.markDone(d.lessonKey) }, icon("check", 18), "Mark lesson done")));
  return root;
}
