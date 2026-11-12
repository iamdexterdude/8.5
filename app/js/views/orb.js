// The speaking sphere: a turning globe of dots with gold specks, a cloud of dust, a slow scanning band and twinkles.
// Hover pushes dots aside and joins the nearest with fine lines. While recording it listens to the microphone:
// a louder voice sends ripples across the surface, and a higher pitch makes the whole sphere pop outward on a spring.
export function orb() {
  const el = document.createElement("div");
  el.className = "orb"; el.tabIndex = 0; el.setAttribute("role", "button");
  const cv = document.createElement("canvas"), ic = document.createElement("span");
  ic.className = "orb-ic"; el.append(cv, ic);
  el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); el.click(); } });
  const c = cv.getContext("2d"), rnd = Math.random, TAU = Math.PI * 2;
  const small = matchMedia("(max-width: 520px)").matches, calm = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // points: a Fibonacci sphere for the globe, a loose shell for the dust
  const core = [], dust = [], NC = small ? 1000 : 1500, ND = small ? 130 : 200, gA = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < NC; i++) {
    const y = 1 - (i / (NC - 1)) * 2, r = Math.sqrt(1 - y * y), t = gA * i;
    core.push({ x: Math.cos(t) * r, y, z: Math.sin(t) * r, ph: rnd() * TAU, sp: 0.4 + rnd(), g: rnd() < 0.035, tw: 0, ox: 0, oy: 0 });
  }
  for (let i = 0; i < ND; i++) {
    const u = rnd() * 2 - 1, t = rnd() * TAU, s = Math.sqrt(1 - u * u), rr = 1.4 + rnd() * 0.45;
    dust.push({ x: s * Math.cos(t) * rr, y: u * rr, z: s * Math.sin(t) * rr, ph: rnd() * TAU, sp: 0.2 + rnd() * 0.5, g: rnd() < 0.1, tw: 0, ox: 0, oy: 0 });
  }

  // size follows the element
  let S = 0, dpr = 1;
  const fit = () => { dpr = Math.min(2, window.devicePixelRatio || 1); S = el.clientWidth; cv.width = S * dpr; cv.height = S * dpr; };
  const ro = new ResizeObserver(fit); ro.observe(el);

  // pointer
  let mx = -999, my = -999;
  const at = (e) => { const b = cv.getBoundingClientRect(); mx = e.clientX - b.left; my = e.clientY - b.top; };
  el.addEventListener("pointermove", at); el.addEventListener("pointerleave", () => { mx = my = -999; });
  el.addEventListener("touchmove", (e) => at(e.touches[0]), { passive: true });
  el.addEventListener("touchend", () => { mx = my = -999; });

  // colours come from the app theme
  let BLUE = "30,63,168", GOLD = "200,144,46";
  const rgb = (v, f) => { v = (v || "").trim(); const m = /^#?([\da-f]{6})$/i.exec(v); if (!m) return f; const n = parseInt(m[1], 16); return `${n >> 16},${(n >> 8) & 255},${n & 255}`; };
  const theme = () => { const cs = getComputedStyle(document.documentElement); BLUE = rgb(cs.getPropertyValue("--accent"), BLUE); GOLD = rgb(cs.getPropertyValue("--gold"), GOLD); };

  // the voice
  let ac = null, an = null, src = null, buf = null, live = false;
  let lvl = 0, base = 0, pop = 0, popV = 0, popT = 0, flip = 0;
  function listen(stream) {
    live = true; el.classList.add("live");
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      src = ac.createMediaStreamSource(stream); an = ac.createAnalyser(); an.fftSize = 2048;
      buf = new Float32Array(an.fftSize); src.connect(an);
      if (ac.state === "suspended") ac.resume().catch(() => {});
    } catch { ac = an = src = null; }
  }
  function quiet() {
    live = false; el.classList.remove("live"); base = 0; popT = 0;
    try { src?.disconnect(); ac?.close(); } catch {}
    ac = an = src = null;
  }
  // loudness, and the pitch by autocorrelation (70 to 600 Hz); 0 when there's no clear voice
  function hear() {
    an.getFloatTimeDomainData(buf);
    let e = 0; for (let i = 0; i < 1024; i++) e += buf[i] * buf[i];
    const rms = Math.sqrt(e / 1024);
    if (rms < 0.012) return [rms, 0];
    const sr = ac.sampleRate, lo = Math.floor(sr / 600), hi = Math.min(Math.floor(sr / 70), buf.length - 1025);
    let best = 0, bl = -1;
    for (let L = lo; L <= hi; L++) { let s = 0; for (let i = 0; i < 1024; i += 2) s += buf[i] * buf[i + L]; if (s > best) { best = s; bl = L; } }
    return bl > 0 && best * 2 / e > 0.5 ? [rms, sr / bl] : [rms, 0];
  }

  let T = 0, rot = 0, raf = 0, n = 0, gone = false;
  function frame() {
    raf = requestAnimationFrame(frame);
    if (!S || document.hidden || !el.isConnected) return;
    if (n++ % 60 === 0) theme();
    T += 0.016;

    // listen: louder raises the level, a rise in pitch above the speaker's own baseline sets the pop target
    if (an && (flip = !flip)) {
      const [rms, f] = hear();
      const t = Math.min(1, Math.max(0, (rms - 0.01) * 14));
      lvl += (t - lvl) * (t > lvl ? 0.35 : 0.07);
      if (f) { base = base ? base * 0.97 + f * 0.03 : f; popT = Math.min(1, Math.max(0, ((f - base) / base) * 4.5)) * Math.min(1, t * 2 + 0.3); }
      else popT *= 0.85;
    } else if (!an) { lvl *= 0.92; popT = 0; }
    popV += (popT - pop) * 0.11; popV *= 0.8; pop += popV;   // a soft spring: rises fast, overshoots a touch, settles

    rot += calm ? 0.0008 : 0.0028 + lvl * 0.01;
    const R = S * 0.3, CX = S / 2, CY = S / 2, scanY = Math.sin(T * (live ? 0.9 : 0.55)) * 1.1;
    const cr = Math.cos(rot), sr = Math.sin(rot), ct = Math.cos(0.38), st = Math.sin(0.38), out = [];
    const place = (p, x, y, z, k) => {
      let X = x * cr - z * sr, Z = x * sr + z * cr;
      const Y = y * ct - Z * st; Z = y * st + Z * ct;
      const per = 2.6 / (3.4 - Z);
      let sx = CX + X * R * per, sy = CY + Y * R * per;
      sx += Math.sin(T * p.sp + p.ph) * 1.1; sy += Math.cos(T * p.sp * 0.8 + p.ph) * 1.1;
      const dx = sx - mx, dy = sy - my, d = Math.hypot(dx, dy), reach = S * 0.16;
      let fx = 0, fy = 0;
      if (d < reach && Z > -0.4) { const f = (1 - d / reach) ** 1.5 * S * 0.07; fx = dx / (d || 1) * f; fy = dy / (d || 1) * f; }
      p.ox += (fx - p.ox) * 0.1; p.oy += (fy - p.oy) * 0.1;
      if (p.tw > 0) p.tw -= 0.02; else if (rnd() < 0.0006 + lvl * 0.003 + pop * 0.004) p.tw = 1;
      const scan = k ? 0 : Math.max(0, 1 - Math.abs(Y - scanY) * 7) * (Z > 0 ? 1 : 0.3);
      out.push({ x: sx + p.ox, y: sy + p.oy, z: Z, p, k, scan, near: d < reach && Z > 0 && !k });
    };
    for (const p of core) {
      const front = Math.acos(Math.max(-1, Math.min(1, p.z)));
      const a = 1 + Math.sin(T * 1.1 + p.ph) * 0.01 + lvl * 0.04 + lvl * 0.09 * Math.sin(front * 7 - T * 14) + pop * 0.17;
      place(p, p.x * a, p.y * a, p.z * a, 0);
    }
    const pull = 1 - lvl * 0.3 + pop * 0.12;
    for (const p of dust) place(p, p.x * pull, p.y * pull + Math.sin(T * p.sp + p.ph) * 0.05, p.z * pull, 1);
    out.sort((a, b) => a.z - b.z);

    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, S, S);
    const near = out.filter((o) => o.near).slice(-70), join = S * 0.04;
    c.lineWidth = 0.5;
    for (let i = 0; i < near.length; i++) for (let j = i + 1; j < near.length; j++) {
      const a = near[i], b = near[j], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < join) { c.strokeStyle = `rgba(${BLUE},${(1 - d / join) * 0.45})`; c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); }
    }
    const u = S / 420;
    for (const o of out) {
      const p = o.p, dep = (Math.max(-1.8, Math.min(1.8, o.z)) + 1.8) / 3.6;
      const al = (o.k ? 0.1 : 0.08) + dep * (o.k ? 0.6 : 0.85) + o.scan * 0.5 + p.tw * 0.8 + lvl * 0.15;
      const sz = ((o.k ? 0.5 : 0.55) + dep * (o.k ? 1.2 : 1.6) + o.scan + p.tw * 1.6 + lvl * 0.5 + pop * 0.6) * Math.max(0.75, u);
      c.fillStyle = `rgba(${p.g ? GOLD : BLUE},${Math.min(1, al)})`;
      c.beginPath(); c.arc(o.x, o.y, sz, 0, TAU); c.fill();
    }
  }
  raf = requestAnimationFrame(frame);

  return {
    el, listen, quiet,
    icon(node) { ic.replaceChildren(node); },
    destroy() { if (gone) return; gone = true; quiet(); cancelAnimationFrame(raf); ro.disconnect(); },
  };
}
