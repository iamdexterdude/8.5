// Service worker: makes 8.5 work offline and start fast, and picks up a new deploy as one piece.
// The build script fills in ASSETS and VERSION.
//  - install: fetch every file of this version fresh (bypassing the browser's HTTP cache) into a cache named for the version
//  - fetch: the saved copy first (instant, works offline); anything not in the list goes to the network
//  - a new version installs in the background when the page checks for updates, takes over at once, and the page reloads once
const VERSION = "202610251930";
const ASSETS = ["./","css/app.css","data/config.json","data/daily.json","data/plan.json","data/speaking-bank.json","fonts/display.woff2","fonts/text.woff2","icons/apple-touch-icon.png","icons/favicon-32.png","icons/icon-192.png","icons/icon-512.png","icons/icon.svg","icons/maskable-512.png","index.html","js/bands.js","js/checkin.js","js/crypto.js","js/daily.js","js/db.js","js/feedkey.js","js/homework.js","js/main.js","js/mocks.js","js/pdf.js","js/publish.js","js/pulse.js","js/srs.js","js/store.js","js/ui.js","js/util.js","js/validate.js","js/views/admin.js","js/views/anki.js","js/views/daily.js","js/views/exam.js","js/views/finish.js","js/views/homework.js","js/views/hwsteps.js","js/views/hwview.js","js/views/mock.js","js/views/progress.js","js/views/settings.js","js/views/today.js","js/views/welcome.js","manifest.webmanifest","vendor/ts-fsrs.mjs"];
const CACHE = "eight-" + VERSION;

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

async function respond(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req, { ignoreSearch: true });
  if (hit) return hit;
  if (req.mode === "navigate") { const idx = (await cache.match("index.html")) || (await cache.match("./")); if (idx) return idx; }
  try {
    const res = await fetch(req);
    if (res.ok && res.type === "basic") cache.put(req, res.clone());
    return res;
  } catch {
    return Response.error();
  }
}

self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.endsWith("course-pack.json")) return; // private, never cached here
  e.respondWith(respond(req));
});
