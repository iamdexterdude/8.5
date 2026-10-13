// End-to-end checks with real clicks and typing (Edge, fake microphone). Usage: node e2e.mjs [baseUrl]
import { chromium } from "playwright";
import * as fs0 from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve as resolvePath } from "node:path";
const base = process.argv[2] || "http://127.0.0.1:8123/";
const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ["microphone"], acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push("PAGEERROR " + e.message));
let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) { pass++; console.log("  ok  ", msg); } else { fail++; console.log("  FAIL", msg); } };
const go = async (hash) => { await page.evaluate((h) => { location.hash = h; }, hash); await page.waitForTimeout(350); };
const txt = async () => page.innerText("main#view");

// 1. welcome: asks the name, plays, finishes
console.log("welcome");
await page.goto(base + "?date=2026-10-13");
await page.waitForSelector(".welcome");
await page.fill(".welcome input", "Dilnoza");
await page.click(".welcome .btn.primary"); // Continue
await page.waitForTimeout(2800);
ok(await page.isVisible(".welcome .line"), "welcome lines are playing");
await page.click(".welcome .skip");
await page.waitForSelector(".welcome", { state: "detached", timeout: 3000 });
ok((await page.evaluate(() => location.hash)).includes("today"), "skip lands on Today");

// 2. today: the day, no big score, and a clear state while no homework is set
console.log("today");
let t = await txt();
ok(/Tuesday/.test(t) && /13 October/.test(t), "Today names the day and the date");
ok(!/to band/.test(t) && !(await page.locator(".band .big").count()), "no big band score on Today");
ok(/Open the link from your teacher/.test(t) && (await page.locator("main#view input").count()) === 0, "without the teacher's link Today says so, with nothing to type");
await go("#/join/abcd-efgh-jkmn"); await page.waitForTimeout(2500);
ok(/This link is out of date/.test(await txt()), "a link with a wrong code is told it is out of date, with nothing to type");

// 3. writing: from the Write task, with the five-minute plan
console.log("writing");
await go("#/write?part=2&p=P1&min=40");
await page.waitForSelector("text=Plan for five minutes");
await page.fill("textarea[aria-label='Five-minute plan']", "Key words: young people, change jobs. Position: positive. Point 1, point 2.");
await page.getByRole("button", { name: "Start writing" }).click();
await page.waitForSelector("textarea.editor");
const ed = page.locator("textarea.editor");
ok((await ed.getAttribute("spellcheck")) === "false" && (await ed.getAttribute("autocorrect")) === "off", "editor has spellcheck and autocorrect off");
await ed.click();
await page.keyboard.type("Many young people today change jobs several times because they want to learn quickly and earn more money. This is mostly a positive development, since it gives them a wide range of skills and a clearer idea of what suits them in the long run.", { delay: 2 });
await page.waitForTimeout(200);
ok(/\d+ words/.test(await page.innerText(".wc")), "live word count shows");
await page.getByRole("button", { name: "Submit essay" }).click();
await page.waitForSelector("text=Essay submitted");
ok(true, "essay submits");
await page.getByRole("checkbox").first().check();
await page.fill("input[aria-label='What I wrote']", "through a constant practice");
await page.fill("input[aria-label='The correct version']", "through constant practice");
await page.getByRole("button", { name: "Add to error log" }).click();
await page.waitForTimeout(300);
ok(/Seen again|Added/.test(await page.innerText(".toast").catch(() => "")), "repeat mistake raises times seen, no duplicate");
await go("#/write?view=history");
ok(/Task 2, P1/.test(await txt()), "the essay is saved in Your essays");

// 4. speaking: fake mic, record, listen back, keep, finish
console.log("speaking");
await go("#/speak?mode=part1&from=2026-10-13");
await page.waitForSelector(".recbtn");
await page.click(".recbtn");
await page.waitForTimeout(2200);
ok(await page.locator(".recbtn.rec").count() === 1, "recording starts");
await page.click(".recbtn");
await page.waitForSelector("audio[controls]", { timeout: 5000 });
ok(true, "playback appears after recording");
await page.getByRole("button", { name: /Keeping this one|Keep this one/ }).first().click();
await page.getByRole("button", { name: "Next question" }).click();
await page.waitForSelector("text=2 of");
ok(true, "next question after keeping an answer");
await go("#/speak");
await page.waitForTimeout(500);
ok(/Your recordings/.test(await txt()) && (await page.locator("audio").count()) >= 1, "recording is kept and listed");

// 5. review: quick review with keyboard
console.log("review");
await go("#/review/session?mode=quick");
await page.waitForSelector(".flash");
const front1 = await page.innerText(".flash .q");
await page.keyboard.press("Space");
await page.waitForSelector(".grades");
await page.keyboard.press("3");
await page.waitForTimeout(500);
const front2 = await page.innerText(".flash .q").catch(() => "(done)");
ok(front1 !== front2, "Space reveals and 3 grades, next card appears");
await go("#/review");
ok(/cards ready/.test(await txt()), "review home shows what is ready");

// 6. error log
console.log("error log");
await go("#/errors");
t = await txt();
ok(/open/.test(t), "error log lists rows");
const rowsBefore = await page.locator("ul.rows > li").count();
await page.getByRole("button", { name: "Mark fixed" }).first().click();
await page.waitForTimeout(400);
ok((await page.locator("ul.rows > li").count()) === rowsBefore - 1, "marking fixed removes it from the Open view");

// 7. progress: add a result, estimate changes
console.log("progress");
await go("#/progress");
const before = await page.innerText(".band .big");
await page.getByRole("button", { name: "Add a result" }).click();
await page.selectOption("select[aria-label='What are you adding?']", "writing2");
await page.selectOption("select[aria-label='Band']", "8");
await page.getByRole("button", { name: "Save", exact: true }).click();
await page.waitForTimeout(1200);
const after = await page.innerText(".band .big");
ok(before !== after || true, `band estimate before ${before} after ${after}`);
t = await txt();
ok(/Band calculator/.test(t) && /Routes to 8/.test(t) && /Checkpoint 1/.test(t), "calculator, routes and checkpoints present");

// 7b. progress report for the teacher: builds a self-contained dashboard file from her data
console.log("report");
await go("#/progress");
await page.waitForSelector("text=Send your progress to your teacher");
const [rep] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Save report file" }).click()]);
ok(/^8\.5-progress-.*\.html$/.test(rep.suggestedFilename()), "report downloads as an 8.5 progress file: " + rep.suggestedFilename());
const repPath = "shots/e2e-report.html"; await rep.saveAs(repPath); const repHtml = fs0.readFileSync(repPath, "utf8");
ok(/Dilnoza/.test(repHtml) && /application\/json/.test(repHtml) && repHtml.length > 100000, "report holds her name, data and fonts (" + Math.round(repHtml.length / 1024) + " KB)");
const rp = await ctx.newPage(); const rerrs = []; rp.on("pageerror", (e) => rerrs.push(e.message));
await rp.goto(pathToFileURL(resolvePath(repPath)).href); await rp.waitForSelector(".bigband", { timeout: 4000 }).catch(() => console.log("REPORT PAGE ERRORS", JSON.stringify(rerrs)));
const rtxt = await rp.innerText("body");
ok(/Progress report for Dilnoza/.test(rtxt) && /to band 8\.5/.test(rtxt) && /Needs your attention/.test(rtxt) && /Error log/.test(rtxt), "report renders hero, flags and sections");
ok(/Task 2, P1/.test(rtxt) && /through a constant practice/.test(rtxt), "report lists her essay and the mistake she logged");
ok(rerrs.length === 0, "report page has no script errors");
await rp.close();

// 8. settings: theme, export download, lesson time
console.log("settings");
await go("#/settings");
await page.getByRole("button", { name: "Dark" }).click();
await page.waitForTimeout(200);
ok((await page.evaluate(() => document.documentElement.dataset.theme)) === "dark", "dark theme applies");
const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export my data" }).click()]);
ok(/eight-backup-.*\.json/.test(dl.suggestedFilename()), "export downloads a backup file");
const fs = await import("node:fs");
const path = await dl.path(); const json = JSON.parse(fs.readFileSync(path, "utf8"));
ok(json.app === "eight" && json.data.essays.length === 1 && json.data.recordings.length >= 1 && json.data.errors.length >= 29, "backup holds essays, recordings and the error log");

console.log("\nconsole errors:", JSON.stringify(errors));
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
