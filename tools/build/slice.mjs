import { chromium } from "playwright";
import { pathToFileURL } from "node:url"; import { resolve } from "node:path";
const [w, scheme, ...ys] = process.argv.slice(2);
const b = await chromium.launch({ channel: "msedge", headless: true });
const c = await b.newContext({ viewport: { width: +w, height: 900 }, colorScheme: scheme }); const q = await c.newPage();
await q.goto(pathToFileURL(resolve("shots/report.html")).href); await q.waitForTimeout(400);
for (const y of ys) await q.screenshot({ path: `shots/slice-${w}-${scheme}-${y}.png`, fullPage: true, clip: { x: 0, y: +y, width: +w, height: 1000 } });
await b.close();
