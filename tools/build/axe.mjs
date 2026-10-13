import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const axe = readFileSync("node_modules/axe-core/axe.min.js", "utf8");
const base = process.argv[2] || "http://127.0.0.1:8123/";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const routes = ["#/today", "#/plan", "#/plan/day/2026-10-14", "#/plan/week/1", "#/lesson/2", "#/practice", "#/review", "#/errors", "#/progress", "#/settings", "#/write?part=2&p=P1&min=40", "#/speak", "#/read?min=20", "#/timer?m=20", "#/session", "#/admin"];
const extra = base.includes("8125") ? ["#/model/p1-130", "#/model/p2-97", "#/model/p3-work", "#/review/session?deck=d-speaking-part-1-having-a-day-off-19", "#/review/session?day=2026-10-15", "#/plan/day/2026-10-15"] : [];
routes.push(...extra);
let total = 0;
for (const scheme of ["light", "dark"]) for (const [w, h] of [[390, 844], [1280, 800]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme });
  const page = await ctx.newPage();
  await page.goto(base + "?date=2026-10-15&nowelcome"); await page.waitForSelector("main#view > *");
  for (const r of routes) {
    await page.evaluate((r) => { location.hash = r; }, r); await page.waitForTimeout(400);
    await page.evaluate(axe);
    const res = await page.evaluate(async () => await axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa", "best-practice"] }));
    const bad = res.violations.filter((v) => ["serious", "critical", "moderate"].includes(v.impact));
    for (const v of bad) { total++; console.log(`${scheme} ${w} ${r} [${v.impact}] ${v.id}: ${v.nodes.length} nodes, e.g. ${v.nodes[0].html.slice(0, 110)}`); }
  }
  await ctx.close();
}
console.log("violations (moderate or worse):", total);
await browser.close();
