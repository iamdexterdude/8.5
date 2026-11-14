// The 8.5 relay. POST JSON { op, ... }.
//   teacher (password checked against teacher.json in the feed repo): login, publish, remove, password, list, read
//   student (no password):                                             upload (a file to the teacher's Telegram), notify (a line of text)
//   nudges (no password):  push-sub, push-off, nudges (the phone's own plan of short notes);  tick (secret): send what is due
import { pbkdf2Sync, timingSafeEqual, randomBytes } from "node:crypto";
import webpush from "web-push";

const REPO = process.env.FEED_REPO || "iamdexterdude/8.5-feed", BRANCH = process.env.FEED_BRANCH || "main";
const GH = process.env.GITHUB_TOKEN || "", TG = process.env.TG_BOT_TOKEN || "", CHAT = process.env.TG_CHAT_ID || "";
// a secret mixed into the password hash, so the public teacher.json cannot be attacked offline; set once in the Vercel env
const PEPPER = process.env.TEACHER_PEPPER || "";
const MIN_PW = 4;
const ORIGINS = [/^https:\/\/iamdexterdude\.github\.io$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];
const PATH_OK = /^(hw\/\d{4}-\d{2}-\d{2}\.json|config\.json|requests\/[a-z0-9-]{1,40}\/(request|part-\d{1,3})\.json|mocks\/index\.json|mocks\/[a-z0-9-]{2,40}\/mock\.json|results\/[a-z0-9-]{2,40}\.json|decks\/index\.json|decks\/[a-z0-9-]{2,40}\.json)$/;
// "Send to Claude": the request and its attachments go to requests/<id>/; the watcher on the teacher's PC answers in status.json
const READ_OK = /^(requests\/[a-z0-9-]{1,40}\/status\.json|students\/[a-z0-9-]{1,40}\.json|config\.json)$/;
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

// ---- nudges. Each phone plans its own notes from what its owner does (the app's nudge.js) and hands the plan over;
// this side only keeps the plan and sends each note when its time comes. Redis (Upstash REST) holds:
//   n85:ids            the phones that turned notes on
//   n85:sub:<id>       the push subscription, and the phone's quiet hours (UTC minutes)
//   n85:q:<id>         the planned notes            n85:log:<id>   the last notes sent (tag, time)
//   n85:bc             notes for everyone (new homework), each sent to a phone outside its quiet hours, once
const KV = process.env.KV_REST_API_URL || "", KVT = process.env.KV_REST_API_TOKEN || "";
const VAPID_PUB = process.env.VAPID_PUBLIC || "", VAPID_KEY = process.env.VAPID_PRIVATE || "", NUDGE_SECRET = process.env.NUDGE_SECRET || "";
if (VAPID_PUB && VAPID_KEY) webpush.setVapidDetails("https://iamdexterdude.github.io/8.5/", VAPID_PUB, VAPID_KEY);
async function kv(...cmd) {
  if (!KV) throw new Error("The relay has no database.");
  const r = await fetch(KV, { method: "POST", headers: { Authorization: `Bearer ${KVT}` }, body: JSON.stringify(cmd) });
  const j = await r.json().catch(() => ({})); if (j.error) throw new Error("KV " + j.error); return j.result;
}
const kvJson = async (key) => { const v = await kv("GET", key); try { return v ? JSON.parse(v) : null; } catch { return null; } };
const devId = (s) => String(s || "").replace(/[^a-z0-9-]/gi, "").slice(0, 40);
const clip = (s, n) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const inQuiet = (q, now = new Date()) => { if (!q || q.from == null) return false; const m = now.getUTCHours() * 60 + now.getUTCMinutes(); return q.from <= q.to ? m >= q.from && m < q.to : m >= q.from || m < q.to; };
async function pushTo(id, sub, note) {
  try {
    await webpush.sendNotification(sub, JSON.stringify(note), { TTL: 3 * 3600, urgency: note.urgent ? "high" : "normal", topic: clip(note.tag, 32).replace(/[^\w-]/g, "") || undefined });
    await kv("LPUSH", `n85:log:${id}`, JSON.stringify({ tag: note.tag, at: Date.now() })); await kv("LTRIM", `n85:log:${id}`, 0, 39);
    return "sent";
  } catch (e) {
    if (e.statusCode === 404 || e.statusCode === 410) { await kv("DEL", `n85:sub:${id}`, `n85:q:${id}`); await kv("SREM", "n85:ids", id); return "gone"; }
    return "failed";
  }
}
async function tick() {
  const now = Date.now(), ids = (await kv("SMEMBERS", "n85:ids")) || [], bc = ((await kvJson("n85:bc")) || []).filter((b) => now - b.at < 20 * 3600000);
  const out = { phones: ids.length, sent: 0, dropped: 0 };
  for (const id of ids) {
    const rec = await kvJson(`n85:sub:${id}`); if (!rec?.sub) { await kv("SREM", "n85:ids", id); continue; }
    const q = (await kvJson(`n85:q:${id}`)) || [], keep = [];
    let n = 0;
    for (const it of q.sort((a, b) => a.at - b.at)) {
      if (it.at > now) { keep.push(it); continue; }
      if (now - it.at > 3 * 3600000) { out.dropped++; continue; }      // too late to mean anything now
      if (n >= 1) { keep.push(it); continue; }                          // one note per phone per tick, at most
      const r = await pushTo(id, rec.sub, it); if (r === "gone") break; if (r === "sent") { n++; out.sent++; }
    }
    await kv("SET", `n85:q:${id}`, JSON.stringify(keep), "EX", 8 * 86400);
    if (!n && !inQuiet(rec.quiet)) for (const b of bc) {
      if (await kv("SISMEMBER", `n85:seen:${id}`, b.tag)) continue;
      const r = await pushTo(id, rec.sub, b); await kv("SADD", `n85:seen:${id}`, b.tag); await kv("EXPIRE", `n85:seen:${id}`, 30 * 86400);
      if (r === "sent") { out.sent++; break; }
    }
  }
  return out;
}

const send = (res, status, body) => { res.statusCode = status; res.setHeader("Content-Type", "application/json; charset=utf-8"); res.end(JSON.stringify(body)); };

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  const allowed = !origin || ORIGINS.some((rx) => rx.test(origin));
  if (origin && allowed) { res.setHeader("Access-Control-Allow-Origin", origin); res.setHeader("Vary", "Origin"); }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS"); res.setHeader("Access-Control-Allow-Headers", "Content-Type"); res.setHeader("Access-Control-Max-Age", "86400");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
  if (req.method === "GET") return send(res, 200, { ok: true, relay: "8.5", github: !!GH, telegram: !!(TG && CHAT), pepper: !!PEPPER, password: !!(await teacherRecord().catch(() => null)), nudges: !!(KV && VAPID_PUB && VAPID_KEY && NUDGE_SECRET) });
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
    // a small picture of the student's work (Anki, mocks, homework) that Teacher mode reads back
    if (op === "report") {
      const id = String(b.id || "student").toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 40) || "student";
      const text = JSON.stringify(b.data || {}); if (text.length > 200000) return send(res, 413, { ok: false, error: "Report too large." });
      await putFile(`students/${id}.json`, text, `Report: ${id}`); return send(res, 200, { ok: true });
    }
    // ---------- nudges
    if (op === "push-sub") {
      const id = devId(b.id), sub = b.sub;
      if (!id || !sub || typeof sub.endpoint !== "string" || !/^https:\/\//.test(sub.endpoint) || !sub.keys?.p256dh || !sub.keys?.auth) return send(res, 400, { ok: false, error: "Bad subscription." });
      await kv("SET", `n85:sub:${id}`, JSON.stringify({ sub: { endpoint: sub.endpoint, keys: { p256dh: String(sub.keys.p256dh), auth: String(sub.keys.auth) } }, at: Date.now() }));
      await kv("SADD", "n85:ids", id); return send(res, 200, { ok: true, key: VAPID_PUB });
    }
    if (op === "push-off") { const id = devId(b.id); if (id) { await kv("DEL", `n85:sub:${id}`, `n85:q:${id}`); await kv("SREM", "n85:ids", id); } return send(res, 200, { ok: true }); }
    if (op === "nudges") {
      const id = devId(b.id); if (!id) return send(res, 400, { ok: false, error: "No id." });
      const rec = await kvJson(`n85:sub:${id}`); if (!rec) return send(res, 200, { ok: true, off: true });
      const now = Date.now();
      const items = (Array.isArray(b.items) ? b.items : []).slice(0, 12).map((it) => ({ at: Number(it.at), tag: clip(it.tag, 40), title: clip(it.title, 70), body: clip(it.body, 180), url: /^#\/[\w/?=&.-]*$/.test(String(it.url || "")) ? it.url : "#/today", urgent: !!it.urgent }))
        .filter((it) => it.title && it.at > now - 5 * 60000 && it.at < now + 8 * 86400000);
      const q = b.quiet && Number.isFinite(b.quiet.from) && Number.isFinite(b.quiet.to) ? { from: ((b.quiet.from % 1440) + 1440) % 1440, to: ((b.quiet.to % 1440) + 1440) % 1440 } : null;
      await kv("SET", `n85:q:${id}`, JSON.stringify(items), "EX", 8 * 86400);
      if (q) await kv("SET", `n85:sub:${id}`, JSON.stringify({ ...rec, quiet: q }));
      const log = ((await kv("LRANGE", `n85:log:${id}`, 0, 39)) || []).map((x) => { try { return JSON.parse(x); } catch { return null; } }).filter(Boolean);
      return send(res, 200, { ok: true, sent: log });
    }
    if (op === "tick") {
      if (!NUDGE_SECRET || b.secret !== NUDGE_SECRET) return send(res, 403, { ok: false, error: "secret" });
      return send(res, 200, { ok: true, ...(await tick()) });
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
      const sha = await putFile(b.path, b.content, String(b.message || "Publish " + b.path).slice(0, 200));
      const m = /^hw\/(\d{4}-\d{2}-\d{2})\.json$/.exec(b.path);
      if (m && KV && Date.parse(m[1]) > Date.now() - 2 * 86400000) {
        try {
          if (await kv("SET", `n85:hwnote:${m[1]}`, "1", "NX", "EX", 14 * 86400)) {
            const day = new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "Asia/Tashkent" }).format(new Date(m[1] + "T12:00:00Z"));
            const bc = ((await kvJson("n85:bc")) || []).filter((x) => Date.now() - x.at < 20 * 3600000);
            bc.push({ tag: `hw-${m[1]}`, title: "New homework", body: `From ${day}'s lesson.`, url: "#/homework", at: Date.now() });
            await kv("SET", "n85:bc", JSON.stringify(bc.slice(-5)));
          }
        } catch {}
      }
      return send(res, 200, { ok: true, sha });
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
