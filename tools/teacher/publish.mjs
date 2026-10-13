// The teacher's command-line tool (used by Claude when Dexter sends homework in chat, or by hand).
//   node tools/teacher/publish.mjs setup                  one time: class code, the `data` branch, empty class settings; prints the student link
//   node tools/teacher/publish.mjs homework file.json     validate, encrypt and publish one day's homework
//   node tools/teacher/publish.mjs config file.json       publish class settings: { teacher, bot: {token, chat}, music: [{title, artist, url, note}] }
//   node tools/teacher/publish.mjs link                   print the student's join link
//   node tools/teacher/publish.mjs show 2026-10-15        decrypt and print what is published for a day
// The feed lives in its own repository (iamdexterdude/8.5-feed). The class code is kept in tools/teacher/.classcode (never committed).
// Everything published is encrypted with it.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { encryptJson, decryptJson, newClassCode } from "../../app/js/crypto.js";
import { validateHomework } from "../../app/js/validate.js";

const here = dirname(fileURLToPath(import.meta.url)), OWNER = "iamdexterdude", REPO = "8.5-feed", BRANCH = "main";
const CODE_FILE = join(here, ".classcode"), SITE = `https://${OWNER}.github.io/8.5/`;

function gh(args, input) {
  const r = spawnSync("gh", ["api", ...args], { input, encoding: "utf8", maxBuffer: 50 * 1024 * 1024 });
  if (r.status !== 0) { const e = new Error((r.stdout + r.stderr).trim()); e.stderr = r.stderr; throw e; }
  return r.stdout ? JSON.parse(r.stdout) : {};
}
const code = () => { if (process.env.CLASS_CODE) return process.env.CLASS_CODE; if (!existsSync(CODE_FILE)) throw new Error("No class code yet. Run: node tools/teacher/publish.mjs setup"); return readFileSync(CODE_FILE, "utf8").trim(); };

async function put(path, obj, message) {
  const enc = await encryptJson(obj, code());
  let sha; try { sha = gh([`repos/${OWNER}/${REPO}/contents/${path}?ref=${BRANCH}`]).sha; } catch (e) { if (!/404|Not Found/.test(e.message)) throw e; }
  gh([`repos/${OWNER}/${REPO}/contents/${path}`, "-X", "PUT", "--input", "-"], JSON.stringify({ message, content: Buffer.from(JSON.stringify(enc)).toString("base64"), branch: BRANCH, ...(sha ? { sha } : {}) }));
}
const link = () => `${SITE}#/join/${code()}`;

const [cmd, arg] = process.argv.slice(2);
if (cmd === "setup") {
  if (!existsSync(CODE_FILE)) { writeFileSync(CODE_FILE, newClassCode()); console.log("made a new class code"); }
  const cfgPath = join(here, "config.json");
  const cfg = existsSync(cfgPath) ? JSON.parse(readFileSync(cfgPath, "utf8")) : { teacher: "", bot: null, music: [] };
  await put("config.json", { ...cfg, updatedAt: new Date().toISOString() }, "Class settings");
  console.log("student link:", link());
} else if (cmd === "homework") {
  const hw = JSON.parse(readFileSync(arg, "utf8")); hw.publishedAt = new Date().toISOString();
  const errs = validateHomework(hw); if (errs.length) { console.error("Not published:\n - " + errs.join("\n - ")); process.exit(1); }
  await put(`hw/${hw.date}.json`, hw, `Homework for ${hw.date}`);
  console.log(`published homework for ${hw.date}: ${hw.tasks.length} tasks, ${hw.tasks.reduce((a, t) => a + t.steps.length, 0)} steps`);
} else if (cmd === "config") {
  const cfg = JSON.parse(readFileSync(arg, "utf8")); writeFileSync(join(here, "config.json"), JSON.stringify(cfg, null, 2));
  await put("config.json", { ...cfg, updatedAt: new Date().toISOString() }, "Class settings"); console.log("published class settings (" + (cfg.music?.length || 0) + " tracks)");
} else if (cmd === "link") console.log(link());
else if (cmd === "show") {
  const r = await fetch(`https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/hw/${arg}.json?t=${Date.now()}`);
  if (!r.ok) { console.log("nothing published for", arg); process.exit(0); }
  console.log(JSON.stringify(await decryptJson(await r.json(), code()), null, 2));
} else console.log("usage: setup | homework <file> | config <file> | link | show <date>");
