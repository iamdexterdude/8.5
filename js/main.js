// Boot, routing and the navigation shell.
import * as store from "./store.js";
import { h, icon, clear } from "./util.js";
import * as hwm from "./homework.js";

const TABS = [
  { id: "today", label: "Today", href: "#/today", icon: "today" },
  { id: "plan", label: "Plan", href: "#/plan", icon: "plan" },
  { id: "practice", label: "Practice", href: "#/practice", icon: "practice" },
  { id: "review", label: "Review", href: "#/review", icon: "review" },
  { id: "progress", label: "Progress", href: "#/progress", icon: "progress" },
];
// route head -> [module file, tab that stays highlighted]
const ROUTES = {
  today: ["today", "today"], plan: ["plan", "plan"], lesson: ["lesson", "plan"],
  practice: ["practice", "practice"], write: ["write", "practice"], speak: ["speak", "practice"], read: ["readlog", "practice"], timer: ["timer", "practice"], session: ["session", "today"],
  model: ["model", "today"], review: ["review", "review"], errors: ["errors", "review"],
  progress: ["progress", "progress"], settings: ["settings", "today"], watch: ["watch", "today"], admin: ["admin", "today"], join: ["join", "today"],
};

const viewEl = document.getElementById("view");
const nav = document.querySelector(".nav");
let current = { cleanup: [], key: "" };
let renderToken = 0;

function buildNav() {
  for (const t of TABS) nav.append(h("a", { href: t.href, dataset: { tab: t.id } }, icon(t.icon), h("span", null, t.label)));
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
    clear(viewEl).append(node);
    setActiveTab(tab);
    window.scrollTo(0, y);
    if (!keepScroll) { document.title = "8.5"; viewEl.focus({ preventScroll: true }); }
  } catch (e) {
    console.error(e);
    clear(viewEl).append(h("div", { class: "empty" }, h("h1", null, "Something went wrong"), h("p", null, "Reload the page. Your data is saved on this device."), h("pre", { class: "tiny" }, String(e && e.message))));
  }
}

let rerenderTimer;
store.onChange(() => {
  if (!current.live) return;
  // don't rebuild a view while she is typing or recording inside it
  if (store.S.busy > 0) return;                    // she is recording: leave the screen alone
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

window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); window.__installPrompt = e; });

async function boot() {
  buildNav();
  await store.load();
  await hwm.init();
  applyTheme();
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    const hadController = !!navigator.serviceWorker.controller;
    // when a new version takes over, reload once so the page and its scripts are all the same version
    navigator.serviceWorker.addEventListener("controllerchange", () => { if (hadController && !sessionStorage.getItem("eight-updated")) { sessionStorage.setItem("eight-updated", "1"); location.reload(); } });
    navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then((r) => r.update().catch(() => {})).catch(() => {});
  }
  window.addEventListener("hashchange", () => render());
  document.addEventListener("hw-rerender", () => render({ keepScroll: true }));
  document.addEventListener("visibilitychange", () => { if (!document.hidden && parseHash().name === "today") hwm.refresh(undefined, { force: true }); });
  if (!store.S.kv.welcomed && !new URLSearchParams(location.search).has("nowelcome")) {
    const { runWelcome } = await import("./views/welcome.js");
    await render();
    await runWelcome();
    return;
  }
  render();
}
boot().catch((e) => {
  console.error(e);
  clear(viewEl).append(h("div", { class: "empty" }, h("h1", null, "8.5 could not start"), h("p", null, "Close every 8.5 tab and open it again. If it still does not start, clear this site's data in your browser settings. Your homework and cards are not lost on your teacher's side."),
    h("button", { class: "btn primary", onclick: async () => { try { for (const k of await caches.keys()) await caches.delete(k); for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); } catch {} location.reload(); } }, "Refresh the app")));
});
