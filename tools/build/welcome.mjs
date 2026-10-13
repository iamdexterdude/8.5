import { chromium } from "playwright";
const b = await chromium.launch({ channel: "msedge", headless: true });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
const p = await ctx.newPage();
await p.goto("http://127.0.0.1:8123/"); await p.waitForSelector(".welcome");
await p.waitForTimeout(500); await p.screenshot({ path: "shots/w0.png" });
await p.fill(".welcome input", "Dilnoza"); await p.click(".welcome .btn.primary");
for (const [i, t] of [[1, 1500], [2, 2500], [3, 2500], [4, 2500], [5, 2500]]) { await p.waitForTimeout(t); await p.screenshot({ path: `shots/w${i}.png` }); }
await b.close();
