// Service worker: makes 8.5 work offline, and always picks up a new deploy.
// The build script fills in ASSETS and VERSION.
//  - install: fetch every file fresh (bypassing the browser's 10-minute HTTP cache) into a cache named for this version
//  - code (pages, scripts, styles, data): network first, so a new deploy shows at once; the saved copy is used only when offline or slow
//  - fonts and images: saved copy first
const VERSION = "__VERSION__";
const ASSETS = "__ASSETS__";
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
