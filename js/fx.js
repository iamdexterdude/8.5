// Small pieces of motion. dissolve(el): the element blows away as dust, the way a deleted message does in Telegram:
// a front sweeps across it, every bit it passes becomes a grain that drifts up and fades, and the space it took closes.
import { reducedMotion } from "./util.js";

export function dissolve(el, { duration = 1100 } = {}) {
  return new Promise((done) => {
    if (!el?.isConnected) return done();
    const r = el.getBoundingClientRect();
    if (reducedMotion() || r.width < 2 || r.height < 2) return collapse(el, 250).then(done);
    const cs = getComputedStyle(el);
    const cols = [cs.backgroundColor, cs.backgroundColor, cs.backgroundColor, cs.color, cs.borderLeftColor || cs.color].filter((c) => c && c !== "rgba(0, 0, 0, 0)");
    const dpr = Math.min(2, window.devicePixelRatio || 1), padX = 40, padTop = 90, padBot = 24;
    const cv = document.createElement("canvas"); cv.className = "fx-canvas"; cv.setAttribute("aria-hidden", "true");
    const W = r.width, H = r.height, CW = W + padX * 2, CH = H + padTop + padBot;
    Object.assign(cv.style, { left: `${r.left - padX}px`, top: `${r.top - padTop}px`, width: `${CW}px`, height: `${CH}px` });
    cv.width = Math.round(CW * dpr); cv.height = Math.round(CH * dpr);
    const cx = cv.getContext("2d"); cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    document.body.append(cv);
    const grains = [], cell = 4, sweep = 0.6;
    let t0 = 0, last = 0, lastFront = 0, collapsed = false;
    el.style.willChange = "clip-path";
    const frame = (now) => {
      if (!t0) { t0 = now; last = now; }
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const t = (now - t0) / duration, front = Math.min(1, t / sweep) * (W + 24);
      // the bits the front has just crossed turn to dust
      for (let x = Math.floor(lastFront / cell) * cell; x < front && x < W; x += cell) for (let y = 0; y < H; y += cell) {
        if (Math.random() < 0.5) grains.push({ x: padX + x + Math.random() * cell, y: padTop + y + Math.random() * cell, vx: 25 + Math.random() * 70, vy: -40 - Math.random() * 90, life: 0, ttl: 0.45 + Math.random() * 0.5, s: 1.5 + Math.random() * 2.2, c: cols[(Math.random() * cols.length) | 0], ph: Math.random() * 6.28 });
      }
      lastFront = Math.max(lastFront, front);
      el.style.clipPath = `inset(0 0 0 ${Math.min(W, front)}px)`;
      if (!collapsed && front >= W) { collapsed = true; collapse(el, 380); }
      cx.clearRect(0, 0, CW, CH);
      for (let i = grains.length - 1; i >= 0; i--) {
        const g = grains[i]; g.life += dt;
        if (g.life > g.ttl) { grains.splice(i, 1); continue; }
        const k = g.life / g.ttl;
        g.x += (g.vx + Math.sin(g.ph + g.life * 9) * 30) * dt; g.y += g.vy * dt; g.vy -= 20 * dt;
        cx.globalAlpha = (1 - k) * 0.95; cx.fillStyle = g.c; const s = g.s * (1 - k * 0.6); cx.fillRect(g.x, g.y, s, s);
      }
      cx.globalAlpha = 1;
      if (t < 1 || grains.length) requestAnimationFrame(frame); else { cv.remove(); done(); }
    };
    requestAnimationFrame(frame);
    setTimeout(() => { if (cv.isConnected) { cv.remove(); if (!collapsed) collapse(el, 200); done(); } }, duration + 1500);   // a tab that never paints still lets go
  });
}

// the element's space closes smoothly, then it is gone
function collapse(el, ms) {
  return new Promise((res) => {
    if (!el?.isConnected) return res();
    const h = el.getBoundingClientRect().height, cs = getComputedStyle(el);
    Object.assign(el.style, { height: `${h}px`, marginTop: cs.marginTop, marginBottom: cs.marginBottom, paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom, overflow: "hidden", boxSizing: "border-box" });
    void el.offsetHeight;
    el.style.transition = `height ${ms}ms ease, margin ${ms}ms ease, padding ${ms}ms ease, opacity ${ms}ms ease`;
    Object.assign(el.style, { height: "0px", marginTop: "0px", marginBottom: "0px", paddingTop: "0px", paddingBottom: "0px", opacity: "0" });
    setTimeout(() => { el.remove(); res(); }, ms + 30);
  });
}
