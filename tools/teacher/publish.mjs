// The teacher's command-line tool (used by Claude when Dexter sends work in chat, or by hand). Needs a logged-in `gh`.
//   node tools/teacher/publish.mjs homework file.json     validate, scramble and publish one day's homework
//   node tools/teacher/publish.mjs check file.json        validate a homework file only
//   node tools/teacher/publish.mjs mock folder/           publish a mock: folder holds mock.json and the audio file(s) it names
//   node tools/teacher/publish.mjs checkmock folder/      validate a mock folder only
//   node tools/teacher/publish.mjs deck file.json         publish an Anki deck { id, name, note, cards: [{front, back, example}] }
//   node tools/teacher/publish.mjs estimate mock-01 file.json   the teacher's bands for a mock { writing: {band, note}, speaking: {band, note}, note }
//   node tools/teacher/publish.mjs config file.json       class settings { student, teacher, lessonTime, lessonDays, lessonLink, music, todayNote, ankiNote }
//   node tools/teacher/publish.mjs note anki|today "text" a short note to her (shows once on Anki or Today)
//   node tools/teacher/publish.mjs student                print her latest report (Anki, mocks, homework, check-ins)
//   node tools/teacher/publish.mjs password [new]         set or change the teacher password
//   node tools/teacher/publish.mjs show 2026-10-15        print what is published for a day
//   node tools/teacher/publish.mjs requests               list the "Send to Claude" requests waiting in the feed
//   node tools/teacher/publish.mjs remove 2026-10-15      unpublish a day
//   node tools/teacher/publish.mjs list                   list the published days, mocks and decks
// Everything published is scrambled with the app's feed key (app/js/feedkey.js). The feed lives in iamdexterdude/8.5-feed.
import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { pbkdf2Sync, randomBytes, webcrypto } from "node:crypto";
import { encryptJson, decryptJson } from "../../app/js/crypto.js";
import { validateHomework, validateMock, validateDeck } from "../../app/js/validate.js";
import { OWNER, REPO, BRANCH, RAW, FEED_KEY } from "../../app/js/feedkey.js";

const here = dirname(fileURLToPath(import.meta.url));

function gh(args, input) {
  const r = spawnSync("gh", ["api", ...args], { input, encoding: "utf8", maxBuffer: 80 * 1024 * 1024 });
  if (r.status !== 0) { const e = new Error((r.stdout + r.stderr).trim()); e.stderr = r.stderr; throw e; }
  return r.stdout ? JSON.parse(r.stdout) : {};
}
function shaOf(path) { try { return gh([`repos/${OWNER}/${REPO}/contents/${path}?ref=${BRANCH}`]).sha; } catch (e) { if (!/404|Not Found/.test(e.message)) throw e; return undefined; } }
function putRaw(path, text, message) {
  const sha = shaOf(path);
  gh([`repos/${OWNER}/${REPO}/contents/${path}`, "-X", "PUT", "--input", "-"], JSON.stringify({ message, content: Buffer.from(text, "utf8").toString("base64"), branch: BRANCH, ...(sha ? { sha } : {}) }));
}
async function put(path, obj, message) { putRaw(path, JSON.stringify(await encryptJson(obj, FEED_KEY)), message); }
async function fetchDec(path) {
  const r = await fetch(`${RAW}/${path}?t=${Date.now()}`); if (!r.ok) return null;
  return decryptJson(await r.json(), FEED_KEY);
}
async function fetchPlain(path) { const r = await fetch(`${RAW}/${path}?t=${Date.now()}`); return r.ok ? r.json() : null; }
const readJson = (f) => { try { return JSON.parse(readFileSync(f, "utf8")); } catch (e) { console.error(`Cannot read ${f}: ${e.message}`); process.exit(1); } };
function pepper() {
  if (process.env.TEACHER_PEPPER) return process.env.TEACHER_PEPPER;
  const f = join(here, "..", "..", "backend", ".env.local");
  if (existsSync(f)) { for (const line of readFileSync(f, "utf8").split(/[\r\n]+/)) { const m = line.match(/^TEACHER_PEPPER=(.*)$/); if (m) return m[1].trim().replace(/^"|"$/g, ""); } }
  throw new Error("No TEACHER_PEPPER: run  cd backend && vercel env pull .env.local");
}
const hashPassword = (password) => { const salt = randomBytes(16).toString("base64"), iter = 600000; return { alg: "pbkdf2-sha256", iter, salt, hash: pbkdf2Sync(pepper() + ":" + password, Buffer.from(salt, "base64"), iter, 32, "sha256").toString("base64") }; };

// ---- scrambled audio: AES-GCM pieces the app decrypts with the feed key
const CHUNK = 4 * 1024 * 1024;
async function encryptBytes(bytes) {
  const te = new TextEncoder(), salt = webcrypto.getRandomValues(new Uint8Array(16)), iv = webcrypto.getRandomValues(new Uint8Array(12));
  const base = await webcrypto.subtle.importKey("raw", te.encode(FEED_KEY), "PBKDF2", false, ["deriveKey"]);
  const key = await webcrypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 150000, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
  const ct = await webcrypto.subtle.encrypt({ name: "AES-GCM", iv }, key, bytes);
  return { v: 1, salt: Buffer.from(salt).toString("base64"), iv: Buffer.from(iv).toString("base64"), ct: Buffer.from(ct).toString("base64") };
}
const mimeOf = (f) => (/\.mp3$/i.test(f) ? "audio/mpeg" : /\.m4a$|\.mp4$/i.test(f) ? "audio/mp4" : /\.ogg$|\.oga$/i.test(f) ? "audio/ogg" : /\.wav$/i.test(f) ? "audio/wav" : "audio/mpeg");

function prepareHomework(hw) {
  hw.v ||= 1;
  for (const t of hw.tasks || []) { t.id ||= "t" + Math.random().toString(36).slice(2, 8); for (const s of t.steps || []) { s.id ||= "s" + Math.random().toString(36).slice(2, 8); if ((s.type === "photos" || s.type === "record") && !s.label) s.label = s.title; if (s.type === "words" && !s.deck) s.deck = s.title; } }
  return hw;
}
// a mock folder: mock.json plus the audio files named in listening.audio[].file (or listening.audioFile for one file)
function loadMock(folder) {
  const f = join(folder, "mock.json"); if (!existsSync(f)) { console.error("No mock.json in " + folder); process.exit(1); }
  const m = readJson(f);
  if (m.listening) {
    const names = m.listening.audio ? m.listening.audio.map((a) => (typeof a === "string" ? a : a.file)) : m.listening.audioFile ? [m.listening.audioFile] : [];
    m.listening.audio = names.map((name, i) => ({ name: `audio-${i + 1}`, file: name, type: mimeOf(name), chunks: Math.max(1, Math.ceil(statSync(join(folder, name)).size / CHUNK)) }));
    delete m.listening.audioFile;
    for (const a of m.listening.audio) if (!existsSync(join(folder, a.file))) { console.error(`Audio file missing: ${a.file}`); process.exit(1); }
  }
  return m;
}
async function updateIndex(path, entry) {
  const list = (await fetchDec(path)) || [];
  const i = list.findIndex((x) => x.id === entry.id); if (i >= 0) list[i] = entry; else list.push(entry);
  await put(path, list, `Index: ${entry.id}`);
}

const [cmd, arg, arg2] = process.argv.slice(2);
if (cmd === "check") {
  const errs = validateHomework(prepareHomework(readJson(arg)));
  if (errs.length) { console.error("Problems:\n - " + errs.join("\n - ")); process.exit(1); }
  console.log("OK");
} else if (cmd === "homework") {
  const hw = prepareHomework(readJson(arg)); hw.publishedAt = new Date().toISOString();
  const errs = validateHomework(hw); if (errs.length) { console.error("Not published:\n - " + errs.join("\n - ")); process.exit(1); }
  await put(`hw/${hw.date}.json`, hw, `Homework for ${hw.date}`);
  console.log(`published homework for ${hw.date}: ${hw.tasks.length} tasks, ${hw.tasks.reduce((a, t) => a + t.steps.length, 0)} steps`);
} else if (cmd === "checkmock") {
  const errs = validateMock(loadMock(arg)); if (errs.length) { console.error("Problems:\n - " + errs.join("\n - ")); process.exit(1); } console.log("OK");
} else if (cmd === "mock") {
  const m = loadMock(arg); const errs = validateMock(m); if (errs.length) { console.error("Not published:\n - " + errs.join("\n - ")); process.exit(1); }
  m.publishedAt = new Date().toISOString();
  for (const a of m.listening?.audio || []) {
    const bytes = readFileSync(join(arg, a.file));
    for (let k = 0; k < a.chunks; k++) {
      const piece = await encryptBytes(bytes.subarray(k * CHUNK, (k + 1) * CHUNK));
      putRaw(`mocks/${m.id}/${a.name}.${k}.json`, JSON.stringify(piece), `Audio ${m.id} ${a.name} ${k + 1}/${a.chunks}`);
      console.log(`  audio ${a.file}: piece ${k + 1} of ${a.chunks}`);
    }
    delete a.file;
  }
  await put(`mocks/${m.id}/mock.json`, m, `Mock ${m.id}`);
  await updateIndex("mocks/index.json", { id: m.id, title: m.title, date: m.date || new Date().toISOString().slice(0, 10), sections: ["listening", "reading", "writing", "speaking"].filter((s) => m[s]) });
  console.log(`published ${m.id} (${m.title}): ${["listening", "reading", "writing", "speaking"].filter((s) => m[s]).join(", ")}`);
} else if (cmd === "deck") {
  const d = readJson(arg); const errs = validateDeck(d); if (errs.length) { console.error("Not published:\n - " + errs.join("\n - ")); process.exit(1); }
  d.cards = d.cards.map((c, i) => ({ id: c.id || String(i + 1), front: c.front, back: c.back, example: c.example || "" }));
  await put(`decks/${d.id}.json`, { ...d, publishedAt: new Date().toISOString() }, `Deck ${d.id}`);
  await updateIndex("decks/index.json", { id: d.id, name: d.name, date: new Date().toISOString().slice(0, 10), cards: d.cards.length });
  console.log(`published deck ${d.id}: ${d.cards.length} cards`);
} else if (cmd === "estimate") {
  const est = readJson(arg2); await put(`results/${arg}.json`, { ...est, at: new Date().toISOString() }, `Estimate ${arg}`); console.log("published estimate for", arg);
} else if (cmd === "config") {
  const cfg = readJson(arg); writeFileSync(join(here, "config.json"), JSON.stringify(cfg, null, 2));
  await put("config.json", { ...cfg, updatedAt: new Date().toISOString() }, "Class settings"); console.log("published class settings");
} else if (cmd === "note") {
  const cfg = (await fetchDec("config.json")) || {};
  cfg[arg === "anki" ? "ankiNote" : "todayNote"] = { text: arg2, at: new Date().toISOString() };
  await put("config.json", { ...cfg, updatedAt: new Date().toISOString() }, "Note"); console.log("published the note");
} else if (cmd === "student") {
  let files = []; try { files = gh([`repos/${OWNER}/${REPO}/contents/students?ref=${BRANCH}`]).map((f) => f.name); } catch {}
  for (const f of files) console.log(JSON.stringify(await fetchPlain(`students/${f}`), null, 2));
  if (!files.length) console.log("no report yet");
} else if (cmd === "password") {
  const pw = arg || process.env.TEACHER_PASSWORD; if (!pw || pw.length < 4) { console.error("Give a password of at least 4 characters."); process.exit(1); }
  putRaw("teacher.json", JSON.stringify(hashPassword(pw)), "Teacher password"); console.log("teacher password set");
} else if (cmd === "show") {
  const v = await fetchDec(`hw/${arg}.json`); console.log(v ? JSON.stringify(v, null, 2) : "nothing published for " + arg);
} else if (cmd === "list") {
  const tree = gh([`repos/${OWNER}/${REPO}/git/trees/${BRANCH}?recursive=1`]).tree.map((f) => f.path);
  console.log("homework:", tree.filter((p) => /^hw\//.test(p)).map((p) => p.slice(3, 13)).sort().join(", ") || "none");
  console.log("mocks:", tree.filter((p) => /^mocks\/[^/]+\/mock\.json$/.test(p)).map((p) => p.split("/")[1]).join(", ") || "none");
  console.log("decks:", tree.filter((p) => /^decks\/(?!index)/.test(p)).map((p) => basename(p, ".json")).join(", ") || "none");
} else if (cmd === "requests") {
  let files = []; try { files = gh([`repos/${OWNER}/${REPO}/git/trees/${BRANCH}?recursive=1`]).tree.map((f) => f.path).filter((p) => /^requests\/[^/]+\/request\.json$/.test(p)); } catch {}
  if (!files.length) console.log("no requests waiting");
  for (const f of files) { const v = await fetchDec(f); console.log(`\n=== ${f} (${v?.kind || "homework"}, sent ${v?.sentAt || "?"}) for ${v?.date || "?"}, ${v?.files?.length || 0} files ===\n${v?.text || ""}`); }
} else if (cmd === "remove") {
  const f = gh([`repos/${OWNER}/${REPO}/contents/hw/${arg}.json?ref=${BRANCH}`]);
  gh([`repos/${OWNER}/${REPO}/contents/hw/${arg}.json`, "-X", "DELETE", "--input", "-"], JSON.stringify({ message: "Remove " + arg, sha: f.sha, branch: BRANCH })); console.log("removed", arg);
} else console.log("usage: homework <file> | check <file> | mock <folder> | checkmock <folder> | deck <file> | estimate <id> <file> | config <file> | note anki|today <text> | student | password [new] | show <date> | list | requests | remove <date>");
