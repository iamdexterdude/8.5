// Does the app keep her name across a reload, even while an OLD copy of the app holds the old database open in another tab?
import { chromium } from "playwright";
const base = process.argv[2] || "http://127.0.0.1:8123/";
const b = await chromium.launch({ channel: "msedge", headless: true });
const ctx = await b.newContext({ viewport: { width: 1000, height: 800 } });
const a = await ctx.newPage(); await a.goto(base + "manifest.webmanifest");
await a.evaluate(() => new Promise((res) => { const r = indexedDB.open("eight", 1); r.onupgradeneeded = () => { for (const n of ["kv","tasks","errors","cards","reviewlog","essays","recordings","scores","reading","study","pack"]) r.result.createObjectStore(n, n === "reviewlog" ? { autoIncrement: true } : { keyPath: n === "tasks" || n === "kv" || n === "pack" ? "key" : n === "study" ? "date" : "id" }); }; r.onsuccess = () => { window.__held = r.result; res(); }; }));
const p = await ctx.newPage(); const t0 = Date.now();
await p.goto(base, { timeout: 120000 }); await p.waitForSelector(".welcome", { timeout: 60000 });
console.log("welcome appears after", Date.now() - t0, "ms (old tab still holding the old database)");
await p.fill(".welcome input", "Dexter"); await p.click(".welcome .btn.primary"); await p.waitForTimeout(800); await p.click(".welcome .skip"); await p.waitForTimeout(1200);
await p.reload(); await p.waitForSelector("main#view > *", { timeout: 60000 }); await p.waitForTimeout(1500);
console.log("after reload the welcome is back:", await p.locator(".welcome").count() > 0, "| name remembered:", /Dexter/.test(await p.innerText("main#view")), "| 'not being saved' banner:", await p.locator(".nosave").count());
await b.close();
