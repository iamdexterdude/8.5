// End-to-end checks for the course decks, on the private build (course pack loaded). Usage: node decks-flow.mjs [baseUrl]
import { chromium } from "playwright";
const base = process.argv[2] || "http://127.0.0.1:8125/";
const b = await chromium.launch({ channel: "msedge", headless: true, args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "light", permissions: ["microphone"] });
const p = await ctx.newPage(); const errs = []; let pass = 0, fail = 0;
p.on("pageerror", (e) => errs.push("PAGEERROR " + e.message)); p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
const ok = (c, m) => { c ? pass++ : fail++; console.log(c ? "  ok  " : "  FAIL", m); };
const go = async (h) => { await p.evaluate((x) => { location.hash = x; }, h); await p.waitForTimeout(500); };
await p.goto(base + "?date=2026-10-15&nowelcome"); await p.waitForSelector("main#view > *"); await p.waitForTimeout(1500);

let t = await p.innerText("main#view");
ok(/Today's speaking/.test(t) && /Today's reading/.test(t) && /Today's decks/.test(t), "Today shows speaking, reading and the day's decks");
ok(/When was the last time you had a day off/.test(t), "Part 1 questions for the topic are listed");

// model answer page
await p.getByRole("link", { name: "Model answer" }).first().click(); await p.waitForSelector(".model-text"); await p.waitForTimeout(300);
t = await p.innerText("main#view");
ok(/Questions/.test(t) && /Words and phrases/.test(t) && /Run errands/.test(t), "model answer page shows questions, the answer text and the words");
await p.screenshot({ path: "shots/dk-model.png" });
await p.getByRole("button", { name: /I have read and listened/ }).click(); await p.waitForSelector("text=Today's tasks");
ok((await p.getByRole("checkbox", { name: /Mark not done: Read and listen to the model answer: Having a Day Off/ }).count()) === 1, "reading the model answer ticks its homework");

// a deck session, named after its source, over every card in it
await go("#/review");
await p.locator("a.btn", { hasText: /^Review$/ }).first().click(); await p.waitForSelector(".flash");
const name = await p.innerText("main#view h1"); ok(/Speaking Part 1|Reading/.test(name), "deck session is named after its deck: " + name);
const total = Number((await p.innerText("main#view .kicker").catch(() => "0")).match(/(\d+) cards/)?.[1] || 0);
let n = 0; for (; n < 60; n++) { if (!(await p.locator(".flash").count())) break; await p.keyboard.press("Space"); await p.waitForSelector(".grades"); await p.keyboard.press("3"); await p.waitForTimeout(300); }
ok(total > 0 && n === total, `went through every card of the deck (${n} of ${total}) with no daily limit`);
await p.waitForSelector("text=Session complete");

// all of today's words in one go
await go("#/today");
ok((await p.getByRole("checkbox", { name: /Learn today's new words/ }).count()) === 1, "the day has one 'Learn today's new words' task");
await go("#/review/session?day=2026-10-15"); await p.waitForSelector(".flash");
ok(/Today's new words/.test(await p.innerText("main#view h1")), "review all of today's decks in one session");

// recording with the course's questions
await go("#/speak?mode=part1&unit=p1-130&from=2026-10-15"); await p.waitForSelector(".recbtn");
ok(/When was the last time you had a day off/.test(await p.innerText("main#view")), "recording uses the course's questions for the topic");

// Review lists each deck by its name
await go("#/review"); t = await p.innerText("main#view");
ok(/Reading: Day 4, Passage 3/.test(t) && /Speaking Part 1: Having a Day Off/.test(t), "Review lists every deck by name");

// a later day's decks are not there yet (they open on their day)
ok(!/Day 12, Passage/.test(t), "decks for later days are not in the deck yet");

// the report lists the decks
await go("#/progress"); await p.waitForSelector("text=Send your progress to your teacher");
const html = await p.evaluate(async () => (await (await import("/js/report.js")).buildReportHtml()).data.decks.length);
ok(html >= 10, `the progress report carries the decks (${html})`);

console.log("errors", JSON.stringify(errs), `\n${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
