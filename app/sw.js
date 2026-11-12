// Service worker: makes 8.5 work offline and start fast, and picks up a new deploy as one piece.
// The build script fills in ASSETS and VERSION.
//  - install: fetch every file of this version fresh (bypassing the browser's HTTP cache) into a cache named for the version
//  - fetch: the saved copy first (instant, works offline); anything not in the list goes to the network
//  - a new version installs in the background when the page checks for updates, takes over at once, and the page reloads once
const VERSION = "__VERSION__";
const ASSETS = "__ASSETS__";
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

// nudges: a note planned by the app on her phone, sent by the relay when its time comes
self.addEventListener("push", (e) => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch {}
  e.waitUntil(self.registration.showNotification(d.title || "8.5", { body: d.body || "", tag: d.tag || "eight", renotify: false, icon: "icons/icon-192.png", badge: "icons/favicon-32.png", data: { url: d.url || "#/today", tag: d.tag || "" } }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const { url = "#/today", tag = "" } = e.notification.data || {};
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of wins) if (c.url.startsWith(self.registration.scope)) { await c.focus(); c.postMessage({ nudge: tag, url }); return; }
    await self.clients.openWindow(self.registration.scope + (tag ? "?n=" + encodeURIComponent(tag) : "") + url);
  })());
});
