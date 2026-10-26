// Boot, routing and the navigation shell.
window.__booting = Date.now();   // the watchdog in index.html gives a slow first load more time once the modules have started arriving
import * as store from "./store.js";
import { h, icon, clear, todayISO } from "./util.js";
import * as hwm from "./homework.js";
import * as dbm from "./db.js";
import * as pulse from "./pulse.js";

const TABS = [
  { id: "today", label: "Today", href: "#/today", icon: "today" },
  { id: "homework", label: "Homework", href: "#/homework", icon: "homework" },
  { id: "mock", label: "Mock", href: "#/mock", icon: "mock" },
  { id: "anki", label: "Anki", href: "#/anki", icon: "anki" },
  { id: "progress", label: "Progress", href: "#/progress", icon: "progress" },
];
// route head -> [module file, tab that stays highlighted]
const ROUTES = {
  today: ["today", "today"], homework: ["homework", "homework"], mock: ["mock", "mock"], exam: ["exam", "mock"],
  anki: ["anki", "anki"], progress: ["progress", "progress"], settings: ["settings", "today"], admin: ["admin", "today"],
};
const FULLSCREEN = new Set(["exam"]);   // routes that take the whole screen, no tab bar

const viewEl = document.getElementById("view");
const nav = document.querySelector(".nav");
let current = { cleanup: [], key: "" };
let renderToken = 0;

function buildNav() {
  for (const t of TABS) nav.append(h("a", { href: t.href, dataset: { tab: t.id }, "aria-label": t.label }, h("span", { class: "ic" }, icon(t.icon)), h("span", { class: "lb" }, t.label)));
}
function setActiveTab(id) {
  nav.querySelectorAll("a").forEach((a) => (a.dataset.tab === id ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
}

export function parseHash() {
  const raw = location.hash.replace(/^#\/?/, "");
  const [path, qs = ""] = raw.split("?");
  const parts = path.split("/").filter(Boolean).map(decodeURIComponent);
  return { name: parts[0] || "today", params: parts.slice(1), query: Object.fromEntries(new URLSearchParams(qs)) };
}
export const go = (hash) => { location.hash = hash; };

let lastRoute = "";
async function render({ keepScroll = false } = {}) {
  const token = ++renderToken;
  const r = parseHash();
  const [file, tab] = ROUTES[r.name] || ROUTES.today;
  const y = keepScroll ? window.scrollY : 0;
  try {
    const mod = await import(`./views/${file}.js`);
    if (token !== renderToken) return;
    for (const fn of current.cleanup) try { fn(); } catch {}
    current = { cleanup: [], key: location.hash, live: mod.live !== false };
    const ctx = { ...r, onLeave: (fn) => current.cleanup.push(fn), rerender: () => render({ keepScroll: true }) };
    const node = await mod.default(ctx);
    if (token !== renderToken) return;
    const swap = () => {
      if (token !== renderToken) return;   // a newer render has already drawn the screen: never put an older one on top of it
      document.body.classList.toggle("fullscreen-route", FULLSCREEN.has(r.name));
      clear(viewEl).append(node);
      setActiveTab(tab);
      window.scrollTo(0, y);
    };
    // a smooth crossfade between screens where the browser supports it; a plain swap when she is only refreshing the same screen
    if (!keepScroll && lastRoute !== r.name && document.startViewTransition && !document.hidden && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      viewEl.dataset.dir = TABS.findIndex((t) => t.id === tab) >= TABS.findIndex((t) => t.id === (ROUTES[lastRoute]?.[1] || "today")) ? "fwd" : "back";
      // the crossfade needs the browser to paint; if it does not (a hidden tab, a page in the background), draw the screen anyway
      let drawn = false;
      const t = document.startViewTransition(() => { drawn = true; swap(); });
      t.ready?.catch?.(() => {}); t.updateCallbackDone?.catch?.(() => {}); t.finished?.catch?.(() => {});
      setTimeout(() => { if (!drawn) { drawn = true; swap(); try { t.skipTransition(); } catch {} } }, 400);
    } else swap();
    lastRoute = r.name;
    if (!keepScroll) { document.title = "8.5"; viewEl.focus({ preventScroll: true }); }
  } catch (e) {
    console.error(e);
    clear(viewEl).append(h("div", { class: "empty" }, h("h1", null, "Something went wrong"), h("p", null, "Reload the page. Your data is saved on this device."), h("pre", { class: "tiny" }, String(e && e.message))));
  }
}

let rerenderTimer;
store.onChange(() => {
  if (!current.live) return;
  if (store.S.busy > 0) return;                    // she is recording or in an exam: leave the screen alone
  const a = document.activeElement;
  if (a && (a.tagName === "TEXTAREA" || (a.tagName === "INPUT" && a.type === "text"))) return;
  clearTimeout(rerenderTimer); rerenderTimer = setTimeout(() => render({ keepScroll: true }), 30);
});

function applyTheme() {
  const t = store.setting("theme");
  if (t === "light" || t === "dark") document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
  try { localStorage.setItem("eight-theme", t); } catch {}
}
store.onChange(applyTheme);

// the Homework tab gives a small nudge now and then while something is waiting for her
function nudgeLoop() {
  const a = nav.querySelector('a[data-tab="homework"]');
  const tick = () => {
    const t = todayISO(), hw = hwm.homeworkFor(t);
    const pending = hw && !hwm.dayProgress(t, hw).complete && parseHash().name !== "homework";
    a.classList.toggle("pending", !!pending);
    if (pending && !document.hidden) { a.classList.remove("nudge"); void a.offsetWidth; a.classList.add("nudge"); }
  };
  tick(); setInterval(tick, 40000); store.onChange(tick);
}

window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); window.__installPrompt = e; });

function serviceWorker() {
  if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
  const hadController = !!navigator.serviceWorker.controller;
  // a new version takes over and reloads the page once; the guard against a reload loop is lifted after a moment, so a later update in the same tab reloads too
  setTimeout(() => { try { sessionStorage.removeItem("eight-updated"); } catch {} }, 20000);
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (hadController && !sessionStorage.getItem("eight-updated")) { sessionStorage.setItem("eight-updated", "1"); location.reload(); } });
  navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then((r) => {
    const check = () => r.update().catch(() => {});
    check();
    document.addEventListener("visibilitychange", () => { if (!document.hidden) check(); });
  }).catch(() => {});
}

async function boot() {
  buildNav();
  await store.load();
  await hwm.init();
  dbm.onReady(async () => { try { await store.load(); store.changed(); } catch {} });
  applyTheme();
  serviceWorker();
  window.addEventListener("hashchange", () => render());
  document.addEventListener("hw-rerender", () => render({ keepScroll: true }));
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { hwm.refresh(undefined, { force: true }); pulse.noteVisit(); } });
  nudgeLoop();
  pulse.noteVisit();
  if (!store.S.kv.welcomed && !new URLSearchParams(location.search).has("nowelcome")) {
    if (!store.setting("name") && navigator.onLine) await hwm.primeConfig({ timeout: 15000 }).catch(() => {});
    // the first open: the welcome is the opening. The quiet dark screen gives way to it the moment it is on the page.
    const { runWelcome } = await import("./views/welcome.js");
    await render();
    const welcome = runWelcome({ name: hwm.studentName() });
    const sp = document.getElementById("splash"); if (sp) { sp.dataset.gone = "1"; sp.style.transition = "opacity .4s"; sp.style.opacity = "0"; setTimeout(() => sp.remove(), 450); }
    await welcome;
    return;
  }
  await render();
  hideSplash();
}

// the opening screen folds into the dot of 8.5 once the first screen is drawn and the mark has had its moment
export function hideSplash() {
  const s = document.getElementById("splash");
  if (!s || s.dataset.gone) return Promise.resolve();
  s.dataset.gone = "1";
  const start = window.__splash?.start || Date.now(), min = matchMedia("(prefers-reduced-motion: reduce)").matches ? 600 : 8000;   // the four movements take about 7.5 s
  return new Promise((res) => {
    const go = () => {
      const r = s.querySelector(".dot")?.getBoundingClientRect();
      s.style.setProperty("--x", `${r ? r.left + r.width / 2 : innerWidth / 2}px`); s.style.setProperty("--y", `${r ? r.top + r.height / 2 : innerHeight / 2}px`);
      void s.offsetWidth;   // settle the start of the fold before it begins (no animation frame needed: a hidden tab has none)
      s.classList.add("out");
      setTimeout(() => { if (s.isConnected) { s.remove(); res(); } }, 850);
    };
    // the stylesheet is loaded without blocking the first paint; the opening stays until it has arrived (or 8 s, if it never does)
    const cssReady = () => window.__cssReady || [...document.styleSheets].some((s) => /app\.css/.test(s.href || "")) || Date.now() - start > 8000;
    const tick = setInterval(() => { if ((window.__splash?.skip || Date.now() - start >= min) && cssReady()) { clearInterval(tick); go(); } }, 50);
  });
}
boot().catch((e) => {
  document.getElementById("splash")?.remove();
  console.error(e);
  clear(viewEl).append(h("div", { class: "empty" }, h("h1", null, "8.5 could not start"), h("p", null, "Refresh the app. Everything you saved stays on this device."), h("pre", { class: "tiny faint" }, String(e && e.message)),
    h("button", { class: "btn primary", onclick: async () => { try { for (const k of await caches.keys()) await caches.delete(k); for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); } catch {} location.replace(location.pathname + "?r=" + Date.now() + "#/today"); } }, "Refresh the app")));
});
