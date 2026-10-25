// Today: a greeting for the moment, the lesson, one small question, and a word from the teacher when there is one.
import { h, icon, fmtDate, todayISO, countdownText } from "../util.js";
import * as store from "../store.js";
import * as hw from "../homework.js";
import * as ci from "../checkin.js";
import { toast } from "../ui.js";

export default async function (ctx) {
  const today = todayISO(), name = hw.studentName();
  hw.refresh(today);
  const lesson = store.lessonState(), homework = hw.homeworkFor(today);
  const hwDone = !!(homework && hw.dayProgress(today, homework).complete);
  const streak = store.streak(today);
  const root = h("div", { class: "todayv" });

  // ---- the sky: a header that changes with the hour
  const g = ci.greeting({ name, lesson, streak, hwDone });
  const sky = h("section", { class: "sky", dataset: { slot: ci.slotOf() } },
    h("div", { class: "sky-top" }, h("div", { class: "sky-date" }, fmtDate(today, { weekday: "long", day: "numeric", month: "long" })), h("a", { class: "iconbtn ghost", href: "#/settings", "aria-label": "Settings" }, icon("settings"))),
    h("h1", { class: "sky-line" }, g.line),
    h("p", { class: "sky-sub" }, g.sub));
  root.append(sky);

  // ---- the lesson, when there is one today
  if (lesson.phase !== "none") root.append(lessonCard(ctx, today, lesson, homework));

  // ---- a word from the teacher
  const note = hw.F.config?.todayNote;
  if (note?.text && note.at !== store.S.kv["note-seen"]) root.append(h("section", { class: "tnote" }, h("div", { class: "tnote-k" }, "From your teacher"), h("p", null, note.text),
    h("button", { class: "btn small quiet", onclick: () => { store.setSetting("note-seen", note.at); } }, "Got it")));

  // ---- one small question
  const prompt = ci.promptFor({ lesson });
  if (prompt) root.append(question(prompt, ctx));
  else {
    const last = store.S.checkins.filter((c) => c.date === today).at(-1);
    if (last) root.append(h("section", { class: "ask done" }, h("div", { class: "ask-k" }, "Today you said"), h("p", { class: "ask-echo" }, h("span", { class: "muted" }, last.prompt + " "), h("b", null, last.answer))));
  }

  // ---- a quiet line about the week
  const act = store.activeDates();
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(Date.now() - (6 - i) * 86400000); const iso = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent" }).format(d); return { iso, on: act.has(iso), today: iso === today }; });
  root.append(h("section", { class: "week" }, h("div", { class: "week-dots", "aria-label": "The last seven days" }, days.map((d) => h("i", { class: (d.on ? "on" : "") + (d.today ? " now" : ""), title: d.iso }))),
    h("span", { class: "week-k" }, streak ? `${streak} ${streak === 1 ? "day" : "days"} in a row` : "A quiet week so far")));
  return root;
}

function lessonCard(ctx, today, lesson, homework) {
  const title = homework?.lesson?.title || "", focus = homework?.lesson?.focus || "";
  const time = store.lessonTime(), link = homework?.lesson?.link || store.lessonLink();
  const when = h("span", { class: "num" }), act = h("span", { class: "row-actions" });
  const box = h("section", { class: "lesson" },
    h("div", { class: "lesson-k" }, lesson.phase === "after" ? "Tonight's lesson" : lesson.phase === "during" ? "Lesson now" : "Lesson tonight"),
    title ? h("h2", null, title) : h("h2", null, `At ${time}`),
    focus ? h("p", { class: "lesson-focus" }, focus) : null,
    h("div", { class: "lesson-when" }, when, act));
  const upd = () => {
    const ms = lesson.start - Date.now(), mins = Number(store.setting("lessonMinutes")) || 90, live = ms <= 15 * 60000 && ms > -mins * 60000;
    when.textContent = ms > 0 ? `${time}, in ${countdownText(ms)}` : ms > -mins * 60000 ? `started at ${time}` : `was at ${time}`;
    act.replaceChildren(...(live && link ? [h("a", { class: "btn primary small", href: link, target: "_blank", rel: "noopener" }, "Join")] : []));
  };
  upd(); const id = setInterval(upd, 1000); ctx.onLeave(() => clearInterval(id));
  return box;
}

function question(prompt, ctx) {
  const sec = h("section", { class: "ask" }, h("div", { class: "ask-k" }, "A small question"), h("h2", null, prompt.q));
  const finish = async (text) => {
    if (!text) return;
    const row = await ci.answer(prompt, text);
    hw.sendText(`${hw.studentName() || "Student"}, ${prompt.q}\n${text}`);
    hw.report();
    sec.classList.add("answered");
    sec.replaceChildren(h("div", { class: "ask-k" }, ci.thanks(prompt)), h("p", { class: "ask-echo" }, h("b", null, row.answer)));
  };
  if (prompt.kind === "chips") sec.append(h("div", { class: "chips big" }, prompt.opts.map((o) => h("button", { class: "chip", onclick: () => finish(o) }, o))));
  else {
    const ta = h("textarea", { rows: 2, placeholder: prompt.ph || "", "aria-label": prompt.q, maxLength: 400 });
    ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); finish(ta.value.trim()); } });
    sec.append(ta, h("div", { class: "row-actions" }, h("button", { class: "btn primary small", onclick: () => finish(ta.value.trim()) }, icon("send", 16), "Send"), h("button", { class: "btn small quiet", onclick: async () => { await ci.answer(prompt, "(skipped)"); ctx.rerender(); } }, "Skip")));
  }
  return sec;
}
