// Shared interface pieces: header, toast, sheet, timer ring, task row.
import { h, icon, mmss, reducedMotion } from "./util.js";
import * as store from "./store.js";

export function head(title, { sub, back, actions } = {}) {
  return h("div", { class: "topbar" },
    h("div", { style: { display: "flex", alignItems: "center", gap: "4px", minWidth: 0 } },
      back ? h("a", { class: "iconbtn", href: back, "aria-label": "Back", style: { marginLeft: "-10px" } }, icon("back")) : null,
      h("div", { style: { minWidth: 0 } }, h("h1", null, title), sub ? h("div", { class: "kicker" }, sub) : null)),
    h("div", { class: "row-actions" }, actions, h("a", { class: "iconbtn", href: "#/settings", "aria-label": "Settings" }, icon("settings"))));
}

let toastEl, toastTimer;
export function toast(msg, ms = 2800) {
  toastEl?.remove(); clearTimeout(toastTimer);
  toastEl = h("div", { class: "toast", role: "status" }, msg);
  document.body.append(toastEl);
  toastTimer = setTimeout(() => toastEl?.remove(), ms);
}

// A bottom sheet (dialog on desktop). Returns {close, el}.
export function sheet(build, { onClose } = {}) {
  const prev = document.activeElement;
  const scrim = h("div", { class: "scrim", role: "dialog", "aria-modal": "true" });
  const el = h("div", { class: "sheet" });
  const close = () => { scrim.remove(); document.removeEventListener("keydown", esc); prev?.focus?.(); onClose?.(); };
  const esc = (e) => { if (e.key === "Escape") close(); };
  el.append(build(close));
  scrim.append(el);
  scrim.addEventListener("click", (e) => { if (e.target === scrim) close(); });
  document.addEventListener("keydown", esc);
  document.body.append(scrim);
  (el.querySelector("[autofocus], input, textarea, button") || el).focus?.();
  return { close, el };
}
export function confirmSheet(title, body, okLabel, onOk, { danger = false } = {}) {
  return sheet((close) => h("div", null,
    h("h2", null, title), h("p", { class: "muted", style: { marginTop: "8px" } }, body),
    h("div", { class: "row-actions", style: { marginTop: "16px", justifyContent: "flex-end" } },
      h("button", { class: "btn", onclick: close }, "Cancel"),
      h("button", { class: "btn primary" + (danger ? " danger" : ""), onclick: async () => { close(); await onOk(); } }, okLabel))));
}

// Timer ring. Returns {el, set(remaining, total), warn(on)}
export function ring(totalSec, label = "", { small = false } = {}) {
  const R = 54, C = 2 * Math.PI * R;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 120 120");
  const mk = (cls) => { const c = document.createElementNS("http://www.w3.org/2000/svg", "circle"); c.setAttribute("cx", 60); c.setAttribute("cy", 60); c.setAttribute("r", R); c.setAttribute("fill", "none"); c.setAttribute("stroke-width", 7); c.setAttribute("class", cls); return c; };
  const bg = mk("bg"), fg = mk("fg"); fg.setAttribute("stroke-dasharray", C); fg.setAttribute("stroke-dashoffset", 0);
  svg.append(bg, fg);
  const time = h("b", { class: "num", "aria-live": "off" }, mmss(totalSec));
  const lab = h("div", { class: "kicker" }, label);
  const el = h("div", { class: "ringwrap" + (small ? " small" : ""), role: "timer", "aria-label": label || "Timer" }, svg, h("div", { class: "mid" }, time, lab));
  return {
    el,
    set(remaining, total = totalSec) {
      time.textContent = mmss(remaining);
      fg.setAttribute("stroke-dashoffset", C * (1 - Math.max(0, remaining) / Math.max(1, total)));
      el.classList.toggle("warn", remaining <= 30 && remaining > 0 && total > 60);
    },
    label(t) { lab.textContent = t; },
  };
}

// A countdown that keeps running while the view is open. Returns {start, pause, reset, running}
export function makeTimer(seconds, { onTick, onEnd } = {}) {
  let remaining = seconds, endAt = null, id = null;
  const tick = () => {
    remaining = Math.max(0, Math.round((endAt - Date.now()) / 1000));
    onTick?.(remaining);
    if (remaining <= 0) { stop(); onEnd?.(); }
  };
  const stop = () => { clearInterval(id); id = null; };
  return {
    start() { if (id) return; endAt = Date.now() + remaining * 1000; id = setInterval(tick, 250); tick(); },
    pause() { if (!id) return; tick(); stop(); },
    reset(sec = seconds) { stop(); remaining = sec; onTick?.(remaining); },
    get running() { return !!id; },
    get remaining() { return remaining; },
    destroy: stop,
  };
}

const SK = { speak: "Speak", write: "Write", read: "Read", fix: "Fix", listen: "Listen", homework: "Homework", lesson: "Lesson", other: "Other" };
export const skillName = (b) => SK[b] || b;

// beeps from WebAudio, so a finished timer is heard even with the screen dim
export function chime() {
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const o = ac.createOscillator(), g = ac.createGain(); o.connect(g); g.connect(ac.destination);
    o.frequency.value = 660; g.gain.setValueAtTime(.001, ac.currentTime); g.gain.exponentialRampToValueAtTime(.25, ac.currentTime + .02); g.gain.exponentialRampToValueAtTime(.001, ac.currentTime + .6);
    o.start(); o.stop(ac.currentTime + .65);
  } catch {}
}

// A task row: tick that draws itself, text, minutes, Start. `go` is the route that opens the right tool.
export function taskRow(t, { onToggle, startHref, startLabel = "Start", sub, evidence }) {
  const done = store.isDone(t.key);
  const box = h("button", { class: "check" + (evidence && !done ? " locked" : ""), role: "checkbox", "aria-checked": String(done),
    "aria-label": (done ? "Mark not done: " : "Mark done: ") + t.text, onclick: () => onToggle?.(t) },
    h("span", { class: "box" }, (() => { const s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("viewBox", "0 0 24 24"); const p = document.createElementNS("http://www.w3.org/2000/svg", "path"); p.setAttribute("d", "M5 12.5l4.5 4.5L19 7.5"); s.append(p); return s; })()));
  return h("li", null, h("div", { class: "row" + (done ? " done" : "") }, box,
    h("div", { class: "grow" }, h("div", { class: "title" }, t.text),
      h("div", { class: "sub" }, [t.minutes ? h("span", null, `${t.minutes} min`) : null, sub ? h("span", { style: { marginLeft: "12px" } }, sub) : null,
        evidence && !done ? h("span", { style: { marginLeft: "12px" } }, "Completes when you submit it") : null])),
    startHref && !done ? h("a", { class: "btn small", href: startHref }, startLabel) : null));
}

// A row of links that look like a segmented control; the current one is marked for screen readers.
export function segLinks(label, items, current) {
  return h("nav", { class: "seg", "aria-label": label, style: { marginBottom: "16px" } },
    items.map(([id, text, href]) => h("a", { class: "seglink", href, "aria-current": id === current ? "page" : null }, text)));
}
