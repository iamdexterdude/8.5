// First-launch welcome: asks her name, then about ten seconds, skippable, plays once.
import { h, reducedMotion } from "../util.js";
import * as store from "../store.js";

// An ikat-derived pattern: stepped diamonds with softly feathered edges, in cobalt, turquoise and warm white.
export function ikat({ opacity = 1 } = {}) {
  const NS = "http://www.w3.org/2000/svg";
  const el = (n, a = {}) => { const e = document.createElementNS(NS, n); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); return e; };
  const svg = el("svg", { viewBox: "0 0 160 160", preserveAspectRatio: "xMidYMid slice", class: "ikat", "aria-hidden": "true" });
  svg.style.opacity = opacity;
  const defs = el("defs");
  const f = el("filter", { id: "feather" + Math.random().toString(36).slice(2, 6), x: "-5%", y: "-5%", width: "110%", height: "110%" });
  const id = f.getAttribute("id");
  f.append(el("feGaussianBlur", { stdDeviation: "1.1" }));
  const pat = el("pattern", { id: "p" + id, width: 80, height: 80, patternUnits: "userSpaceOnUse" });
  const g = el("g", { filter: `url(#${id})` });
  const diamond = (cx, cy, n, fill, op) => { for (let i = -n; i <= n; i++) { const w = (n - Math.abs(i)) * 2 + 1; g.append(el("rect", { x: cx - w * 4, y: cy + i * 8 - 4, width: w * 8, height: 8, fill, opacity: op })); } };
  diamond(40, 40, 4, "#2B4FD0", .55); diamond(40, 40, 2, "#1FB5AD", .6); diamond(40, 40, 0, "#F4F1E8", .7);
  diamond(0, 0, 2, "#1FB5AD", .35); diamond(80, 0, 2, "#1FB5AD", .35); diamond(0, 80, 2, "#1FB5AD", .35); diamond(80, 80, 2, "#1FB5AD", .35);
  pat.append(g); defs.append(f, pat); svg.append(defs, el("rect", { width: 160, height: 160, fill: `url(#p${id})` }));
  return svg;
}

export function runWelcome() {
  return new Promise((resolve) => {
    const root = h("div", { class: "welcome", role: "dialog", "aria-label": "Welcome" });
    const pattern = ikat({ opacity: 0 }); pattern.classList.add("ikat");
    const stage = h("div", { class: "stage" });
    const skip = h("button", { class: "skip", onclick: () => finish() }, "Skip");
    root.append(pattern, skip, stage);
    document.body.append(root);
    let finished = false; const timers = [];
    const later = (ms, fn) => timers.push(setTimeout(fn, ms));

    const finish = async (name) => {
      if (finished) return; finished = true; timers.forEach(clearTimeout);
      if (name) await store.setSetting("name", name);
      await store.setSetting("welcomed", new Date().toISOString());
      root.style.transition = "opacity .5s"; root.style.opacity = 0;
      setTimeout(() => { root.remove(); resolve(); location.hash = "#/today"; }, 500);
    };

    // step 1: name
    const input = h("input", { type: "text", placeholder: "Your name", autocomplete: "given-name", "aria-label": "Your name", maxLength: 40 });
    const begin = () => play(input.value.trim());
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") begin(); });
    stage.append(
      h("div", { class: "line show hold" }, "This was made for you."),
      h("div", { class: "sub show" }, "What should I call you?"),
      input,
      h("div", { class: "row-actions", style: { justifyContent: "center" } }, h("button", { class: "btn primary", onclick: begin }, "Continue")));
    setTimeout(() => input.focus(), 50);

    // step 2: the month, about ten seconds
    function play(name) {
      stage.replaceChildren(); skip.onclick = () => finish(name);
      const line = h("div", { class: "line" }); const sub = h("div", { class: "sub" });
      stage.append(line, sub);
      pattern.style.transition = "opacity 2.4s ease"; pattern.style.opacity = reducedMotion() ? .12 : .22;
      const show = (text, subtext, accent) => {
        line.className = "line"; sub.className = "sub"; void line.offsetWidth;
        line.replaceChildren(accent ? h("span", { class: "accent" }, text) : text); sub.textContent = subtext || "";
        line.classList.add("show"); if (subtext) sub.classList.add("show");
      };
      const seq = [
        [0, name ? `${name}.` : "Welcome.", "Your month starts today."],
        [2400, "28 days.", "Monday 12 October to Sunday 8 November."],
        [4600, "12 lessons.", "Three a week, with the rest at your own pace."],
        [6800, "One target.", ""],
        [8400, "Band 8.", "Let's begin.", true],
      ];
      for (const [t, a, b, c] of seq) later(t, () => show(a, b, c));
      later(10600, () => { sub.replaceChildren(); stage.append(h("div", { class: "row-actions", style: { justifyContent: "center", marginTop: "20px" } }, h("button", { class: "btn primary", onclick: () => finish(name) }, "Open today"))); });
      later(13500, () => finish(name));
    }
  });
}

export default async function () { return h("div"); }
