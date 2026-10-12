// The signature element: her current estimate and her distance to band 8.5, set large.
import { h, reducedMotion } from "../util.js";
import * as store from "../store.js";

const f1 = (x) => (x == null ? "–" : x.toFixed(1));

export function bandBlock({ detail = true } = {}) {
  const e = store.estimate(), S = store.S, target = S.config.target;
  const big = h("div", { class: "big num", "aria-label": `Estimated overall band ${f1(e.overall)}` }, f1(e.overall));
  // the number counts up when a new score lands
  const last = Number(S.kv.lastBand);
  if (!reducedMotion() && last && last !== e.overall) {
    const from = last, to = e.overall, t0 = performance.now(), dur = 700;
    const step = (t) => { const k = Math.min(1, (t - t0) / dur), ease = 1 - Math.pow(1 - k, 3); big.textContent = f1(from + (to - from) * ease); if (k < 1) requestAnimationFrame(step); else big.textContent = f1(to); };
    requestAnimationFrame(step);
  }
  if (last !== e.overall) store.setSetting("lastBand", e.overall);

  const side = h("div", { class: "side" },
    h("div", { class: "kicker" }, e.assumed ? "Estimated overall, speaking not scored yet" : "Estimated overall"),
    h("div", { class: "gap" }, e.gap === 0 ? `At band ${target}` : `${f1(e.gap)} to band ${target}`));
  const root = h("section", { class: "section", "aria-label": "Band estimate" }, h("div", { class: "band" }, big, side));
  if (!detail) return root;

  const aims = S.config.skillTargets;
  const rows = [["Listening", e.skills.listening, "listening"], ["Reading", e.skills.reading, "reading"], ["Writing", e.skills.writing, "writing"], ["Speaking", e.skills.speaking, "speaking", e.assumed]];
  root.append(h("div", { class: "skillbars" }, rows.map(([name, v, key, assumed]) =>
    h("div", { class: "skillbar" }, h("span", null, name),
      h("div", { class: "track", role: "img", "aria-label": `${name} ${f1(v)}, aim ${aims[key]}` },
        h("div", { class: "fill", style: { width: `${(Math.min(9, v ?? 0) / 9) * 100}%`, opacity: assumed ? .45 : 1 } }),
        h("div", { class: "tick", style: { left: `${(aims[key] / 9) * 100}%` } })),
      h("span", { class: "num", style: { textAlign: "right" } }, h("b", null, f1(v)), h("span", { class: "faint tiny" }, ` / ${aims[key]}`))))));
  if (e.assumed) root.append(h("p", { class: "tiny faint", style: { marginTop: "8px" } }, "Speaking is set in Lesson 1. Until then it is assumed to match your writing."));
  return root;
}
