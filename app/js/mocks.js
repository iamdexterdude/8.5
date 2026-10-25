// Mock exams: the test comes from the feed (mocks/<id>/mock.json, audio in scrambled pieces), her answers stay on the device,
// Listening and Reading are marked here, Writing and Speaking go to the teacher.
import * as db from "./db.js";
import * as store from "./store.js";
import * as hw from "./homework.js";
import { decryptJson } from "./crypto.js";
import { RAW, FEED_KEY } from "./feedkey.js";
import { rawToBand } from "./bands.js";

export const SECTIONS = ["listening", "reading", "writing", "speaking"];
export const LABEL = { listening: "Listening", reading: "Reading", writing: "Writing", speaking: "Speaking" };
const cache = new Map();

export async function load(id) {
  if (cache.has(id)) return cache.get(id);
  let local = null; try { local = JSON.parse(localStorage.getItem("eight-mock-" + id) || "null"); } catch {}   // a test mock placed on this device
  const m = local || await hw.fetchDec(`mocks/${id}/mock.json`, { timeout: 20000 });
  if (!m) throw new Error("This mock is not in the feed yet.");
  cache.set(id, m); return m;
}

// ---------- audio: pieces of base64 ciphertext, decrypted and kept on the device ----------
const te = new TextEncoder();
async function keyFor(salt) {
  const base = await crypto.subtle.importKey("raw", te.encode(FEED_KEY), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 150000, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
}
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export async function audioBlob(id, file, onProgress = () => {}) {
  const key = `${id}:${file.name}`;
  const have = await db.get("media", key);
  if (have?.blob) return have.blob;
  const parts = [];
  for (let k = 0; k < file.chunks; k++) {
    onProgress(k, file.chunks);
    const r = await fetch(`${RAW}/mocks/${id}/${file.name}.${k}.json?t=${Math.floor(Date.now() / 3600000)}`, { cache: "force-cache" });
    if (!r.ok) throw new Error(`Audio piece ${k + 1} of ${file.chunks} is missing (${r.status}).`);
    const j = await r.json();
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(j.iv) }, await keyFor(fromB64(j.salt)), fromB64(j.ct));
    parts.push(pt);
  }
  const blob = new Blob(parts, { type: file.type || "audio/mpeg" });
  try { await db.put("media", { key, blob, at: new Date().toISOString() }); } catch {}
  return blob;
}

// ---------- questions: every numbered answer in a section, in order ----------
export function questionNumbers(section) {
  const out = [];
  const walk = (groups) => { for (const g of groups || []) {
    if (g.type === "gap" || g.type === "table") for (const l of g.lines || []) for (const m of String(l).matchAll(/\[\[(\d+)\]\]/g)) out.push(Number(m[1]));
    else if (g.type === "multi") out.push(...(g.n || []));
    else for (const it of g.items || []) out.push(Number(it.n));
  } };
  for (const p of section.parts || section.passages || []) walk(p.groups);
  return [...new Set(out)].sort((a, b) => a - b);
}

// ---------- marking ----------
export function norm(s) {
  let t = String(s ?? "").toLowerCase().trim().replace(/\s+/g, " ").replace(/[.,;!?]+$/g, "").replace(/^['"]|['"]$/g, "").trim();
  if (/^[\d.,:\s$£€%-]+$/.test(t)) t = t.replace(/[,:\s]/g, "").replace(/\.$/, "");
  return t;
}
function accepted(key) {
  const list = Array.isArray(key) ? key : [key];
  const out = new Set();
  for (const k of list) {
    const s = String(k);
    out.add(norm(s));
    // "(the) library" and "colour/color"
    const m = s.match(/^\((\w+)\)\s*(.+)$/); if (m) { out.add(norm(m[2])); out.add(norm(m[1] + " " + m[2])); }
    if (s.includes("/")) for (const v of s.split("/")) out.add(norm(v));
  }
  out.delete(""); return out;
}
export function mark(section, answers, responses) {
  const nums = questionNumbers(section), detail = [];
  const multis = []; for (const p of section.parts || section.passages || []) for (const g of p.groups || []) if (g.type === "multi") multis.push(g);
  let raw = 0;
  for (const n of nums) {
    const mg = multis.find((g) => (g.n || []).includes(n));
    let ok;
    if (mg) {
      const correct = new Set(mg.n.flatMap((k) => [...accepted(answers[String(k)] || [])]));
      const chosen = mg.n.map((k) => norm(responses[String(k)] || "")).filter(Boolean);
      const mine = norm(responses[String(n)] || "");
      ok = !!mine && correct.has(mine) && chosen.indexOf(mine) === chosen.lastIndexOf(mine);
    } else ok = accepted(answers[String(n)] || []).has(norm(responses[String(n)] || ""));
    if (ok) raw++;
    detail.push({ n, mine: responses[String(n)] || "", key: (Array.isArray(answers[String(n)]) ? answers[String(n)] : [answers[String(n)]]).filter(Boolean).join(" / "), ok });
  }
  return { raw, total: nums.length, detail };
}
export function bandFor(kind, raw, total = 40) {
  const table = store.S.config.rawToBand[kind === "listening" ? "listening" : "reading"];
  if (total === 40) return rawToBand(table, raw);
  return rawToBand(table, Math.round((raw / total) * 40));   // a shorter test: scaled to 40
}
export const roundHalf = (x) => Math.round(x * 2) / 2;

// ---------- her attempts ----------
export const rowId = (mock, section) => `${mock}:${section}`;
export function attempt(mock, section) { return store.mockRow(rowId(mock, section)); }
export async function startAttempt(mock, section, minutes) {
  const now = new Date();
  const row = { id: rowId(mock, section), mock, section, status: "in-progress", startedAt: now.toISOString(), deadline: new Date(now.getTime() + minutes * 60000).toISOString(), responses: {}, flags: {}, texts: {}, recordings: [], leaves: 0, events: [] };
  return store.saveMock(row);
}
export async function saveAttempt(row) { return store.saveMock(row); }
export function countWords(t) { return (String(t || "").trim().match(/\S+/g) || []).length; }

// the teacher's estimate for a mock, if he has published one
export const estimate = (mock) => hw.F.results?.[mock] || null;

// a summary of a mock across its sections, for Progress
export function summary(mockId) {
  const rows = SECTIONS.map((s) => attempt(mockId, s)).filter((r) => r?.status === "done");
  const est = estimate(mockId) || {};
  const bands = {};
  for (const r of rows) if (r.band != null) bands[r.section] = r.band;
  if (est.writing?.band != null) bands.writing = est.writing.band;
  if (est.speaking?.band != null) bands.speaking = est.speaking.band;
  const have = SECTIONS.filter((s) => bands[s] != null);
  const overall = have.length === 4 ? roundHalf((bands.listening + bands.reading + bands.writing + bands.speaking) / 4) : null;
  return { rows, bands, overall, est, last: rows.map((r) => r.finishedAt).sort().pop() || null };
}
