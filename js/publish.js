// Teacher side: encrypt the homework (or class settings) and commit it to the `data` branch of the GitHub repo.
// Needs a GitHub token with Contents: read and write on this repo. The token stays on the teacher's device.
import { encryptJson } from "./crypto.js";
import { OWNER, REPO, BRANCH } from "./homework.js";

const KEY = "eight-admin";
export function adminLoad() { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; } }
export function adminSave(patch) { const v = { ...adminLoad(), ...patch }; try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} return v; }

async function gh(path, { method = "GET", body } = {}) {
  const { token } = adminLoad(); if (!token) throw new Error("Add your GitHub token in Class settings first.");
  const r = await fetch("https://api.github.com" + path, { method, headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.message || "GitHub " + r.status); e.status = r.status; throw e; }
  return j;
}

// the data branch holds only encrypted files; it starts from nothing (no app code in it)
export async function ensureBranch() {
  try { await gh(`/repos/${OWNER}/${REPO}/branches/${BRANCH}`); return; } catch (e) { if (e.status !== 404) throw e; }
  const blob = await gh(`/repos/${OWNER}/${REPO}/git/blobs`, { method: "POST", body: { content: "Encrypted class feed for the 8.5 app. Nothing readable is stored here.\n", encoding: "utf-8" } });
  const tree = await gh(`/repos/${OWNER}/${REPO}/git/trees`, { method: "POST", body: { tree: [{ path: "README.txt", mode: "100644", type: "blob", sha: blob.sha }] } });
  const commit = await gh(`/repos/${OWNER}/${REPO}/git/commits`, { method: "POST", body: { message: "Start the class feed", tree: tree.sha, parents: [] } });
  await gh(`/repos/${OWNER}/${REPO}/git/refs`, { method: "POST", body: { ref: `refs/heads/${BRANCH}`, sha: commit.sha } });
}

export async function putEncrypted(path, obj, code, message) {
  const enc = await encryptJson(obj, code);
  await ensureBranch();
  let sha; try { sha = (await gh(`/repos/${OWNER}/${REPO}/contents/${path}?ref=${BRANCH}`)).sha; } catch (e) { if (e.status !== 404) throw e; }
  await gh(`/repos/${OWNER}/${REPO}/contents/${path}`, { method: "PUT", body: { message, content: btoa(JSON.stringify(enc)), branch: BRANCH, ...(sha ? { sha } : {}) } });
  return enc;
}
export async function encryptOnly(obj, code) { return encryptJson(obj, code); }

// Telegram helpers used by the admin screen
export async function botCall(token, method, params = {}) {
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(params) });
  const j = await r.json(); if (!j.ok) throw new Error(j.description || "Telegram error"); return j.result;
}

export { validateHomework } from "./validate.js";
