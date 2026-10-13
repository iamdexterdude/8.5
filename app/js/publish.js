// Teacher side: unlock with a password, then encrypt homework and class settings and commit them to the feed repository.
//
// The write key (a GitHub token limited to the feed repository only) is kept in a "vault": a file in the feed repo that is
// encrypted with the teacher's password. The teacher pastes the token ONCE, when setting up. After that, on any device,
// the password alone unlocks it. The token cannot touch the app itself, only the feed files.
import { encryptJson, decryptJson, newClassCode } from "./crypto.js";
import { OWNER, REPO, BRANCH, RAW } from "./homework.js";

const VAULT_ITER = 600000;          // slow on purpose: makes guessing the password expensive
const SESSION = "eight-admin-session";
const LOCAL = "eight-admin";

// ---- local, non-secret things (the draft of the day, what the form last showed)
export function adminLoad() { try { return JSON.parse(localStorage.getItem(LOCAL) || "{}"); } catch { return {}; } }
export function adminSave(patch) { const v = { ...adminLoad(), ...patch }; try { localStorage.setItem(LOCAL, JSON.stringify(v)); } catch {} return v; }

// ---- the unlocked session (cleared when the tab closes)
export function session() { try { return JSON.parse(sessionStorage.getItem(SESSION) || "null"); } catch { return null; } }
const setSession = (v) => { try { sessionStorage.setItem(SESSION, JSON.stringify(v)); } catch {} return v; };
export function lock() { try { sessionStorage.removeItem(SESSION); } catch {} }

async function gh(path, { method = "GET", body, token } = {}) {
  token ||= session()?.token; if (!token) throw new Error("Teacher mode is locked.");
  const r = await fetch("https://api.github.com" + path, { method, headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.message || "GitHub " + r.status); e.status = r.status; throw e; }
  return j;
}

async function putRaw(path, text, message, token) {
  let sha; try { sha = (await gh(`/repos/${OWNER}/${REPO}/contents/${path}?ref=${BRANCH}`, { token })).sha; } catch (e) { if (e.status !== 404) throw e; }
  await gh(`/repos/${OWNER}/${REPO}/contents/${path}`, { method: "PUT", token, body: { message, content: btoa(text), branch: BRANCH, ...(sha ? { sha } : {}) } });
}

// ---- the vault
async function fetchVault() {
  const r = await fetch(`${RAW}/vault.json?t=${Date.now()}`, { cache: "no-store" });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error("Could not reach the homework feed.");
  return r.json();
}
export async function vaultExists() { return !!(await fetchVault()); }

// first time only: check the token reaches the feed repo, lock it away with the password, publish the vault
export async function createVault(password, token, classCode) {
  if (password.length < 10) throw new Error("Use a password of at least 10 characters. Anyone can download the vault, so a longer password is safer.");
  const repo = await gh(`/repos/${OWNER}/${REPO}`, { token }).catch((e) => { throw new Error(e.status === 404 || e.status === 401 || e.status === 403 ? "That token cannot reach the feed repository. It needs Contents: Read and write on " + REPO + "." : e.message); });
  if (repo.permissions && repo.permissions.push === false) throw new Error("That token can read the feed repository but not write to it. Give it Contents: Read and write.");
  const code = classCode || newClassCode();
  const vault = await encryptJson({ token, classCode: code, createdAt: new Date().toISOString() }, password, VAULT_ITER);
  await putRaw("vault.json", JSON.stringify(vault), "Teacher vault", token);
  return setSession({ token, classCode: code });
}

// every time: the password alone
export async function unlock(password) {
  const v = await fetchVault();
  if (!v) return { status: "none" };
  try { return { status: "ok", ...setSession(await decryptJson(v, password)) }; } catch { return { status: "wrong" }; }
}

// ---- publishing
export async function putEncrypted(path, obj, code, message) {
  const enc = await encryptJson(obj, code);
  await putRaw(path, JSON.stringify(enc), message);
  return enc;
}
export async function encryptOnly(obj, code) { return encryptJson(obj, code); }

// Telegram helper used by the admin screen
export async function botCall(token, method, params = {}) {
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(params) });
  const j = await r.json(); if (!j.ok) throw new Error(j.description || "Telegram error"); return j.result;
}

export { validateHomework } from "./validate.js";
