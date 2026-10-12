// Session mode: one button runs the day's blocks in order, with a timer per block and short breaks.
import { h, icon, todayISO, hm } from "../util.js";
import * as store from "../store.js";
import { head, ring, makeTimer, chime, toast, skillName } from "../ui.js";
import { toolFor, minimumTasks, minimumTool } from "../tasks.js";

export const live = false;
const BREAK_MIN = 5;
let run = { date: "", skipped: new Set(), current: null, breakDone: new Set(), minutes: 0 };

export default async function (ctx) {
  const today = todayISO(), plan = store.S.plan;
  const day = store.dayByDate(today) || plan.days[0];
  if (run.date !== today) run = { date: today, skipped: new Set(), current: null, breakDone: new Set(), minutes: 0 };
  const isMin = store.minimumDay(today);
  const items = (isMin ? minimumTasks(today) : store.dayItems(day).filter((t) => !t.lesson));
  const pending = items.filter((t) => !store.isDone(t.key) && !run.skipped.has(t.key));
  const root = h("div", { class: "fullscreen" });
  const inner = h("div", { class: "inner session-block" }); root.append(inner);
  const exit = h("a", { class: "btn quiet", href: "#/today", style: { position: "absolute", top: "12px", right: "12px" } }, "End session");
  root.append(exit);

  // just finished something? offer a break before the next block
  if (run.current && store.isDone(run.current) && !run.breakDone.has(run.current) && pending.length) {
    const key = run.current; run.breakDone.add(key);
    return breakScreen(root, inner, pending[0], ctx);
  }
  if (!pending.length) {
    inner.append(h("h1", null, "Session complete"), h("p", { class: "lead muted" }, items.length ? `You finished ${items.filter((t) => store.isDone(t.key)).length} of ${items.length} blocks today.` : "Nothing planned today."),
      h("div", { class: "row-actions", style: { justifyContent: "center", marginTop: "16px" } }, h("a", { class: "btn primary", href: "#/today" }, "Back to Today")));
    run.current = null; return root;
  }

  const t = pending[0]; run.current = t.key;
  const idx = items.indexOf(t) + 1;
  const tool = isMin ? minimumTool(t) : toolFor(t, { session: true });
  const href = tool.href && !/session=1/.test(tool.href) ? tool.href + "&session=1" : tool.href;
  const minutes = t.minutes || 20;
  const r = ring(minutes * 60, skillName(t.block), { small: true });
  let startedAt = 0;
  const clock = makeTimer(minutes * 60, { onTick: (s) => r.set(s, minutes * 60), onEnd: () => { chime(); toast("Block time is up."); } });
  ctx.onLeave(() => { clock.destroy(); if (startedAt) { const spent = Math.round((Date.now() - startedAt) / 60000); if (spent > 0) store.addStudy(Math.min(spent, minutes), "session"); } });
  const startBtn = h("button", { class: "btn" }, icon("play", 18), "Start timer");
  startBtn.onclick = () => { if (clock.running) { clock.pause(); startBtn.replaceChildren(icon("play", 18), "Resume"); } else { startedAt ||= Date.now(); clock.start(); startBtn.replaceChildren(icon("pause", 18), "Pause"); } };
  const finishBlock = async () => { await store.markDone(t.key); location.hash = "#/session"; };

  inner.append(h("div", { class: "kicker" }, `Block ${idx} of ${items.length}`), h("h1", null, skillName(t.block === "homework" ? "homework" : t.block)),
    h("p", { class: "lead", style: { maxWidth: "46ch", margin: "6px auto 0" } }, t.text), r.el,
    h("div", { class: "row-actions", style: { justifyContent: "center" } }, startBtn, tool.href ? h("a", { class: "btn primary", href }, tool.label || "Open the tool") : null),
    h("div", { class: "row-actions", style: { justifyContent: "center", marginTop: "14px" } },
      !tool.evidence || store.minimumDay(today) ? h("button", { class: "btn", onclick: finishBlock }, icon("check", 18), "Done") : h("span", { class: "small muted" }, "This block completes when you submit your work."),
      h("button", { class: "btn quiet", onclick: () => { run.skipped.add(t.key); location.hash = "#/session"; setTimeout(() => ctx.rerender(), 0); } }, "Skip for now")));
  return root;
}

function breakScreen(root, inner, next, ctx) {
  const r = ring(BREAK_MIN * 60, "Break", { small: true });
  const clock = makeTimer(BREAK_MIN * 60, { onTick: (s) => r.set(s, BREAK_MIN * 60), onEnd: () => { chime(); ctx.rerender(); } });
  ctx.onLeave(() => clock.destroy()); clock.start();
  inner.append(h("div", { class: "kicker" }, "Block done"), h("h1", null, "Take a short break"), h("p", { class: "lead muted" }, "Stand up, drink some water. Look away from the screen."), r.el,
    h("p", { class: "small muted" }, `Next: ${skillName(next.block === "homework" ? "homework" : next.block)}, ${next.minutes || 20} min`),
    h("div", { class: "row-actions", style: { justifyContent: "center" } }, h("button", { class: "btn primary", onclick: () => { clock.destroy(); ctx.rerender(); } }, "Start the next block")));
  return root;
}
