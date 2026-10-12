// Service worker: makes Eight work offline. The build script fills in ASSETS and VERSION.
const VERSION = "202610120308";
const ASSETS = ["./","css/app.css","data/config.json","data/plan.json","data/speaking-bank.json","fonts/display.woff2","fonts/text.woff2","icons/apple-touch-icon.png","icons/favicon-32.png","icons/icon-192.png","icons/icon-512.png","icons/icon.svg","icons/maskable-512.png","index.html","js/bands.js","js/db.js","js/ics.js","js/main.js","js/srs.js","js/store.js","js/tasks.js","js/ui.js","js/util.js","js/views/bandblock.js","js/views/errors.js","js/views/lesson.js","js/views/plan.js","js/views/practice.js","js/views/progress.js","js/views/readlog.js","js/views/review.js","js/views/session.js","js/views/settings.js","js/views/speak.js","js/views/timer.js","js/views/today.js","js/views/watch.js","js/views/welcome.js","js/views/write.js","manifest.webmanifest","vendor/ts-fsrs.mjs"];
const CACHE = "eight-" + VERSION;

self.addEventListener("install", (e) => {
  const list = Array.isArray(ASSETS) ? ASSETS : [];
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(list.map((u) => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("eight-") && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.endsWith("course-pack.json")) return; // private, never cached here
  // cache first, refresh in the background; page loads fall back to the app shell when offline
  e.respondWith(caches.open(CACHE).then(async (cache) => {
    const hit = await cache.match(req, { ignoreSearch: true });
    const net = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
    if (hit) { net.catch(() => {}); return hit; }
    const res = await net;
    if (res) return res;
    if (req.mode === "navigate") return (await cache.match("index.html")) || (await cache.match("./")) || Response.error();
    return Response.error();
  }));
});
