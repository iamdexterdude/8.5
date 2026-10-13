// The teacher's command-line tool (used by Claude when Dexter sends homework in chat, or by hand). Needs a logged-in `gh`.
//   node tools/teacher/publish.mjs homework file.json     validate, scramble and publish one day's homework
//   node tools/teacher/publish.mjs config file.json       publish class settings: { student, teacher, lessonTime, lessonLink, music: [{title, artist, url, note}] }
//   node tools/teacher/publish.mjs password [new]         set or change the teacher password (prints it)
//   node tools/teacher/publish.mjs show 2026-10-15        print what is published for a day
//   node tools/teacher/publish.mjs requests               print the notes the teacher saved in "Tell Claude", then clear them
//   node tools/teacher/publish.mjs remove 2026-10-15      unpublish a day
//   node tools/teacher/publish.mjs list                   list the published days
// Everything published is scrambled with the app's feed key (app/js/feedkey.js). The feed lives in iamdexterdude/8.5-feed.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { encryptJson, decryptJson } from "../../app/js/crypto.js";
import { validateHomework } from "../../app/js/validate.js";
import { OWNER, REPO, BRANCH, RAW, FEED_KEY } from "../../app/js/feedkey.js";

const here = dirname(fileURLToPath(import.meta.url));

function gh(args, input) {
  const r = spawnSync("gh", ["api", ...args], { input, encoding: "utf8", maxBuffer: 50 * 1024 * 1024 });
  if (r.status !== 0) { const e = new Error((r.stdout + r.stderr).trim()); e.stderr = r.stderr; throw e; }
  return r.stdout ? JSON.parse(r.stdout) : {};
}
function putRaw(path, text, message) {
  let sha; try { sha = gh([`repos/${OWNER}/${REPO}/contents/${path}?ref=${BRANCH}`]).sha; } catch (e) { if (!/404|Not Found/.test(e.message)) throw e; }
  gh([`repos/${OWNER}/${REPO}/contents/${path}`, "-X", "PUT", "--input", "-"], JSON.stringify({ message, content: Buffer.from(text, "utf8").toString("base64"), branch: BRANCH, ...(sha ? { sha } : {}) }));
}
async function put(path, obj, message) { putRaw(path, JSON.stringify(await encryptJson(obj, FEED_KEY)), message); }
async function fetchDec(path) {
  const r = await fetch(`${RAW}/${path}?t=${Date.now()}`); if (!r.ok) return null;
  return decryptJson(await r.json(), FEED_KEY);
}
const hashPassword = (password) => { const salt = randomBytes(16).toString("base64"), iter = 600000; return { alg: "pbkdf2-sha256", iter, salt, hash: pbkdf2Sync(password, Buffer.from(salt, "base64"), iter, 32, "sha256").toString("base64") }; };

const [cmd, arg] = process.argv.slice(2);
if (cmd === "homework") {
  const hw = JSON.parse(readFileSync(arg, "utf8")); hw.v ||= 1; hw.publishedAt = new Date().toISOString();
  for (const t of hw.tasks || []) { t.id ||= "t" + Math.random().toString(36).slice(2, 8); for (const s of t.steps || []) { s.id ||= "s" + Math.random().toString(36).slice(2, 8); if ((s.type === "photos" || s.type === "record") && !s.label) s.label = s.title; if (s.type === "words" && !s.deck) s.deck = s.title; } }
  const errs = validateHomework(hw); if (errs.length) { console.error("Not published:\n - " + errs.join("\n - ")); process.exit(1); }
  await put(`hw/${hw.date}.json`, hw, `Homework for ${hw.date}`);
  console.log(`published homework for ${hw.date}: ${hw.tasks.length} tasks, ${hw.tasks.reduce((a, t) => a + t.steps.length, 0)} steps`);
} else if (cmd === "config") {
  const cfg = JSON.parse(readFileSync(arg, "utf8")); writeFileSync(join(here, "config.json"), JSON.stringify(cfg, null, 2));
  await put("config.json", { ...cfg, updatedAt: new Date().toISOString() }, "Class settings"); console.log("published class settings (" + (cfg.music?.length || 0) + " tracks)");
} else if (cmd === "password") {
  const pw = arg || process.env.TEACHER_PASSWORD; if (!pw || pw.length < 10) { console.error("Give a password of at least 10 characters."); process.exit(1); }
  putRaw("teacher.json", JSON.stringify(hashPassword(pw)), "Teacher password"); console.log("teacher password set");
} else if (cmd === "show") {
  const v = await fetchDec(`hw/${arg}.json`); console.log(v ? JSON.stringify(v, null, 2) : "nothing published for " + arg);
} else if (cmd === "list") {
  let files = []; try { files = gh([`repos/${OWNER}/${REPO}/contents/hw?ref=${BRANCH}`]).map((f) => f.name.replace(/\.json$/, "")); } catch {}
  console.log(files.length ? files.sort().join("\n") : "nothing published yet");
} else if (cmd === "requests") {
  let files = []; try { files = gh([`repos/${OWNER}/${REPO}/contents/requests?ref=${BRANCH}`]); } catch {}
  if (!files.length) console.log("no saved notes");
  for (const f of files) {
    const v = await fetchDec(`requests/${f.name}`); console.log(`\n=== ${f.name} (${v?.savedAt || ""}) for ${v?.date || "?"} ===\n${v?.text || ""}`);
    if (process.argv.includes("--keep")) continue;
    gh([`repos/${OWNER}/${REPO}/contents/requests/${f.name}`, "-X", "DELETE", "--input", "-"], JSON.stringify({ message: "Read " + f.name, sha: f.sha, branch: BRANCH }));
  }
} else if (cmd === "remove") {
  const f = gh([`repos/${OWNER}/${REPO}/contents/hw/${arg}.json?ref=${BRANCH}`]);
  gh([`repos/${OWNER}/${REPO}/contents/hw/${arg}.json`, "-X", "DELETE", "--input", "-"], JSON.stringify({ message: "Remove " + arg, sha: f.sha, branch: BRANCH })); console.log("removed", arg);
} else console.log("usage: homework <file> | config <file> | password [new] | show <date> | list | requests [--keep] | remove <date>");
