// Service worker: makes 8.5 work offline, and always picks up a new deploy.
// The build script fills in ASSETS and VERSION.
//  - install: fetch every file fresh (bypassing the browser's 10-minute HTTP cache) into a cache named for this version
//  - code (pages, scripts, styles, data): network first, so a new deploy shows at once; the saved copy is used only when offline or slow
//  - fonts and images: saved copy first
const VERSION = "202610131908";
const ASSETS = ["./","css/app.css","data/config.json","data/plan.json","data/speaking-bank.json","fonts/display.woff2","fonts/text.woff2","icons/apple-touch-icon.png","icons/favicon-32.png","icons/icon-192.png","icons/icon-512.png","icons/icon.svg","icons/maskable-512.png","index.html","js/bands.js","js/crypto.js","js/db.js","js/homework.js","js/ics.js","js/main.js","js/pdf.js","js/publish.js","js/report.js","js/srs.js","js/store.js","js/tasks.js","js/ui.js","js/util.js","js/validate.js","js/views/admin.js","js/views/bandblock.js","js/views/coursework.js","js/views/errors.js","js/views/finish.js","js/views/hwsteps.js","js/views/hwview.js","js/views/join.js","js/views/lesson.js","js/views/model.js","js/views/plan.js","js/views/practice.js","js/views/progress.js","js/views/readlog.js","js/views/review.js","js/views/session.js","js/views/settings.js","js/views/speak.js","js/views/timer.js","js/views/today.js","js/views/watch.js","js/views/welcome.js","js/views/write.js","manifest.webmanifest","report/template.html","reset.html","vendor/ts-fsrs.mjs"];
const CACHE = "eight-" + VERSION;
const SLOW_MS = 4000;

self.addEventListener("install", (e) => {
  const list = Array.isArray(ASSETS) ? ASSETS : [];
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.all(list.map((u) => c.add(new Request(u, { cache: "reload" })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("eight-") && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

const isCode = (req, url) => req.mode === "navigate" || url.pathname.endsWith("/") || /\.(html|js|mjs|css|json|webmanifest)$/.test(url.pathname);

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), SLOW_MS);
    const res = await fetch(req, { cache: "no-cache", signal: ctl.signal }); clearTimeout(t);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === "navigate") return (await cache.match("index.html")) || (await cache.match("./")) || Response.error();
    return Response.error();
  }
}
async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req, { ignoreSearch: true });
  if (hit) return hit;
  try { const res = await fetch(req); if (res.ok) cache.put(req, res.clone()); return res; } catch { return Response.error(); }
}

self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.endsWith("course-pack.json")) return; // private, never cached here
  e.respondWith(isCode(req, url) ? networkFirst(req) : cacheFirst(req));
});
