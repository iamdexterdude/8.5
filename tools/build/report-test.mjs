// Seeds a realistic fortnight of use, builds the report through the real app code, then screenshots it.
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const b = await chromium.launch({ channel: "msedge", headless: true });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
const p = await ctx.newPage(); const errs = [];
p.on("pageerror", (e) => errs.push("PAGEERROR " + e.message)); p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
await p.goto("http://127.0.0.1:8123/?date=2026-10-20&nowelcome"); await p.waitForSelector("main#view > *");
await p.evaluate(async () => {
  const store = await import("/js/store.js"), db = await import("/js/db.js"), srs = await import("/js/srs.js");
  const S = store.S; await store.setSetting("name", "Dilnoza");
  const plan = S.plan.days.filter((d) => d.date <= "2026-10-20");
  // tasks: most done, a few missed
  let n = 0;
  for (const d of plan) { for (const t of store.dayItems(d)) { n++; const skip = (d.date === "2026-10-15" && t.block !== "fix") || (d.date === "2026-10-17" && t.block === "read") || (n % 9 === 0);
      if (!skip) await db.put("tasks", (S.tasks[t.key] = { key: t.key, done: true, doneAt: new Date(Date.parse(d.date + "T14:00:00Z") + (n % 5 === 0 ? 30 * 3600e3 : 0)).toISOString() })); } }
  for (const d of plan) { if (d.type !== "off") { const row = { date: d.date, minutes: 90 + (d.date.charCodeAt(9) % 5) * 25, byKind: {} }; S.study[d.date] = row; await db.put("study", row); } }
  await store.setMinimumDay("2026-10-17", true);
  const now = Date.now();
  const essay = async (i, part, promptId, text, daysAgo, band) => { const created = new Date(now - daysAgo * 864e5).toISOString(); await db.put("essays", { id: "e" + i, createdAt: created, taskKey: "", part, promptId, promptText: part === 2 ? S.plan.prompts.find((x) => x.id === promptId).text : "Summarise the information by selecting and reporting the main features.", text, words: text.split(/\s+/).length, seconds: 2300 + i * 60, minutes: part === 2 ? 40 : 20, rewrite: i === 4, bands: band ? { overall: band } : {}, plan: part === 2 ? "Key words: young people, change jobs. Position: positive." : "", checks: [true, true, false, true, false] }); };
  const para = "Many young people change jobs several times in their first ten years of work. This is mostly a positive development, since it gives them a wide range of skills and a clearer idea of what suits them. However, employers pay for training that is lost when staff leave. ";
  await essay(1, 2, "P1", para.repeat(5), 7, 6.5); await essay(2, 2, "P2", para.repeat(6), 5, 7); await essay(3, 1, "", "The map shows how the farm changed. ".repeat(18), 4, 6.5); await essay(4, 2, "P1", para.repeat(7), 2, null); await essay(5, 2, "P3", para.repeat(6), 0.4, null);
  const blob = new Blob([new Uint8Array(2000)], { type: "audio/webm" });
  for (let i = 0; i < 11; i++) await db.put("recordings", { id: "r" + i, createdAt: new Date(now - (11 - i) * 36e5 * 14).toISOString(), date: ["2026-10-13", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-19", "2026-10-19", "2026-10-20", "2026-10-20", "2026-10-20"][i], part: [1, 2, 2, 3, 3, 2, 3, 2, 1, 2, 3][i], prompt: ["What do you do?", "Describe a person you admire.", "Describe a time you were extremely busy.", "Why do some people change jobs often?", "How has the way people work changed?", "Describe a time you learned something from a mistake.", "How has technology changed communication?", "Describe a piece of technology you could not live without.", "Do you enjoy reading?", "Describe a website you use often.", "Is relying on technology dangerous?"][i], seconds: 28 + i * 9, attempts: 1 + (i % 3), lessonNo: i === 0 ? 1 : null, mode: "", blob });
  for (const [d, src, type, raw, c] of [["2026-10-13", "Cambridge 17 T1 P1", "True/False/Not Given", 9, { fvng: 2, paraphrase: 1, careless: 1 }], ["2026-10-17", "Cambridge 17 Test 2", "Mixed", 33, { paraphrase: 3, fvng: 2, time: 2 }], ["2026-10-20", "Cambridge 16 T3 P2", "Matching headings", 10, { paraphrase: 2, vocab: 1 }]]) await db.put("reading", { id: src, date: d, source: src, type, raw, total: raw > 13 ? 40 : 13, minutesUsed: 20, causes: c });
  await store.addScore({ skill: "reading", raw: 34, note: "Test day" }); S.scores.at(-1).date = "2026-10-17"; await db.put("scores", S.scores.at(-1));
  await store.addScore({ skill: "speaking", criteria: [6.5, 6, 6, 6.5], band: 6.5, note: "Lesson 1 baseline" }); S.scores.at(-1).date = "2026-10-12"; await db.put("scores", S.scores.at(-1));
  await store.addScore({ skill: "writing2", band: 7, note: "P2" }); S.scores.at(-1).date = "2026-10-19"; await db.put("scores", S.scores.at(-1));
  // reviews over several days
  const cards = S.cards.slice(0, 20); let k = 0;
  for (const c of cards) { for (let r = 0; r < 3; r++) { await db.put("reviewlog", { cardId: c.id, rating: [3, 3, 1, 4, 2][(k++) % 5], at: new Date(now - (r * 2 + (k % 3)) * 864e5).toISOString() }); } }
  for (const c of cards.slice(0, 12)) { c.fsrs = { due: new Date(now - 3600e3).toISOString(), stability: 3, difficulty: 5, elapsed_days: 1, scheduled_days: 2, reps: 3, lapses: c === cards[2] ? 5 : 1, state: 2, last_review: new Date(now - 864e5).toISOString() }; c.introduced = "2026-10-14"; await db.put("cards", c); }
  const e0 = S.errors[7]; e0.seen = 4; e0.lastSeen = "2026-10-19"; await store.saveError(e0); const e1 = S.errors[10]; e1.status = "Fixed"; await store.saveError(e1);
  await store.logError({ source: "Essay", wrote: "in the purpose of learning", correct: "in order to learn", pattern: "Collocation" }); await store.logError({ source: "Recording", wrote: "she don't know", correct: "she doesn't know", pattern: "Grammar" });
});
const html = await p.evaluate(async () => { const r = await import("/js/report.js"); const o = await r.buildReportHtml({ includeAudio: true }); return o.html; });
mkdirSync("shots", { recursive: true }); writeFileSync("shots/report.html", html);
console.log("report size KB:", Math.round(html.length / 1024), "errors", JSON.stringify(errs));
for (const [w, h, scheme, name] of [[1280, 900, "light", "dt-light"], [1280, 900, "dark", "dt-dark"], [390, 844, "light", "ph-light"]]) {
  const c2 = await b.newContext({ viewport: { width: w, height: h }, colorScheme: scheme }); const q = await c2.newPage(); const e2 = [];
  q.on("pageerror", (e) => e2.push(e.message)); await q.goto(pathToFileURL(resolve("shots/report.html")).href); await q.waitForTimeout(500);
  await q.screenshot({ path: `shots/rep-${name}.png`, fullPage: true }); console.log(name, "page errors", e2); await c2.close();
}
await b.close();
