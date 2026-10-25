// The homework watcher, on the teacher's PC. Task Scheduler starts it at logon and checks every five minutes that it still runs
// (install-watcher.cmd). It is what makes "Send to Claude" in Teacher mode work with nothing else to press:
//   1. every 15 seconds it looks in the feed for requests/<id>/request.json (Teacher mode writes it through the relay)
//   2. it gathers the note, the attached files and some context into work/requests/<id>/
//   3. it runs Claude Code headless, following .claude/skills/publish-homework/SKILL.md, which writes homework.json there
//   4. it checks the file, publishes it, reports in requests/<id>/status.json (Teacher mode shows it live)
//      and tells the teacher on Telegram through the relay
//   node tools/teacher/watch.mjs           run (only one copy runs; a second one exits at once)
//   node tools/teacher/watch.mjs --once    handle what is waiting, then stop
// Log: tools/teacher/watch.log. While it runs, http://127.0.0.1:47185 says what it is doing.
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync, statSync, renameSync, rmSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { encryptJson, decryptJson } from "../../app/js/crypto.js";
import { OWNER, REPO, BRANCH, RAW, RELAY, FEED_KEY } from "../../app/js/feedkey.js";

const here = dirname(fileURLToPath(import.meta.url)), ROOT = join(here, "..", "..");
const WORK = join(ROOT, "work", "requests"), LOG = join(here, "watch.log"), PUBLISH = join(here, "publish.mjs");
const PORT = 47185, POLL = 15000, CLAUDE_TIMEOUT = 30 * 60000, MAX_TRIES = 3;
const once = process.argv.includes("--once");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const state = { started: new Date().toISOString(), lastPoll: null, working: null, lastResult: null };

function log(...a) {
  const line = `${new Date().toISOString()} ${a.join(" ")}\n`;
  try { if (existsSync(LOG) && statSync(LOG).size > 1e6) renameSync(LOG, LOG + ".old"); appendFileSync(LOG, line); } catch {}
  process.stdout.write(line);
}
class Final extends Error {}     // not worth trying again: tell the teacher

// ---- the programs it runs (full paths: Task Scheduler does not always have the same PATH as a terminal)
function find(name, known) {
  for (const f of known) if (existsSync(f)) return f;
  const r = spawnSync("where", [name], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.split(/\r?\n/)[0].trim() : name;
}
const CLAUDE = find("claude", [join(homedir(), ".local", "bin", "claude.exe")]);
const GH = find("gh", ["C:\\Program Files\\GitHub CLI\\gh.exe"]);

// ---- GitHub (the feed repo), with the token of the logged-in `gh`
let token = "";
function ghToken() {
  const r = spawnSync(GH, ["auth", "token"], { encoding: "utf8", windowsHide: true });
  if (r.status !== 0 || !r.stdout.trim()) throw new Error("gh is not logged in on this PC. Run: gh auth login");
  return r.stdout.trim();
}
async function api(path, { method = "GET", body, raw = false, etag } = {}) {
  token ||= ghToken();
  const r = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/${path}`, {
    method, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(60000),
    headers: { Authorization: `Bearer ${token}`, Accept: raw ? "application/vnd.github.raw+json" : "application/vnd.github+json", "User-Agent": "eight-watch", ...(etag ? { "If-None-Match": etag } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
  });
  if (r.status === 401) token = "";
  return r;
}
async function readEnc(path) {
  const r = await api(`contents/${path}?ref=${BRANCH}`, { raw: true });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GitHub ${r.status} reading ${path}`);
  return decryptJson(await r.json(), FEED_KEY);
}
async function shaOf(path) {
  const r = await api(`contents/${path}?ref=${BRANCH}`);
  if (r.status === 404) return undefined;
  if (!r.ok) throw new Error(`GitHub ${r.status} reading ${path}`);
  return (await r.json()).sha;
}
async function putBytes(path, data, message) {
  for (let i = 0; i < 4; i++) {
    const sha = await shaOf(path);
    const r = await api(`contents/${path}`, { method: "PUT", body: { message, content: Buffer.from(data).toString("base64"), branch: BRANCH, ...(sha ? { sha } : {}) } });
    if (r.ok) return;
    if (r.status !== 409 && r.status !== 422) throw new Error(`GitHub ${r.status} writing ${path}`);
    await sleep(1500 * (i + 1));     // someone else committed at the same moment: read the sha again
  }
  throw new Error(`GitHub kept refusing to write ${path}`);
}
const putEnc = async (path, obj, message) => putBytes(path, JSON.stringify(await encryptJson(obj, FEED_KEY)), message);
async function del(path, message) {
  const sha = await shaOf(path); if (!sha) return;
  const r = await api(`contents/${path}`, { method: "DELETE", body: { message, sha, branch: BRANCH } });
  if (!r.ok && r.status !== 404) throw new Error(`GitHub ${r.status} deleting ${path}`);
}
let etag = "", tree = [];
async function listTree() {
  const r = await api(`git/trees/${BRANCH}?recursive=1`, { etag });
  if (r.status === 304) return;
  if (!r.ok) throw new Error(`GitHub ${r.status} listing the feed`);
  etag = r.headers.get("etag") || ""; tree = (await r.json()).tree.map((f) => f.path);
}

// ---- Telegram, through the relay (it holds the bot token)
async function notify(text) {
  try {
    const r = await fetch(RELAY, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "notify", text }), signal: AbortSignal.timeout(30000) });
    const j = await r.json().catch(() => ({})); if (!j.ok) log("telegram:", j.error || r.status);
  } catch (e) { log("telegram:", e.message); }
}

const day = (d) => new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const safeName = (name, i) => (String(name || "").normalize("NFKD").replace(/[^\w.-]+/g, "_").replace(/^[._]+/, "").slice(-80) || `file-${i + 1}`);
const kb = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");

// ---- 2. everything Claude needs, in one folder
async function gather(id, req, dir) {
  rmSync(dir, { recursive: true, force: true }); mkdirSync(join(dir, "files"), { recursive: true });
  const chunks = new Map();
  for (const p of tree.filter((p) => p.startsWith(`requests/${id}/part-`))) {
    const v = await readEnc(p); if (!v) continue;
    if (!chunks.has(v.file)) chunks.set(v.file, []);
    chunks.get(v.file)[v.part] = Buffer.from(v.data, "base64");
  }
  const used = new Set();
  const files = (req.files || []).map((f, i) => {
    let name = safeName(f.name, i); while (used.has(name)) name = `${i + 1}-${name}`; used.add(name);
    const bufs = chunks.get(i) || [];
    if (bufs.filter(Boolean).length < f.parts) throw new Final(`The attachment "${f.name}" did not arrive complete. Attach it again and press Send.`);
    const data = Buffer.concat(bufs); writeFileSync(join(dir, "files", name), data);
    return { ...f, name, data, path: `files/${name}`, url: `${RAW}/files/${req.date}/${name}` };
  });
  const kind = req.kind || "homework";
  const mocksDone = tree.map((p) => p.match(/^mocks\/([^/]+)\/mock\.json$/)?.[1]).filter(Boolean).sort();
  const decksDone = tree.map((p) => p.match(/^decks\/(?!index)([^/]+)\.json$/)?.[1]).filter(Boolean).sort();
  const days = tree.map((p) => p.match(/^hw\/(\d{4}-\d{2}-\d{2})\.json$/)?.[1]).filter(Boolean).sort();
  const prevDay = days.filter((d) => d < req.date).pop() || days.filter((d) => d !== req.date).pop();
  const [published, previous, cfg] = await Promise.all([days.includes(req.date) ? readEnc(`hw/${req.date}.json`) : null, prevDay ? readEnc(`hw/${prevDay}.json`) : null, readEnc("config.json").catch(() => null)]);
  if (published) writeFileSync(join(dir, "published.json"), JSON.stringify(published, null, 2));
  if (previous) writeFileSync(join(dir, "previous.json"), JSON.stringify(previous, null, 2));
  const cls = cfg ? { student: cfg.student, lessonTime: cfg.lessonTime, lessonLink: cfg.lessonLink } : {};
  writeFileSync(join(dir, "class.json"), JSON.stringify(cls, null, 2));
  const sent = req.sentAt ? new Date(req.sentAt).toLocaleString("en-GB", { timeZone: "Asia/Tashkent", dateStyle: "medium", timeStyle: "short" }) : "?";
  writeFileSync(join(dir, "request.md"), [
    `# ${kind === "mock" ? "Mock" : kind === "deck" ? "Anki deck" : "Homework"} request`, "",
    kind === "mock" ? `- Mocks already published: ${mocksDone.join(", ") || "none"}. The next id is mock-${String(mocksDone.length + 1).padStart(2, "0")} unless the teacher names a number.` : "",
    kind === "deck" ? `- Decks already published: ${decksDone.join(", ") || "none"}.` : "",
    `- For: ${day(req.date)} ${req.date.slice(0, 4)} (${req.date}). Use this date unless the teacher's words clearly name another day.`,
    `- Sent: ${sent}, Tashkent time`, `- Request: ${id}`, "",
    "## The teacher's words", "", req.text || "(empty)", "",
    "## Attached files", "",
    ...(files.length ? files.map((f) => `- ${f.path} (${f.type}, ${kb(f.size)}). If she should open the file itself, link it with this URL (it is published only if you use it): ${f.url}`) : ["(none)"]), "",
    "## Context in this folder", "",
    published ? `- published.json: what is published for ${req.date} right now. The teacher may be asking for changes to it: keep everything he did not ask to change.` : `- Nothing is published for ${req.date} yet.`,
    previous ? `- previous.json: the published homework for ${prevDay}. Use it for the style and to continue the lesson numbering.` : "- No other day is published yet.",
    "- class.json: class settings (her name, the lesson time and link).", "",
  ].join("\n"));
  return files;
}

// ---- 3. Claude Code, headless, allowed only to read, write the file and run the check
function claude(prompt, dir) {
  return new Promise((resolve, reject) => {
    // high effort: careful enough for a day of homework, and minutes faster than the xhigh this PC uses for chat
    const args = ["-p", "--output-format", "json", "--effort", "high", "--permission-mode", "dontAsk",
      "--allowedTools", "Read,Write,Edit,Glob,Grep,Bash(node tools/teacher/publish.mjs check:*),Bash(node tools/teacher/publish.mjs checkmock:*),Bash(copy:*),Bash(cp:*),Bash(mkdir:*)",
      "--strict-mcp-config", "--settings", JSON.stringify({ enabledPlugins: { "telegram@claude-plugins-official": false } })];
    const env = { ...process.env }; for (const k of ["CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT", "CLAUDE_CODE_SSE_PORT"]) delete env[k];
    const child = spawn(CLAUDE, args, { cwd: ROOT, env, windowsHide: true });
    let out = "", err = "";
    child.stdout.on("data", (d) => (out += d)); child.stderr.on("data", (d) => (err += d));
    const timer = setTimeout(() => { log("Claude took too long; stopping it"); spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { windowsHide: true }); }, CLAUDE_TIMEOUT);
    child.on("error", (e) => { clearTimeout(timer); reject(new Error(`Claude Code did not start (${CLAUDE}): ${e.message}`)); });
    child.on("close", (code) => {
      clearTimeout(timer);
      try { writeFileSync(join(dir, `claude-${Date.now()}.json`), out || err); } catch {}
      let j = null; try { j = JSON.parse(out); } catch {}
      if (!j) return reject(new Error(`Claude Code stopped (${code}): ${(err || out).trim().slice(-400) || "no output"}`));
      log(`claude: ${j.num_turns ?? "?"} turns, ${Math.round((j.duration_ms || 0) / 1000)} s${j.total_cost_usd ? `, $${j.total_cost_usd.toFixed(2)} of usage` : ""}`);
      if (j.is_error) return reject(new Error("Claude Code: " + String(j.result || j.subtype || "error").slice(0, 400)));
      resolve(j);
    });
    child.stdin.end(prompt);
  });
}
const intro = `You are running unattended on the teacher's PC: the 8.5 homework watcher started you because Dexter pressed "Send to Claude" in Teacher mode. Nobody can answer questions, so make sensible choices and mention them at the end.`;
const finalRules = `Your final message goes to Dexter on Telegram exactly as you write it: plain text, 2 to 6 short lines, no headings, no bold, no Markdown. Say what she will do in each task, and anything you assumed, wrote yourself, left out, or need him to send (for example a missing video link). Do not mention the check, the files, or publishing: when he reads it, the day is already live.`;
const SKILL = { homework: "publish-homework", mock: "publish-mock", deck: "publish-deck" };
const OUT = { homework: (id) => `work/requests/${id}/homework.json`, mock: (id) => `work/requests/${id}/mock/mock.json (and the audio file(s) copied next to it)`, deck: (id) => `work/requests/${id}/deck.json` };
const CHECK = { homework: (id) => `node tools/teacher/publish.mjs check work/requests/${id}/homework.json`, mock: (id) => `node tools/teacher/publish.mjs checkmock work/requests/${id}/mock`, deck: (id) => `(there is no check command for a deck; follow the format in the skill exactly)` };
const firstPrompt = (id, kind = "homework") => `${intro}

1. Read .claude/skills/${SKILL[kind]}/SKILL.md and follow it.
2. The request is in work/requests/${id}/. Start with request.md, then read every attached file and the context files it lists.
3. Write the finished ${kind} to ${OUT[kind](id)}
4. Run: ${CHECK[kind](id)}
   and fix the file until it prints OK.
5. Do not publish. The watcher publishes it when you finish.

${finalRules}`;
const fixPrompt = (id, problems, kind = "homework") => `${intro}

You already wrote ${OUT[kind](id)} from work/requests/${id}/request.md, following .claude/skills/${SKILL[kind]}/SKILL.md, but it does not pass the check:
${problems}

Fix the file (read the request and the skill again if you need to), run ${CHECK[kind](id)} until it prints OK, and do not publish.

${finalRules}`;

// ---- 4. check and publish with the teacher's own command-line tool
function check(dir, kind = "homework") {
  if (kind === "deck") {
    const f = join(dir, "deck.json"); if (!existsSync(f)) return "Claude did not write deck.json.";
    try { const d = JSON.parse(readFileSync(f, "utf8")); if (!d.id || !d.name || !(d.cards || []).length) return "deck.json needs id, name and cards."; return null; } catch (e) { return "deck.json is not valid JSON: " + e.message; }
  }
  if (kind === "mock") {
    if (!existsSync(join(dir, "mock", "mock.json"))) return "Claude did not write mock/mock.json.";
    const r = spawnSync(process.execPath, [PUBLISH, "checkmock", join(dir, "mock")], { encoding: "utf8", windowsHide: true });
    return r.status === 0 ? null : (r.stderr || r.stdout).trim();
  }
  const f = join(dir, "homework.json");
  if (!existsSync(f)) return "Claude did not write homework.json.";
  const r = spawnSync(process.execPath, [PUBLISH, "check", f], { encoding: "utf8", windowsHide: true });
  return r.status === 0 ? null : (r.stderr || r.stdout).trim();
}
function publish(dir, kind = "homework") {
  const args = kind === "mock" ? ["mock", join(dir, "mock")] : kind === "deck" ? ["deck", join(dir, "deck.json")] : ["homework", join(dir, "homework.json")];
  const r = spawnSync(process.execPath, [PUBLISH, ...args], { cwd: ROOT, encoding: "utf8", windowsHide: true, maxBuffer: 20 * 1024 * 1024 });
  if (r.status !== 0) throw new Error("Publishing failed: " + (r.stderr || r.stdout).trim().slice(-400));
  return r.stdout.trim();
}
const plain = (t) => String(t || "").replace(/^#+\s*/gm, "").replace(/\*\*|__|`/g, "").trim().slice(0, 1200);

// ---- one request, from start to finish
const tries = new Map(), notBefore = new Map();
async function handle(id) {
  const n = (tries.get(id) || 0) + 1; tries.set(id, n);
  const dir = join(WORK, id); let req = null;
  const status = (s) => putEnc(`requests/${id}/status.json`, { ...s, id, at: new Date().toISOString() }, `Claude: ${s.state}${s.step ? ", " + s.step : ""}`).catch((e) => log("status:", e.message));
  state.working = id; log(`request ${id}: start (try ${n})`);
  try {
    await status({ state: "working", step: "picked" });
    req = await readEnc(`requests/${id}/request.json`); if (!req) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(req.date || "")) throw new Final("The request has no day.");
    const files = await gather(id, req, dir);
    const kind = ["homework", "mock", "deck"].includes(req.kind) ? req.kind : "homework";
    await status({ state: "working", step: "building" });
    let run = await claude(firstPrompt(id, kind), dir), problems = check(dir, kind);
    if (problems) { log(`request ${id}: check failed, asking Claude to fix it: ${problems}`); await status({ state: "working", step: "fixing" }); run = await claude(fixPrompt(id, problems, kind), dir); problems = check(dir, kind); }
    if (problems) throw new Final(`The ${kind} Claude wrote did not pass the check:\n` + problems);
    await status({ state: "working", step: "publishing" });
    const outFile = kind === "mock" ? join(dir, "mock", "mock.json") : kind === "deck" ? join(dir, "deck.json") : join(dir, "homework.json");
    const text = readFileSync(outFile, "utf8"), made = JSON.parse(text);
    for (const f of files) if (text.includes(f.url)) { await putBytes(`files/${req.date}/${f.name}`, f.data, `File for ${req.date}: ${f.name}`); log(`request ${id}: published file ${f.name}`); }
    log(`request ${id}: ${publish(dir, kind)}`);
    let summary = plain(run.result) || (kind === "homework" ? `${made.tasks.length} tasks are ready.` : kind === "mock" ? `${made.title || made.id} is ready.` : `${made.name}: ${made.cards.length} cards.`);
    if (kind === "homework" && made.date !== req.date) summary += `\nNote: published for ${day(made.date)}, not ${day(req.date)}, because your note named that day.`;
    await status({ state: "published", date: made.date || req.date, summary });
    await notify(`8.5: ${kind === "homework" ? `the homework for ${day(made.date)}` : kind === "mock" ? `${made.title || made.id}` : `the deck ${made.name}`} is live.\n\n${summary}`);
    state.lastResult = { id, ok: true, date: hw.date, at: new Date().toISOString() };
    await cleanup(id);
  } catch (e) {
    const final = e instanceof Final || n >= MAX_TRIES;
    log(`request ${id}: ${final ? "failed" : "will try again"}: ${e.message}`);
    if (final) {
      await status({ state: "failed", error: e.message.slice(0, 700) });
      await notify(`8.5: your ${req?.kind || "homework"} request${req?.date ? ` for ${day(req.date)}` : ""} was NOT published.\n\n${e.message.slice(0, 700)}\n\nOpen Teacher mode, Send to Claude, and press Send again.`);
      state.lastResult = { id, ok: false, error: e.message, at: new Date().toISOString() };
      await cleanup(id).catch((x) => log("cleanup:", x.message));
    } else { notBefore.set(id, Date.now() + n * 2 * 60000); await status({ state: "working", step: "picked", retry: n }); }
  } finally { state.working = null; }
}
// the request and its pieces go; status.json stays so Teacher mode can still show the result
async function cleanup(id) {
  await del(`requests/${id}/request.json`, `Done: ${id}`);
  for (const p of tree.filter((p) => p.startsWith(`requests/${id}/part-`))) await del(p, `Done: ${id}`);
  etag = "";
}

// old answers (and pieces of a Send that never finished) are tidied once an hour
const firstSeen = new Map(); let lastSweep = 0;
async function sweep() {
  if (Date.now() - lastSweep < 3600000) return; lastSweep = Date.now();
  const ids = new Set(tree.map((p) => p.match(/^requests\/([^/]+)\//)?.[1]).filter(Boolean));
  for (const id of ids) {
    const has = (f) => tree.includes(`requests/${id}/${f}`);
    if (has("request.json")) continue;
    if (has("status.json")) {
      const s = await readEnc(`requests/${id}/status.json`).catch(() => null);
      if (s?.at && Date.now() - Date.parse(s.at) > 3 * 86400000) { await del(`requests/${id}/status.json`, `Tidy ${id}`); log(`tidied ${id}`); }
    } else if (Date.now() - (firstSeen.get(id) ?? firstSeen.set(id, Date.now()).get(id)) > 2 * 3600000) {
      for (const p of tree.filter((p) => p.startsWith(`requests/${id}/`))) await del(p, `Tidy ${id}`);
      log(`tidied unfinished upload ${id}`);
    }
  }
  etag = "";
}

async function poll() {
  await listTree(); state.lastPoll = new Date().toISOString();
  const waiting = tree.map((p) => p.match(/^requests\/([a-z0-9-]+)\/request\.json$/)?.[1]).filter(Boolean);
  for (const id of waiting) {
    if ((tries.get(id) || 0) >= MAX_TRIES || Date.now() < (notBefore.get(id) || 0)) continue;
    await handle(id); await listTree();
  }
  await sweep();
}

// ---- only one watcher: the local port is the lock (Windows frees it when the process ends, even after a crash)
const server = createServer((q, s) => { s.setHeader("Content-Type", "application/json"); s.end(JSON.stringify({ ...state, claude: CLAUDE }, null, 2)); });
server.on("error", (e) => { if (e.code === "EADDRINUSE") { console.log("The watcher is already running. It will handle the requests."); process.exit(0); } throw e; });
server.listen(PORT, "127.0.0.1", async () => {
  log(`watcher started (pid ${process.pid}${once ? ", once" : ""}); claude: ${CLAUDE}`);
  for (;;) {
    try { await poll(); } catch (e) { log("poll:", e.message); }
    if (once) { server.close(); break; }
    await sleep(POLL);
  }
});
