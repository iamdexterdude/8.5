// A plain timer for listening tests and anything else timed. "Timed means timed."
import { h, icon, mmss } from "../util.js";
import * as store from "../store.js";
import { head, ring, makeTimer, chime, toast } from "../ui.js";

export const live = false;

export default async function (ctx) {
  const q = ctx.query; let minutes = Number(q.m) || 20; const label = q.label || "Timer";
  const root = h("div");
  root.append(head(label, { back: "#/practice", sub: "Phone in another room, no dictionary" }));
  const r = ring(minutes * 60, label);
  const startBtn = h("button", { class: "btn primary" }, icon("play", 18), "Start");
  const resetBtn = h("button", { class: "btn" }, "Reset");
  let started = 0;
  const finish = async () => {
    chime(); toast("Time is up.");
    startBtn.textContent = "Start"; startBtn.replaceChildren(icon("play", 18), "Start");
    await store.addStudy(minutes, label);
    if (q.task) { await store.markDone(q.task); }
    started = 0;
  };
  const t = makeTimer(minutes * 60, { onTick: (s) => r.set(s, minutes * 60), onEnd: finish });
  ctx.onLeave(() => { // count time actually spent if she leaves early
    t.destroy(); if (started) { const spent = Math.round((Date.now() - started) / 60000); if (spent > 0 && t.remaining > 0) store.addStudy(spent, label); }
  });
  startBtn.onclick = () => {
    if (t.running) { t.pause(); startBtn.replaceChildren(icon("play", 18), "Resume"); }
    else { if (!started) started = Date.now(); t.start(); startBtn.replaceChildren(icon("pause", 18), "Pause"); }
  };
  resetBtn.onclick = () => { t.reset(minutes * 60); started = 0; startBtn.replaceChildren(icon("play", 18), "Start"); };
  root.append(r.el, h("div", { class: "row-actions", style: { justifyContent: "center" } }, startBtn, resetBtn));

  if (!q.task) {
    const seg = h("div", { class: "seg", style: { margin: "20px auto 0", display: "flex", justifyContent: "center" }, role: "group", "aria-label": "Length" },
      [5, 10, 20, 40, 60].map((m) => h("button", { "aria-pressed": String(m === minutes), onclick: (e) => { minutes = m; t.destroy(); t.reset(m * 60); r.set(m * 60, m * 60); startBtn.replaceChildren(icon("play", 18), "Start"); seg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === e.currentTarget))); } }, `${m} min`)));
    root.append(seg);
  }
  return root;
}
