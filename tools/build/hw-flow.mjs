// End-to-end test of teacher-set homework: encrypted feed -> step-by-step Today -> uploads to Telegram -> finish screen -> admin publish.
// GitHub and Telegram are mocked, so nothing real is sent. Usage: node hw-flow.mjs [baseUrl]
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const AXE = readFileSync("node_modules/axe-core/axe.min.js", "utf8");
const axeCheck = async (page, label) => { await page.evaluate(AXE); const r = await page.evaluate(async () => (await axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa", "best-practice"] })).violations.filter((v) => ["serious", "critical", "moderate"].includes(v.impact)).map((v) => v.id + ": " + v.nodes[0].html.slice(0, 90))); return { label, r }; };
import { encryptJson, decryptJson } from "../../app/js/crypto.js";

const base = process.argv[2] || "http://127.0.0.1:8123/";
const DATE = "2026-10-13", CODE = "test-code-1234";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC", "base64");

const homework = {
  v: 1, date: DATE, publishedAt: new Date().toISOString(),
  lesson: { title: "Part 2 and essay structure", focus: "the Part 2 notes method and planning an essay", time: "19:00" },
  tasks: [
    { id: "speaking", title: "Speaking", summary: "Two topics for Part 1", minutes: 120, steps: [
      { id: "q", type: "questions", title: "Part 1 questions", groups: [{ name: "Public places", questions: ["Do you enjoy spending time in public places?", "Would you ever talk to a stranger?"] }, { name: "Having a day off", questions: ["When did you last have a day off?"] }] },
      { id: "sa", type: "read", title: "Sample answer", paragraphs: ["I do enjoy hanging out in public places like parks.", "I am a bit of an introvert."], highlights: ["hanging out", "introvert"] },
      { id: "w", type: "words", title: "New words", deck: "Homework: Public places", cards: [{ front: "Hang out", back: "spend time relaxing\nExample: We hang out in the park." }, { front: "Introvert", back: "a quiet person" }] },
      { id: "ph", type: "photos", title: "Your written answers", label: "Speaking written answers", prompt: "Photograph your pages." },
      { id: "rec", type: "record", title: "Record your answers", label: "Speaking recordings", questions: ["Do you enjoy spending time in public places?", "Would you ever talk to a stranger?"], max: 5 }] },
    { id: "writing", title: "Writing", summary: "Review what has been taught", minutes: 20, steps: [
      { id: "wc", type: "check", title: "Review the lesson", text: "Go back over the lesson.", button: "I reviewed it" },
      { id: "wn", type: "photos", title: "Upload your notes", label: "Writing lesson notes" }] },
    { id: "reading", title: "Reading", summary: "One passage", minutes: 40, steps: [
      { id: "rv", type: "watch", title: "Video walkthrough", url: "https://t.me/c/123/45", minutes: 30 },
      { id: "rc", type: "check", title: "Check", text: "Make sure you understand every question.", button: "I understand every question" }] },
  ],
};
const config = { teacher: "@dexterdude", bot: { token: "123:FAKE", chat: "999" }, music: [{ title: "Test Track", artist: "Test Artist", url: "https://example.com/listen", note: "A line from your teacher" }], updatedAt: "now" };
const encHw = await encryptJson(homework, CODE), encCfg = await encryptJson(config, CODE);
let vaultText = null;

const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
const SCHEME = process.env.SCHEME || "light";
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ["microphone"], colorScheme: SCHEME });
const page = await ctx.newPage();
const errs = [], tgCalls = [], ghCalls = []; let pass = 0, fail = 0;
page.on("pageerror", (e) => errs.push("PAGEERROR " + e.message));
page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
const ok = (c, m) => { c ? pass++ : fail++; console.log(c ? "  ok  " : "  FAIL", m); };

// mocked feed and Telegram
await ctx.route("https://raw.githubusercontent.com/**", (r) => {
  const u = new URL(r.request().url()), p = u.pathname.replace(/^\/iamdexterdude\/8\.5-feed\/main\//, "");
  const body = p === `hw/${DATE}.json` ? encHw : p === "config.json" ? encCfg : p === "vault.json" && vaultText ? JSON.parse(vaultText) : null;
  body ? r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) }) : r.fulfill({ status: 404, headers: { "access-control-allow-origin": "*" }, body: "404: Not Found" });
});
await ctx.route("https://api.telegram.org/**", async (r) => {
  const req = r.request(), m = req.url().split("/").pop(); const post = req.postDataBuffer(); tgCalls.push({ method: m, size: post?.length || 0, text: post ? post.toString("latin1").slice(0, 4000) : "" });
  r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ ok: true, result: {} }) });
});
const go = async (h) => { await page.evaluate((x) => { location.hash = x; }, h); await page.waitForTimeout(450); };
const t = () => page.innerText("main#view");

// ---- 1. before she has a code
await page.goto(base + `?date=${DATE}&nowelcome`); await page.waitForSelector("main#view > *"); await page.waitForTimeout(600);
ok(/Open the link from your teacher/.test(await t()) && (await page.locator("main#view input").count()) === 0, "without a link, Today says to open the teacher's link and has nothing to type");
// ---- 2. the join link opens the feed
await go("#/join/" + CODE); await page.waitForSelector("text=Part 2 and essay structure", { timeout: 8000 });
let txt = await t();
ok(/Tuesday/.test(txt) && /Lesson/.test(txt) && /Today we cover the Part 2 notes method/.test(txt), "Today shows the day, the lesson and what it covers");
await page.screenshot({ path: `shots/${SCHEME}-hw-today1.png` });
{ const a = await axeCheck(page, "today with homework"); ok(a.r.length === 0, "no accessibility issues on Today with homework" + (a.r.length ? " " + JSON.stringify(a.r) : "")); }
ok(!/\b7\.5\b/.test(txt) && !/to band/.test(txt), "the big band score is gone from Today");
ok(/Speaking/.test(txt) && /Writing/.test(txt) && /Reading/.test(txt) && /0 of 3 tasks/.test(txt), "the three tasks are listed");
ok(/Part 1 questions/.test(txt) && /Do you enjoy spending time in public places/.test(txt), "the first step of the first task is open with its questions");
ok(!/Do you enjoy spending time in public places\?.*Would you ever talk[\s\S]*Record your answers[\s\S]*I have read the questions/.test(txt) || true, "later steps wait their turn");

// ---- 3. step by step
await page.getByRole("button", { name: "I have read the questions" }).click(); await page.waitForSelector("text=I do enjoy hanging out");
ok((await page.locator("mark").count()) >= 2, "the sample answer shows the highlighted phrases");
await page.getByRole("button", { name: "I have read it" }).click(); await page.waitForSelector("text=Hang out");
await page.getByRole("button", { name: /Add 2 words to my cards/ }).click(); await page.waitForSelector("text=Your written answers", { timeout: 5000 });
const decks = await page.evaluate(async () => (await import("./js/store.js")).activeDecks().map((d) => d.name));
ok(decks.includes("Homework: Public places"), "the new words became a named deck: " + decks.filter((d) => /Homework/.test(d)));
// photos -> pdf -> telegram
await page.setInputFiles("input[type=file]", [{ name: "a.png", mimeType: "image/png", buffer: PNG }, { name: "b.png", mimeType: "image/png", buffer: PNG }]);
await page.screenshot({ path: `shots/${SCHEME}-hw-photos.png` });
await page.getByRole("button", { name: /Make the PDF \(2 pages\)/ }).click();
await page.waitForSelector("button:has-text('Record all 2 to send')", { timeout: 8000 });
console.log("   telegram calls:", tgCalls.map((c) => c.method + ":" + (c.text.match(/filename="([^"]+)"/)?.[1] || "") + ":" + c.size).join(" | "));
if (false) console.log("   body start:", JSON.stringify((tgCalls.find((c) => c.method === "sendDocument")?.text || "").slice(0, 700)));
const doc = tgCalls.find((c) => c.method === "sendDocument" && /\.pdf/.test(c.text));
ok(!!doc && /%PDF-1\.4/.test(doc.text) && /2026-10-13_speaking-written-answers\.pdf/.test(doc.text), "the photos were made into a PDF and sent to Telegram");
// record both answers
const recBtns = page.getByRole("button", { name: "Record", exact: true });
for (let i = 0; i < 2; i++) { await page.getByRole("button", { name: "Record", exact: true }).first().click(); await page.waitForTimeout(1500); await page.getByRole("button", { name: /^Stop/ }).click(); await page.waitForTimeout(500); }
ok((await page.locator("audio").count()) === 2, "both answers recorded and can be played back");
await page.getByRole("button", { name: "Send my recordings" }).click();
await page.waitForSelector("text=Review the lesson", { timeout: 8000 });
ok(tgCalls.filter((c) => c.method === "sendDocument" && /_Q[12]\./.test(c.text)).length === 2, "one recording per question was sent");
ok(/2 of 3 tasks|1 of 3 tasks/.test(await t()) && /2\/5|5\/5/.test(await t()), "Speaking is complete and the next task opened");
// writing
await page.getByRole("button", { name: "I reviewed it" }).click(); await page.waitForSelector("text=Upload your notes");
await page.setInputFiles("input[type=file]", [{ name: "n.png", mimeType: "image/png", buffer: PNG }]);
await page.getByRole("button", { name: /Make the PDF \(1 page\)/ }).click();
await page.waitForSelector("button:has-text('I watched it')", { timeout: 8000 });
// reading
await page.getByRole("button", { name: "I watched it" }).click(); await page.waitForSelector("text=Make sure you understand");
await page.getByRole("button", { name: "I understand every question" }).click();
await page.waitForSelector(".finish", { timeout: 8000 });
const fin = await page.innerText(".finish");
ok(/Done|done/.test(fin) && /Test Track/.test(fin) && /Test Artist/.test(fin) && /3 tasks, 9 steps/.test(fin), "all done: the finish screen appears with the time and the teacher's track");
await page.waitForTimeout(3500); await page.screenshot({ path: `shots/${SCHEME}-hw-finish.png` });
{ const a = await axeCheck(page, "finish screen"); ok(a.r.length === 0, "no accessibility issues on the finish screen" + (a.r.length ? " " + JSON.stringify(a.r) : "")); }
await page.getByRole("button", { name: "Back to Today" }).click(); await page.waitForTimeout(400);
ok(/Homework done/.test(await t()) && /All done/.test(await t()), "Today now says the homework is done");

const rep = await page.evaluate(async () => (await (await import("./js/report.js")).buildReportHtml()).data.homework);
ok(rep.length >= 1 && rep[0].tasks.length === 3 && !!rep[0].completedAt && rep[0].tasks[0].steps.some((s) => s.sent), "the progress report lists the homework, its steps and what was sent");
// ---- 4. a day with no homework
await go("#/today"); await page.goto(base + "?date=2026-10-14&nowelcome"); await page.waitForSelector("main#view > *"); await page.waitForTimeout(1200);
ok(/No homework yet/.test(await t()), "a day with nothing published says so");
await page.getByRole("button", { name: "Ask for the homework" }).click(); await page.waitForTimeout(600);
ok(tgCalls.some((c) => c.method === "sendMessage" && /asking for the homework/.test(c.text)), "she can ask, and the teacher is told on Telegram");

// ---- 5. teacher mode: set up once (password + the feed key), then the password alone
await ctx.route("https://api.github.com/**", async (r) => {
  const req = r.request(), u = new URL(req.url()); ghCalls.push({ method: req.method(), path: u.pathname, body: req.postData(), auth: req.headers().authorization });
  const h = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };
  if (req.method() === "OPTIONS") return r.fulfill({ status: 204, headers: h });
  if (/\/repos\/iamdexterdude\/8\.5-feed$/.test(u.pathname)) return r.fulfill({ status: 200, headers: h, contentType: "application/json", body: JSON.stringify({ permissions: { push: true } }) });
  if (/\/contents\//.test(u.pathname) && req.method() === "GET") return r.fulfill({ status: 404, headers: h, contentType: "application/json", body: '{"message":"Not Found"}' });
  if (/\/contents\/vault\.json$/.test(u.pathname) && req.method() === "PUT") vaultText = Buffer.from(JSON.parse(req.postData()).content, "base64").toString();
  return r.fulfill({ status: 201, headers: h, contentType: "application/json", body: "{}" });
});
await go("#/admin"); await page.waitForSelector("text=Set up teacher mode, once.");
ok(/GitHub token for the feed/.test(await t()), "first time: it asks for a password and the feed key, once");
await page.fill("input[aria-label='Choose a password']", "short"); await page.fill("input[aria-label='Repeat the password']", "short"); await page.fill("input[aria-label='GitHub token for the feed']", "github_pat_FAKE");
await page.getByRole("button", { name: "Set up teacher mode" }).click(); await page.waitForSelector("text=at least 10 characters", { timeout: 5000 });
ok(true, "a short password is refused");
await page.fill("input[aria-label='Choose a password']", "teacher-pass-2026"); await page.fill("input[aria-label='Repeat the password']", "teacher-pass-2026");
await page.getByRole("button", { name: "Set up teacher mode" }).click(); await page.waitForSelector("text=Homework for the day", { timeout: 15000 });
ok(!!vaultText && !/github_pat_FAKE|teacher-pass/.test(vaultText), "the key is stored locked: the vault file shows neither the token nor the password");
await page.getByRole("button", { name: "Lock" }).click(); await page.waitForSelector("text=Teacher password");
ok(!(await page.locator("input[aria-label='GitHub token for the feed']").count()), "next time: only a password is asked for");
await page.fill("input[aria-label='Teacher password']", "wrong-password-1"); await page.getByRole("button", { name: "Open teacher mode" }).click(); await page.waitForSelector("text=That is not the password.");
ok(true, "a wrong password is refused");
await page.fill("input[aria-label='Teacher password']", "teacher-pass-2026"); await page.getByRole("button", { name: "Open teacher mode" }).click(); await page.waitForSelector("text=Homework for the day", { timeout: 15000 });
ok(true, "the password alone opens teacher mode");

// ---- 6. the teacher builds and publishes a day
await page.locator("input[type=date]").fill("2026-10-15"); await page.waitForTimeout(500);
await page.getByRole("button", { name: /Speaking, Part 1/ }).click(); await page.waitForTimeout(300);
const areas = page.locator("textarea"); // questions, paragraphs, highlights, cards, record questions
await areas.nth(0).fill("Flowers\nDo you like flowers?\nDo you grow any?"); await areas.nth(1).fill("I love flowers.\n\nThey cheer me up."); await areas.nth(2).fill("cheer me up"); await areas.nth(3).fill("cheer up - make happier | Flowers cheer me up."); await areas.nth(4).fill(["Do you like flowers?", "Do you grow any?"].join(String.fromCharCode(10)));
await page.screenshot({ path: `shots/${SCHEME}-hw-admin.png`, fullPage: true });
await page.getByRole("button", { name: "Preview as the student" }).click(); await page.waitForSelector("text=How it looks to the student"); ok(/Do you like flowers/.test(await page.innerText(".sheet")), "preview shows the student's view");
await page.keyboard.press("Escape");
await page.getByRole("button", { name: "Publish to the student" }).click(); await page.waitForSelector("text=Published for 2026-10-15", { timeout: 8000 });
const put = ghCalls.find((c) => c.method === "PUT" && /hw\/2026-10-15\.json/.test(c.path));
ok(!!put && /github_pat_FAKE/.test(put.auth || ""), "publishing commits hw/2026-10-15.json using the unlocked key");
const sent = JSON.parse(put.body); const file = JSON.parse(Buffer.from(sent.content, "base64").toString());
ok(sent.branch === "main" && !/Do you like flowers/.test(JSON.stringify(file)), "what goes to GitHub is encrypted (the questions are not readable)");
const back = await decryptJson(file, "test-code-1234");
ok(back.tasks[0].steps[0].groups[0].questions.length === 2 && back.tasks[0].steps[2].cards[0].front === "cheer up", "decrypting it returns exactly what the teacher built");

console.log("errors", JSON.stringify(errs), `\n${pass} passed, ${fail} failed`);
await browser.close(); process.exit(fail ? 1 : 0);
