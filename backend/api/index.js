// The 8.5 relay. POST JSON { op, ... }.
//   teacher (password checked against teacher.json in the feed repo): login, publish, remove, password, list, read
//   student (no password):                                             upload (a file to the teacher's Telegram), notify (a line of text)
import { pbkdf2Sync, timingSafeEqual, randomBytes } from "node:crypto";

const REPO = process.env.FEED_REPO || "iamdexterdude/8.5-feed", BRANCH = process.env.FEED_BRANCH || "main";
const GH = process.env.GITHUB_TOKEN || "", TG = process.env.TG_BOT_TOKEN || "", CHAT = process.env.TG_CHAT_ID || "";
// a secret mixed into the password hash, so the public teacher.json cannot be attacked offline; set once in the Vercel env
const PEPPER = process.env.TEACHER_PEPPER || "";
const MIN_PW = 4;
const ORIGINS = [/^https:\/\/iamdexterdude\.github\.io$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];
const PATH_OK = /^(hw\/\d{4}-\d{2}-\d{2}\.json|config\.json|requests\/[a-z0-9-]{1,40}\/(request|part-\d{1,3})\.json)$/;
// "Send to Claude": the request and its attachments go to requests/<id>/; the watcher on the teacher's PC answers in status.json
const READ_OK = /^requests\/[a-z0-9-]{1,40}\/status\.json$/;
const MAX_FILE = 3.5 * 1024 * 1024;

// ---- password: salted PBKDF2 with a server-side pepper. The hash file is public (feed repo); without the pepper it is useless.
let teacherCache = { at: 0, v: undefined };
async function teacherRecord() {
  if (Date.now() - teacherCache.at < 30000 && teacherCache.v !== undefined) return teacherCache.v;
  const r = await gh(`contents/teacher.json?ref=${BRANCH}`);
  const v = r.status === 404 ? null : JSON.parse(Buffer.from((await r.json()).content, "base64").toString("utf8"));
  teacherCache = { at: Date.now(), v }; return v;
}
export function hashPassword(password, salt = randomBytes(16).toString("base64"), iter = 600000) {
  return { alg: "pbkdf2-sha256", iter, salt, hash: pbkdf2Sync(PEPPER + ":" + password, Buffer.from(salt, "base64"), iter, 32, "sha256").toString("base64") };
}
function checkPassword(password, rec) {
  if (!rec || typeof password !== "string" || !password) return false;
  const a = Buffer.from(hashPassword(password, rec.salt, rec.iter).hash, "base64"), b = Buffer.from(rec.hash, "base64");
  return a.length === b.length && timingSafeEqual(a, b);
}
// a few wrong tries, then a pause (per address, per function instance: best effort)
const tries = new Map();
const blocked = (ip) => { const t = tries.get(ip); return !!t && t.n >= 8 && Date.now() < t.until; };
const failed = (ip) => { const t = tries.get(ip) || { n: 0, until: 0 }; t.n++; t.until = Date.now() + 15 * 60000; tries.set(ip, t); };

// ---- GitHub
async function gh(path, init = {}) {
  if (!GH) throw new Error("The relay has no GitHub token.");
  return fetch(`https://api.github.com/repos/${REPO}/${path}`, { ...init, headers: { Authorization: `Bearer ${GH}`, Accept: "application/vnd.github+json", "User-Agent": "eight-publish", ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.headers || {}) } });
}
async function putFile(path, text, message) {
  let sha; const cur = await gh(`contents/${path}?ref=${BRANCH}`);
  if (cur.ok) sha = (await cur.json()).sha; else if (cur.status !== 404) throw new Error("GitHub " + cur.status);
  const r = await gh(`contents/${path}`, { method: "PUT", body: JSON.stringify({ message, content: Buffer.from(text, "utf8").toString("base64"), branch: BRANCH, ...(sha ? { sha } : {}) }) });
  if (!r.ok) throw new Error("GitHub " + r.status + ": " + ((await r.json().catch(() => ({}))).message || ""));
  return (await r.json()).commit?.sha || "";
}
async function removeFile(path, message) {
  const cur = await gh(`contents/${path}?ref=${BRANCH}`);
  if (cur.status === 404) return false; if (!cur.ok) throw new Error("GitHub " + cur.status);
  const r = await gh(`contents/${path}`, { method: "DELETE", body: JSON.stringify({ message, sha: (await cur.json()).sha, branch: BRANCH }) });
  if (!r.ok) throw new Error("GitHub " + r.status); return true;
}

// ---- Telegram
async function tg(method, form) {
  if (!TG || !CHAT) throw new Error("The relay has no Telegram bot.");
  const r = await fetch(`https://api.telegram.org/bot${TG}/${method}`, { method: "POST", body: form });
  const j = await r.json().catch(() => ({})); if (!j.ok) throw new Error(j.description || "Telegram " + r.status); return j.result;
}

const send = (res, status, body) => { res.statusCode = status; res.setHeader("Content-Type", "application/json; charset=utf-8"); res.end(JSON.stringify(body)); };

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  const allowed = !origin || ORIGINS.some((rx) => rx.test(origin));
  if (origin && allowed) { res.setHeader("Access-Control-Allow-Origin", origin); res.setHeader("Vary", "Origin"); }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS"); res.setHeader("Access-Control-Allow-Headers", "Content-Type"); res.setHeader("Access-Control-Max-Age", "86400");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
  if (req.method === "GET") return send(res, 200, { ok: true, relay: "8.5", github: !!GH, telegram: !!(TG && CHAT), pepper: !!PEPPER, password: !!(await teacherRecord().catch(() => null)) });
  if (req.method !== "POST") return send(res, 405, { ok: false, error: "POST only" });
  if (!allowed) return send(res, 403, { ok: false, error: "origin" });
  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").split(",")[0].trim();
  let b = req.body; if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = null; } }
  if (!b || typeof b !== "object") return send(res, 400, { ok: false, error: "Send JSON." });
  try {
    const op = String(b.op || "");
    // ---------- student
    if (op === "upload") {
      const { name, type, caption, data } = b;
      if (typeof data !== "string" || !data) return send(res, 400, { ok: false, error: "No file." });
      const bytes = Buffer.from(data, "base64"); if (bytes.length > MAX_FILE) return send(res, 413, { ok: false, error: "File too large." });
      const fd = new FormData(); fd.append("chat_id", CHAT); fd.append("caption", String(caption || "").slice(0, 1000));
      fd.append("document", new Blob([bytes], { type: String(type || "application/octet-stream") }), String(name || "file").replace(/[^\w.-]+/g, "_").slice(0, 80));
      await tg("sendDocument", fd); return send(res, 200, { ok: true });
    }
    if (op === "notify") {
      const fd = new FormData(); fd.append("chat_id", CHAT); fd.append("text", String(b.text || "").slice(0, 3000)); await tg("sendMessage", fd); return send(res, 200, { ok: true });
    }
    // ---------- teacher
    if (!["login", "publish", "remove", "password", "list", "read"].includes(op)) return send(res, 400, { ok: false, error: "Unknown op." });
    if (blocked(ip)) return send(res, 429, { ok: false, error: "Too many wrong passwords. Wait fifteen minutes." });
    const rec = await teacherRecord();
    if (!rec) return send(res, 409, { ok: false, error: "No teacher password is set yet. Run: node tools/teacher/publish.mjs password" });
    if (!checkPassword(b.password, rec)) { failed(ip); return send(res, 401, { ok: false, error: "That is not the password." }); }
    tries.delete(ip);
    if (op === "login") return send(res, 200, { ok: true });
    if (op === "password") {
      if (typeof b.newPassword !== "string" || b.newPassword.length < MIN_PW) return send(res, 400, { ok: false, error: `Use at least ${MIN_PW} characters.` });
      await putFile("teacher.json", JSON.stringify(hashPassword(b.newPassword)), "Teacher password"); teacherCache = { at: 0, v: undefined }; return send(res, 200, { ok: true });
    }
    if (op === "publish") {
      if (!PATH_OK.test(String(b.path || ""))) return send(res, 400, { ok: false, error: "Bad path." });
      if (typeof b.content !== "string" || b.content.length > (b.path.startsWith("requests/") ? 3200000 : 2000000)) return send(res, 400, { ok: false, error: "Bad content." });
      const sha = await putFile(b.path, b.content, String(b.message || "Publish " + b.path).slice(0, 200)); return send(res, 200, { ok: true, sha });
    }
    if (op === "remove") {
      if (!PATH_OK.test(String(b.path || ""))) return send(res, 400, { ok: false, error: "Bad path." });
      return send(res, 200, { ok: true, removed: await removeFile(b.path, "Remove " + b.path) });
    }
    if (op === "read") {
      if (!READ_OK.test(String(b.path || ""))) return send(res, 400, { ok: false, error: "Bad path." });
      const r = await gh(`contents/${b.path}?ref=${BRANCH}`, { headers: { Accept: "application/vnd.github.raw+json" } });
      if (r.status === 404) return send(res, 200, { ok: true, content: null });
      if (!r.ok) throw new Error("GitHub " + r.status);
      return send(res, 200, { ok: true, content: await r.text() });
    }
    if (op === "list") {
      const r = await gh(`contents/${encodeURIComponent(String(b.dir || "hw"))}?ref=${BRANCH}`);
      return send(res, 200, { ok: true, files: r.ok ? (await r.json()).map((f) => f.name) : [] });
    }
  } catch (e) { return send(res, 500, { ok: false, error: e.message || String(e) }); }
}
