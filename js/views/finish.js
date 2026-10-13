// The finish screen: a strip of ikat medallions weaves itself in, the time she finished, and a track chosen by her teacher.
import { h, icon, reducedMotion } from "../util.js";
import * as store from "../store.js";
import * as hw from "../homework.js";

const NS = "http://www.w3.org/2000/svg";
const el = (n, a = {}) => { const e = document.createElementNS(NS, n); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); return e; };

// a woven band of stepped diamonds, each row sliding in from the left
function weave() {
  const cell = 7, n = 4, medallions = 6, W = medallions * (2 * n + 2) * cell, Hh = (2 * n + 1) * cell;
  const svg = el("svg", { viewBox: `0 0 ${W} ${Hh}`, class: "weave", role: "img", "aria-label": "A woven pattern", preserveAspectRatio: "xMidYMid meet" });
  const colors = [["#2B4FD0", n], ["#1FB5AD", 2], ["#F4F1E8", 0]];
  for (let m = 0; m < medallions; m++) {
    const cx = (m * (2 * n + 2) + n + 1) * cell;
    for (const [fill, r] of colors) for (let i = -r; i <= r; i++) {
      const w = ((r - Math.abs(i)) * 2 + 1) * cell, row = i + n;
      const rect = el("rect", { x: cx - w / 2, y: row * cell, width: w, height: cell - 0.6, fill, rx: 1 });
      rect.style.animationDelay = reducedMotion() ? "0s" : `${(m * 0.24 + row * 0.05 + (fill === "#2B4FD0" ? 0 : fill === "#1FB5AD" ? 0.5 : 0.9)).toFixed(2)}s`;
      svg.append(rect);
    }
  }
  return svg;
}

const tashkentParts = (iso) => {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tashkent", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(iso));
  return { h: Number(f.find((p) => p.type === "hour").value) % 24, m: f.find((p) => p.type === "minute").value };
};

function copyFor(t) {
  const time = `${String(t.h).padStart(2, "0")}:${t.m}`;
  if (t.h >= 23 || t.h < 5) return { big: time, line: `Done at ${time}.`, sub: "It is late, and it is all in. Now sleep." };
  if (t.h < 17) return { big: time, line: "Homework done.", sub: "Everything is in." };
  return { big: time, line: "Done for today.", sub: "Everything is in. The evening is yours." };
}

export function trackFor(date) {
  const list = hw.F.config?.music || [];
  if (!list.length) return null;
  const finished = Object.values(store.S.hw).filter((r) => r.completedAt).map((r) => r.date).sort();
  const idx = Math.max(0, finished.indexOf(date)); return list[idx % list.length];
}

export function openFinish(date, homework) {
  const row = hw.stateOf(date), when = row.completedAt || new Date().toISOString(), c = copyFor(tashkentParts(when)), p = hw.dayProgress(date, homework), track = trackFor(date);
  const prev = document.activeElement;
  const root = h("div", { class: "finish", role: "dialog", "aria-modal": "true", "aria-label": "Homework finished" });
  const close = () => { root.remove(); document.removeEventListener("keydown", esc); prev?.focus?.(); };
  const esc = (e) => { if (e.key === "Escape") close(); };
  root.append(
    h("div", { class: "finish-in" },
      weave(),
      h("div", { class: "finish-time num" }, c.big),
      h("h1", null, c.line),
      h("p", { class: "finish-sub" }, c.sub),
      h("p", { class: "finish-count num" }, `${p.tasks} ${p.tasks === 1 ? "task" : "tasks"}, ${p.steps} steps`),
      track ? h("div", { class: "treat" },
        h("div", { class: "treat-k" }, "From your teacher"),
        h("div", { class: "treat-title" }, track.title),
        track.artist ? h("div", { class: "treat-artist" }, track.artist) : null,
        track.note ? h("div", { class: "treat-note" }, track.note) : null,
        track.url ? h("a", { class: "btn primary", href: track.url, target: "_blank", rel: "noopener" }, icon("headphones", 18), "Listen") : null) : null,
      h("button", { class: "btn finish-close", onclick: close }, "Back to Today")));
  document.body.append(root); document.addEventListener("keydown", esc);
  root.querySelector(".finish-close").focus();
}
