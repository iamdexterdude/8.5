import { chromium } from "playwright";
const base = process.argv[2] || "https://iamdexterdude.github.io/8.5/";
const b = await chromium.launch({ channel: "msedge", headless: true });
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
// tab A: the OLD app's database (version 1, no homework stores), kept open like an old tab would
const a = await ctx.newPage(); await a.goto(base + "manifest.webmanifest");
await a.evaluate(() => new Promise((res) => { const r = indexedDB.open("eight", 1); r.onupgradeneeded = () => { for (const n of ["kv","tasks","errors","cards","reviewlog","essays","recordings","scores","reading","study","pack"]) r.result.createObjectStore(n, n === "reviewlog" ? { autoIncrement: true } : { keyPath: n === "tasks" ? "key" : n === "study" ? "date" : n === "kv" || n === "pack" ? "key" : "id" }); }; r.onsuccess = () => { window.__held = r.result; res(); }; }));
const p = await ctx.newPage(); const errs = [];
p.on("pageerror", (e) => errs.push("PAGEERROR " + e.message)); p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
await p.goto(base + "?nowelcome#/today"); await p.waitForTimeout(11000);
console.log("main content length with the old tab still open:", (await p.innerText("main#view")).length, JSON.stringify((await p.innerText("main#view")).slice(0, 120)));
console.log("errors:", JSON.stringify(errs).slice(0, 400));
await b.close();
