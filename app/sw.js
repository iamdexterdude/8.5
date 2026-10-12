// Service worker: makes 8.5 work offline. The build script fills in ASSETS and VERSION.
const VERSION = "__VERSION__";
const ASSETS = "__ASSETS__";
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
