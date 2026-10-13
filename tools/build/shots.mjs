// Screenshots of key screens: node shots.mjs <label> <width> <height> <theme> <date> route1 route2 ...
import { chromium } from "playwright";
const [label, w, h, theme, date, ...routes] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "msedge", headless: true });
const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, colorScheme: theme, deviceScaleFactor: 1, permissions: ["microphone"] });
const page = await ctx.newPage();
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push("PAGEERROR " + e.message));
await page.goto(`http://127.0.0.1:8123/?date=${date}&nowelcome`);
await page.waitForSelector("main#view > *");
for (const r of routes) {
  await page.evaluate((r) => { location.hash = r; }, r);
  await page.waitForTimeout(450);
  const name = r.replace(/[^a-z0-9]+/gi, "_").slice(0, 40);
  await page.screenshot({ path: `shots/${label}-${theme}-${name}.png`, fullPage: false });
}
console.log("ERRORS", JSON.stringify(errors));
await browser.close();
