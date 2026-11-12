// The moment after the last speaking answer: a dark room with the sphere. Press and hold to gather it (it shrinks, spins,
// trembles, a low tone rises); let go and it bursts, and the same dots settle into "8.5". Then one plain line and the numbers.
// No praise words: the work speaks. Escape or Close leaves. With reduced motion the dots are simply there.
import { h } from "../util.js";

export function treat({ line, sub }) {
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const cv = h("canvas", { "aria-hidden": "true" });
  const hint = h("div", { class: "tr-hold" }, "Press and hold");
  const l1 = h("div", { class: "tr-line" }, line), l2 = h("div", { class: "tr-sub num" }, sub || "");
  const close = h("button", { class: "btn tr-close", onclick: () => end() }, "Close");
  const el = h("div", { class: "moment", role: "dialog", "aria-modal": "true", "aria-label": line }, cv, h("div", { class: "tr-foot" }, hint, l1, l2, close));
  const x = cv.getContext("2d");
  let W = 0, H = 0, dots = [], phase = "sphere", charge = 0, holding = false, T = 0, raf = 0, ac = null, tone = null;

  async function setup() {
    W = el.clientWidth; H = el.clientHeight; const dpr = Math.min(2, devicePixelRatio || 1);
    cv.width = W * dpr; cv.height = H * dpr; x.setTransform(dpr, 0, 0, dpr, 0, 0);
    try { await document.fonts.ready; } catch {}
    const N = W < 520 ? 1100 : 1500, tg = glyphs(N), g = Math.PI * (3 - Math.sqrt(5));
    dots = Array.from({ length: N }, (_, i) => { const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), t = g * i;
      return { sx: Math.cos(t) * r, sy: y, sz: Math.sin(t) * r, x: W / 2, y: H * 0.4, z: 0, vx: 0, vy: 0, tx: tg[i][0], ty: tg[i][1], gold: Math.random() < 0.05, ph: Math.random() * 6.28 }; });
    if (calm) { for (const d of dots) { d.x = d.tx; d.y = d.ty; } phase = "form"; reveal(0); }
  }
  // points inside the digits "8.5", read off an offscreen canvas
  function glyphs(n) {
    const o = document.createElement("canvas"); o.width = W; o.height = H; const c = o.getContext("2d");
    const font = getComputedStyle(document.documentElement).getPropertyValue("--f-display") || "system-ui, sans-serif";
    c.fillStyle = "#fff"; c.textAlign = "center"; c.textBaseline = "middle"; c.font = `800 ${Math.round(Math.min(W * 0.4, H * 0.3))}px ${font}`;
    c.fillText("8.5", W / 2, H * 0.4);
    const d = c.getImageData(0, 0, W, H).data, pts = [], step = W < 520 ? 3 : 4;
    for (let y = 0; y < H; y += step) for (let i = 0; i < W; i += step) if (d[(y * W + i) * 4 + 3] > 128) pts.push([i, y]);
    for (let i = pts.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [pts[i], pts[j]] = [pts[j], pts[i]]; }
    return pts.length ? Array.from({ length: n }, (_, i) => pts[i % pts.length]) : Array.from({ length: n }, () => [W / 2, H * 0.4]);
  }
  function sound(on) {
    try {
      ac ||= new (window.AudioContext || window.webkitAudioContext)();
      const t = ac.currentTime;
      if (on) { const o = ac.createOscillator(), g = ac.createGain(); o.type = "sine"; o.frequency.value = 110; g.gain.value = 0; o.connect(g).connect(ac.destination); o.start(); g.gain.linearRampToValueAtTime(0.05, t + 0.3); o.frequency.linearRampToValueAtTime(330, t + 1.6); tone = { o, g }; return; }
      if (tone) { tone.g.gain.cancelScheduledValues(t); tone.g.gain.setValueAtTime(tone.g.gain.value, t); tone.g.gain.linearRampToValueAtTime(0, t + 0.15); tone.o.stop(t + 0.2); tone = null; }
    } catch {}
  }
  function thump() {
    try { const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain(); o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.5); g.gain.setValueAtTime(0.18, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.6); o.connect(g).connect(ac.destination); o.start(t); o.stop(t + 0.65); } catch {}
  }
  const down = (e) => { if (phase !== "sphere") return; e.preventDefault?.(); holding = true; sound(true); navigator.vibrate?.(10); };
  const up = () => { if (!holding) return; holding = false; sound(false); if (charge > 0.25) burst(); };
  cv.addEventListener("pointerdown", down); addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
  const key = (e) => { if (e.key === "Escape") end(); if (e.key === " " && !e.repeat) { e.type === "keydown" ? down(e) : up(); } };
  addEventListener("keydown", key); addEventListener("keyup", key);

  function burst() {
    phase = "burst"; hint.classList.add("gone"); thump(); navigator.vibrate?.([30, 40, 60]);
    const p = 0.9 + charge * 1.6, cy = H * 0.4;
    for (const d of dots) { const a = Math.atan2(d.y - cy, d.x - W / 2), s = (6 + Math.random() * 16) * p; d.vx = Math.cos(a) * s; d.vy = Math.sin(a) * s; }
    setTimeout(() => { phase = "form"; }, 650);
    reveal(1600);
  }
  function reveal(after) { hint.classList.add("gone"); setTimeout(() => l1.classList.add("on"), after); setTimeout(() => { l2.classList.add("on"); close.classList.add("on"); close.focus(); }, after + 400); }

  function frame() {
    raf = requestAnimationFrame(frame); T += 0.016;
    x.clearRect(0, 0, W, H);
    if (holding) charge = Math.min(1, charge + 0.012); else if (phase === "sphere") charge = Math.max(0, charge - 0.03);
    const R = Math.min(W, H) * 0.24 * (1 - charge * 0.42), rot = T * (0.25 + charge * 3), shake = charge * charge * 3, cr = Math.cos(rot), sr = Math.sin(rot);
    for (const d of dots) {
      if (phase === "sphere") {
        let X = d.sx * cr - d.sz * sr, Z = d.sx * sr + d.sz * cr; const Y = d.sy * 0.93 - Z * 0.37; Z = d.sy * 0.37 + Z * 0.93;
        const per = 2.6 / (3.4 - Z), br = 1 + Math.sin(T * 1.3 + d.ph) * 0.015;
        d.x = W / 2 + X * R * per * br + (Math.random() - 0.5) * shake; d.y = H * 0.4 + Y * R * per * br + (Math.random() - 0.5) * shake; d.z = Z;
      } else if (phase === "burst") { d.x += d.vx; d.y += d.vy; d.vx *= 0.9; d.vy *= 0.9; d.z = 1; }
      else { d.vx = (d.vx + (d.tx - d.x) * 0.055) * 0.78; d.vy = (d.vy + (d.ty - d.y) * 0.055) * 0.78; d.x += d.vx + Math.sin(T * 2 + d.ph) * 0.15; d.y += d.vy + Math.cos(T * 2 + d.ph) * 0.15; d.z = 1; }
      const dep = phase === "sphere" ? (d.z + 1) / 2 : 1, glow = charge * 0.5;
      x.fillStyle = d.gold ? `rgba(240,190,90,${0.3 + dep * 0.7})` : `rgba(${150 + glow * 80 | 0},${175 + glow * 50 | 0},255,${0.12 + dep * 0.85})`;
      x.beginPath(); x.arc(d.x, d.y, (phase === "form" ? 1.35 : 0.8 + dep * 1.6) + glow, 0, 6.283); x.fill();
    }
  }
  function end() {
    el.classList.remove("on"); sound(false);
    removeEventListener("pointerup", up); removeEventListener("keydown", key); removeEventListener("keyup", key);
    setTimeout(() => { cancelAnimationFrame(raf); el.remove(); try { ac?.close(); } catch {} }, 600);
  }
  document.body.append(el);
  requestAnimationFrame(async () => { el.classList.add("on"); await setup(); frame(); });
  return { close: end };
}
