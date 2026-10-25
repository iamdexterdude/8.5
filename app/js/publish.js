// Teacher side: the password opens teacher mode; the relay checks it and does the publishing.
// Nothing but the password is ever typed, and it is kept only for this tab (sessionStorage) until Lock.
import { encryptJson, decryptJson } from "./crypto.js";
import { RAW, RELAY, FEED_KEY } from "./feedkey.js";

const SESSION = "eight-teacher";
const LOCAL = "eight-admin";

// ---- local, non-secret things (drafts, what the form last showed)
export function adminLoad() { try { return JSON.parse(localStorage.getItem(LOCAL) || "{}"); } catch { return {}; } }
export function adminSave(patch) { const v = { ...adminLoad(), ...patch }; try { localStorage.setItem(LOCAL, JSON.stringify(v)); } catch {} return v; }

// ---- the unlocked session (this tab only)
export function session() { try { return sessionStorage.getItem(SESSION) || null; } catch { return null; } }
export function lock() { try { sessionStorage.removeItem(SESSION); } catch {} }

export async function relay(op, body = {}, { timeout = 30000 } = {}) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(RELAY, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op, ...body }), signal: ctl.signal });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) { const e = new Error(j.error || "The relay answered " + r.status + "."); e.status = r.status; throw e; }
    return j;
  } catch (e) { if (e.name === "AbortError") throw new Error("The relay did not answer. Check the connection."); throw e; }
  finally { clearTimeout(t); }
}
const withPassword = (body = {}) => { const p = session(); if (!p) throw new Error("Teacher mode is locked."); return { password: p, ...body }; };

export async function unlock(password) {
  try { await relay("login", { password }); try { sessionStorage.setItem(SESSION, password); } catch {} return { status: "ok" }; }
  catch (e) { return { status: e.status === 401 ? "wrong" : e.status === 409 ? "none" : e.status === 429 ? "wait" : "error", message: e.message }; }
}
export async function changePassword(newPassword) { await relay("password", withPassword({ newPassword })); try { sessionStorage.setItem(SESSION, newPassword); } catch {} }

// ---- publishing: scrambled with the feed key, committed by the relay
export async function putEncrypted(path, obj, message) {
  const enc = await encryptJson(obj, FEED_KEY);
  await relay("publish", withPassword({ path, content: JSON.stringify(enc), message }));
  return enc;
}
export async function removePublished(path) { return (await relay("remove", withPassword({ path }))).removed; }
export async function listPublished(dir = "hw") { return (await relay("list", withPassword({ dir }))).files || []; }
export async function sendTeacherNote(text) { return relay("notify", { text }); }
export async function fetchPublished(path) {
  const r = await fetch(`${RAW}/${path}?t=${Date.now()}`, { cache: "no-store" });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error("The feed answered " + r.status + ".");
  return decryptJson(await r.json(), FEED_KEY);
}
export async function encryptOnly(obj) { return encryptJson(obj, FEED_KEY); }

// ---- "Send to Claude": the request (and any attached files, in pieces small enough for the relay) goes to requests/<id>/ in the feed.
// The watcher on the teacher's PC picks it up, has Claude Code build and publish the day, and answers in requests/<id>/status.json.
const PART = 1200 * 1024;
const MAX_PARTS = 60;
function bytesToB64(buf) {
  const b = new Uint8Array(buf); let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(s);
}
export async function sendToClaude({ date, kind = "homework", text, files = [] }, progress = () => {}) {
  const id = `${date}-${Math.random().toString(36).slice(2, 8)}`, meta = [];
  let n = 0;
  for (const [i, f] of files.entries()) {
    const buf = await f.arrayBuffer(), parts = Math.max(1, Math.ceil(buf.byteLength / PART));
    if (parts > MAX_PARTS) throw new Error(`${f.name} is too large to send from here (${(buf.byteLength / 1048576).toFixed(0)} MB).`);
    for (let k = 0; k < parts; k++) {
      progress(`Uploading ${f.name}${parts > 1 ? ` (${k + 1} of ${parts})` : ""}…`);
      await putEncrypted(`requests/${id}/part-${n}.json`, { file: i, part: k, data: bytesToB64(buf.slice(k * PART, (k + 1) * PART)) }, "Attachment for Claude");
      n++;
    }
    meta.push({ name: f.name, type: f.type || "application/octet-stream", size: buf.byteLength, parts });
  }
  progress("Sending…");
  // the request goes last: the watcher only starts once it exists, so every piece is already there
  await putEncrypted(`requests/${id}/request.json`, { id, date, kind, text, files: meta, sentAt: new Date().toISOString() }, `${kind} for ${date}, for Claude`);
  return id;
}
export async function readPublished(path) { const r = await relay("read", withPassword({ path })); return r.content ?? null; }
export async function claudeStatus(id) {
  const r = await relay("read", withPassword({ path: `requests/${id}/status.json` }));
  return r.content ? decryptJson(JSON.parse(r.content), FEED_KEY) : null;
}

export { validateHomework } from "./validate.js";
