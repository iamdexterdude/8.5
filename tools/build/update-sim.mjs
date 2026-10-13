// Simulates a deploy while a browser already has the old version installed (service worker + saved database).
// Serves oldsite/ first, swaps to ../../dist, then reloads the way a real visitor would.
import http from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname, resolve } from "node:path";
import { chromium } from "playwright";

let root = resolve("oldsite");
const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x"); if (u.pathname === "/__swap") { root = resolve("../../dist"); res.end("swapped"); return; }
  let f = join(root, decodeURIComponent(u.pathname.replace(/^\/8\.5/, "")));
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, "index.html");
  if (!existsSync(f)) { res.statusCode = 404; res.end("no"); return; }
  res.setHeader("content-type", types[extname(f)] || "application/octet-stream"); res.setHeader("cache-control", "max-age=600"); res.end(readFileSync(f));
}).listen(8199);

const b = await chromium.launch({ channel: "msedge", headless: true });
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
const p = await ctx.newPage(); const errs = [];
p.on("pageerror", (e) => errs.push("PAGEERROR " + e.message)); p.on("console", (m) => m.type() === "error" && !/404/.test(m.text()) && errs.push(m.text()));
const show = async (label) => { await p.waitForTimeout(2500); const t = await p.innerText("main#view").catch(() => "(no main)"); console.log(label, "-> length", t.length, JSON.stringify(t.slice(0, 90))); };

await p.goto("http://127.0.0.1:8199/8.5/?nowelcome#/today"); await show("old version");
await p.evaluate(() => navigator.serviceWorker.ready); await p.waitForTimeout(1500);
// the old app is used for a bit: some data saved in its database
await p.evaluate(() => { location.hash = "#/review"; }); await p.waitForTimeout(800);
await fetch("http://127.0.0.1:8199/__swap");
console.log("--- new version deployed ---");
await p.reload(); await show("1st reload");
await p.reload(); await show("2nd reload");
await p.evaluate(() => { location.hash = "#/today"; }); await show("Today");
console.log("errors:", JSON.stringify(errs).slice(0, 500));
await b.close(); srv.close();
