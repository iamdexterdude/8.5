// Small helpers: DOM builder, dates in Tashkent time, formatting, icons.

// ---------- DOM ----------
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === "dataset") Object.assign(el.dataset, v);
      else if (k in el && k !== "list" && k !== "type" && k !== "form") { try { el[k] = v; } catch { el.setAttribute(k, v); } }
      else el.setAttribute(k, v === true ? "" : v);
    }
  }
  append(el, children);
  return el;
}
export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

// ---------- Dates (all in Asia/Tashkent, UTC+5, no daylight saving) ----------
const TZ = "Asia/Tashkent";
const urlDate = new URLSearchParams(location.search).get("date"); // for testing only, never saved
export function todayISO() {
  if (urlDate && /^\d{4}-\d{2}-\d{2}$/.test(urlDate)) return urlDate;
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}
export function nowDate() {
  // a Date representing "now" (real time). The ?date= override moves the day only.
  return new Date();
}
const atNoon = (iso) => new Date(iso + "T12:00:00Z");
export function addDays(iso, n) { const d = atNoon(iso); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
export function diffDays(a, b) { return Math.round((atNoon(b) - atNoon(a)) / 864e5); }
export function dowOf(iso) { return atNoon(iso).getUTCDay(); } // 0 = Sunday
export function fmtDate(iso, opts = { weekday: "long", day: "numeric", month: "long" }) {
  return new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: "UTC" }).format(atNoon(iso));
}
export const fmtShort = (iso) => fmtDate(iso, { day: "numeric", month: "short" });
export const fmtDow = (iso) => fmtDate(iso, { weekday: "short" });
// the exact moment a lesson starts, "19:00" in Tashkent
export function lessonMoment(iso, hhmm) { return new Date(`${iso}T${hhmm}:00+05:00`); }
export function nowTimeTashkent() {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
}

// ---------- Formatting ----------
export const mmss = (sec) => { sec = Math.max(0, Math.round(sec)); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`; };
export function hm(min) { const h = Math.floor(min / 60), m = Math.round(min % 60); return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`; }
export function countdownText(ms) {
  if (ms <= 0) return "now";
  const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), hh = Math.floor((s % 86400) / 3600), mm = Math.floor((s % 3600) / 60);
  if (d >= 1) return `${d} d ${hh} h`;
  if (hh >= 1) return `${hh} h ${String(mm).padStart(2, "0")} min`;
  return `${mm} min ${String(s % 60).padStart(2, "0")} s`;
}
export const wordCount = (t) => (t.trim().match(/\S+/g) || []).length;
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- Icons (24px, 1.75 stroke) ----------
const P = {
  today: "M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4M12 8a4 4 0 100 8 4 4 0 000-8z",
  homework: "M6 3h9l4 4v14H6zM15 3v4h4M9 12h6M9 16h6M9 8h2",
  mock: "M4 5h16v11H4zM2 19h20M9 9l2 2 4-4",
  anki: "M4 7h12a2 2 0 012 2v9a2 2 0 01-2 2H4a2 2 0 01-2-2V9a2 2 0 012-2zM8 4h12a2 2 0 012 2v9M7 13h6",
  send: "M4 12l16-8-6 16-2-6z",
  star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z",
  edit: "M4 20h4L19 9a2.1 2.1 0 00-3-3L5 17zM13 7l3 3",
  grid: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  search: "M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4-4",
  volume: "M4 10v4h4l5 4V6l-5 4zM16 9a4 4 0 010 6M18.5 6.5a8 8 0 010 11",
  timer: "M10 2h4M12 8v5l3 2M12 22a8 8 0 100-16 8 8 0 000 16z",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z",
  spark: "M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.8 2.8M14.9 14.9l2.8 2.8M6.3 17.7l2.8-2.8M14.9 9.1l2.8-2.8",
  sun: "M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6L4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M12 7a5 5 0 100 10 5 5 0 000-10z",
  plan: "M5 6h14a1 1 0 011 1v12a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1zM4 10h16M8 3v4M16 3v4",
  practice: "M12 15a3 3 0 003-3V6a3 3 0 00-6 0v6a3 3 0 003 3zM6 11a6 6 0 0012 0M12 17v3M9 20h6",
  review: "M7 8h12a1 1 0 011 1v9a1 1 0 01-1 1H7a1 1 0 01-1-1V9a1 1 0 011-1zM4 15V6a1 1 0 011-1h11",
  progress: "M4 20V10M10 20V4M16 20v-8M22 20H2",
  settings: "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 13a7.7 7.7 0 000-2l2-1.5-2-3.4-2.3.9a7.5 7.5 0 00-1.7-1L15 3.5h-4l-.4 2.5a7.5 7.5 0 00-1.7 1l-2.3-.9-2 3.4 2 1.5a7.7 7.7 0 000 2l-2 1.5 2 3.4 2.3-.9c.5.4 1.1.7 1.7 1l.4 2.5h4l.4-2.5c.6-.3 1.2-.6 1.7-1l2.3.9 2-3.4z",
  play: "M8 5.5v13l11-6.5z",
  pause: "M8 5v14M16 5v14",
  stop: "M7 7h10v10H7z",
  mic: "M12 15a3 3 0 003-3V6a3 3 0 00-6 0v6a3 3 0 003 3zM6 11a6 6 0 0012 0M12 17v3",
  check: "M5 12.5l4.5 4.5L19 7.5",
  plus: "M12 5v14M5 12h14",
  chevron: "M9 6l6 6-6 6",
  back: "M15 6l-6 6 6 6",
  close: "M6 6l12 12M18 6L6 18",
  pen: "M4 20h4L19 9a2.1 2.1 0 00-3-3L5 17z",
  book: "M5 4h10a3 3 0 013 3v13H8a3 3 0 01-3-3zM5 17a3 3 0 013-3h10",
  clock: "M12 7v5l3 2M12 3a9 9 0 100 18 9 9 0 000-18z",
  repeat: "M4 12a8 8 0 0113.7-5.6L20 8M20 4v4h-4M20 12a8 8 0 01-13.7 5.6L4 16M4 20v-4h4",
  download: "M12 4v11M7 11l5 5 5-5M5 20h14",
  upload: "M12 16V5M7 9l5-5 5 5M5 20h14",
  video: "M4 7h11a1 1 0 011 1v8a1 1 0 01-1 1H4a1 1 0 01-1-1V8a1 1 0 011-1zM16 11l5-3v8l-5-3",
  link: "M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1",
  list: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
  flag: "M5 21V4M5 4h11l-2 4 2 4H5",
  moon: "M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z",
  skip: "M6 6l9 6-9 6zM18 6v12",
  trash: "M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  headphones: "M4 14v-2a8 8 0 0116 0v2M4 14h3v6H5a1 1 0 01-1-1zM20 14h-3v6h2a1 1 0 001-1z",
};
export function icon(name, size = 22) {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("width", size); s.setAttribute("height", size);
  s.setAttribute("fill", name === "play" || name === "stop" ? "currentColor" : "none");
  s.setAttribute("stroke", "currentColor"); s.setAttribute("stroke-width", "1.75");
  s.setAttribute("stroke-linecap", "round"); s.setAttribute("stroke-linejoin", "round");
  s.setAttribute("aria-hidden", "true"); s.setAttribute("focusable", "false");
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path"); p.setAttribute("d", P[name] || P.check);
  s.append(p); return s;
}

// pattern shapes: colour never works alone, every pattern also has a shape
export function patternMark(pattern, size = 12) {
  const shapes = {
    Task: "M2 2h8v8H2z",                     // square
    Article: "M6 1.5a4.5 4.5 0 100 9 4.5 4.5 0 000-9z", // circle
    Collocation: "M6 1.5l5 9H1z",            // triangle
    Grammar: "M6 1l5 5-5 5-5-5z",           // diamond
    Template: "M2 2l8 8M10 2l-8 8",          // cross
  };
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 12 12"); s.setAttribute("width", size); s.setAttribute("height", size);
  s.setAttribute("aria-hidden", "true"); s.classList.add("pmark", "p-" + pattern.toLowerCase());
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path"); p.setAttribute("d", shapes[pattern] || shapes.Task);
  if (pattern === "Template") { p.setAttribute("fill", "none"); p.setAttribute("stroke", "currentColor"); p.setAttribute("stroke-width", "2"); p.setAttribute("stroke-linecap", "round"); }
  else p.setAttribute("fill", "currentColor");
  s.append(p); return s;
}
