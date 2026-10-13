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

export { validateHomework } from "./validate.js";
