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

// ---------- the teacher's full report: sent to his Telegram when she finishes a part, and once for the whole mock ----------
const TYPE = { gap: "Completion", table: "Table", mcq: "Multiple choice", multi: "Choose two", match: "Matching", headings: "Headings", tfng: "True/False/Not Given", ynng: "Yes/No/Not Given", short: "Short answer" };
const groupNums = (g) => g.type === "gap" || g.type === "table" ? [...(g.lines || []).join("\n").matchAll(/\[\[(\d+)\]\]/g)].map((m) => Number(m[1])) : g.type === "multi" ? (g.n || []).map(Number) : (g.items || []).map((it) => Number(it.n));
const mmOf = (ms) => { const m = Math.round(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}` : `${m} min`; };
const clip = (s, n = 38) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
function timeLine(row) {
  const used = Date.parse(row.finishedAt) - Date.parse(row.startedAt), allowed = Date.parse(row.deadline) - Date.parse(row.startedAt);
  const bits = [];
  if (used > 0) bits.push(`${mmOf(used)}${allowed > 0 ? ` of ${mmOf(allowed)}` : ""}${row.auto ? " (time ran out)" : ""}`);
  bits.push(row.leaves ? `left the screen ${row.leaves}×` : "stayed on the screen");
  const when = new Date(row.finishedAt); bits.push(`finished ${when.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} ${when.toTimeString().slice(0, 5)}`);
  return bits.join(" · ");
}
export function reportText(mock, section, row) {
  const who = hw.studentName() || "Student", title = mock.title || mock.id, sec = mock[section] || {}, L = [];
  L.push(`REPORT · ${who} · ${title} · ${LABEL[section]}`);
  if (section === "listening" || section === "reading") {
    const det = new Map((row.detail || []).map((d) => [d.n, d]));
    L.push(`Band ${row.band ?? "–"} · ${row.raw}/${row.total}`, timeLine(row), "");
    const units = sec.parts || sec.passages || [], types = {};
    for (const u of units) {
      const nums = (u.groups || []).flatMap(groupNums), ok = nums.filter((n) => det.get(n)?.ok).length;
      L.push(`${section === "reading" ? "Passage" : "Part"} ${u.no}${u.title ? ` "${clip(u.title, 40)}"` : ""}: ${ok}/${nums.length}`);
      for (const g of u.groups || []) { const t = TYPE[g.type] || g.type, ns = groupNums(g); types[t] ||= [0, 0]; types[t][0] += ns.filter((n) => det.get(n)?.ok).length; types[t][1] += ns.length; }
    }
    L.push("", "By question type:", ...Object.entries(types).map(([t, [a, b]]) => `  ${t}: ${a}/${b}`));
    const wrong = (row.detail || []).filter((d) => !d.ok), blank = wrong.filter((d) => !String(d.mine).trim());
    L.push("", wrong.length ? `Wrong ${wrong.length}${blank.length ? ` (${blank.length} left blank)` : ""}:` : "No mistakes.");
    for (const d of wrong) L.push(`  ${d.n}. her: ${d.mine ? clip(d.mine) : "—"} → key: ${clip(d.key, 44)}`);
    const flagged = Object.keys(row.flags || {}).filter((k) => row.flags[k]);
    if (flagged.length) L.push("", `Marked for review: ${flagged.join(", ")}`);
    L.push("", "All answers:");
    for (const u of units) {
      const nums = (u.groups || []).flatMap(groupNums);
      L.push(`${section === "reading" ? "P" : "Part "}${u.no}: ` + nums.map((n) => { const d = det.get(n); return `${n}${d?.ok ? "✓" : "✗"}${d?.mine ? clip(d.mine, 18) : "—"}`; }).join("  "));
    }
  } else if (section === "writing") {
    L.push(timeLine(row), "");
    for (const t of sec.tasks || []) {
      const text = String(row.texts?.[t.no] || ""), w = countWords(text);
      L.push(`Task ${t.no}: ${w} words${t.words && w < t.words ? ` (under ${t.words})` : ""}${text.trim() ? "" : " (nothing written)"}`);
    }
    L.push("", "The essays came as separate files.");
  } else if (section === "speaking") {
    const recs = row.recordings || [], byPart = {};
    for (const r of recs) byPart[r.part] = (byPart[r.part] || 0) + 1;
    L.push(timeLine(row), "", `${recs.length} recordings: ` + Object.entries(byPart).map(([p, n]) => `Part ${p} ×${n}`).join(", "), "The recordings came as separate files.");
  }
  // the whole mock, once every part in it is done
  const parts = SECTIONS.filter((s) => mock[s]), done = parts.filter((s) => s === section || attempt(mock.id, s)?.status === "done");
  if (parts.length > 1 && done.length === parts.length) {
    const sm = summary(mock.id);
    L.push("", `WHOLE MOCK DONE · ` + parts.map((s) => `${LABEL[s]} ${sm.bands[s] ?? (s === "writing" || s === "speaking" ? "(your estimate)" : "–")}`).join(" · "));
  } else if (parts.length > 1) L.push("", `Still to do: ${parts.filter((s) => !done.includes(s)).map((s) => LABEL[s]).join(", ")}`);
  return L.join("\n");
}
// split under the relay's 3000-character limit, at line breaks, and send in order
export async function sendReport(mock, section, row) {
  const text = reportText(mock, section, row), chunks = []; let cur = "";
  for (const line of text.split("\n")) { if ((cur + "\n" + line).length > 2800 && cur) { chunks.push(cur); cur = line; } else cur = cur ? cur + "\n" + line : line; }
  if (cur) chunks.push(cur);
  for (const c of chunks) if ((await hw.sendText(c)) !== "sent") return false;
  row.reported = new Date().toISOString(); await saveAttempt(row); return true;
}
// parts finished before reports existed (or while offline): sent once, the next time the app opens
export async function sendPendingReports() {
  if (hw.viewingAs() || !hw.studentName()) return;
  for (const row of [...store.S.mocks]) {
    if (row.status !== "done" || row.reported || !row.finishedAt || Date.now() - Date.parse(row.finishedAt) > 21 * 86400000) continue;
    const mock = await load(row.mock).catch(() => null); if (!mock?.[row.section]) continue;
    if (!(await sendReport(mock, row.section, row))) return;
  }
}

// ---------- for marking: each finished part goes to the feed in the open (submissions/<student>/<mock>/), recordings too.
// The watcher on the teacher's PC marks Writing and Speaking within minutes and publishes results/<mock>--<student>.json.
const b64Of = async (blob) => { const u8 = new Uint8Array(await blob.arrayBuffer()); let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const extFor = (t) => (/mp4/.test(t) ? "m4a" : /ogg/.test(t) ? "ogg" : "webm");
export async function submitPart(mock, section, row) {
  if (hw.viewingAs() || !hw.studentName() || row.submitted) return false;
  const id = hw.studentId(), base = { student: hw.studentName(), id, mock: mock.id, title: mock.title || mock.id, section, startedAt: row.startedAt, finishedAt: row.finishedAt, leaves: row.leaves || 0, events: row.events || [] };
  let data = base;
  if (section === "listening" || section === "reading") data = { ...base, raw: row.raw, total: row.total, band: row.band, responses: row.responses || {}, flags: row.flags || {}, detail: row.detail || [] };
  else if (section === "writing") data = { ...base, tasks: (mock.writing?.tasks || []).map((t) => ({ no: t.no, minWords: t.words, prompt: t.prompt, text: String(row.texts?.[t.no] || ""), words: countWords(row.texts?.[t.no]) })) };
  else if (section === "speaking") {
    const recs = [];
    for (const [k, r] of (row.recordings || []).entries()) {
      if (!(r.blob instanceof Blob)) continue;
      const name = `speaking-${k + 1}.${extFor(r.blob.type)}`;
      await hw.relay({ op: "submit", id, mock: mock.id, name, data: await b64Of(r.blob) }, { timeout: 90000 });
      recs.push({ file: name, part: r.part, question: r.label, seconds: r.seconds });
    }
    data = { ...base, recordings: recs };
  }
  await hw.relay({ op: "submit", id, mock: mock.id, name: `${section}.json`, data }, { timeout: 60000 });
  row.submitted = new Date().toISOString(); await saveAttempt(row); return true;
}
export async function sendPendingSubmissions() {
  if (hw.viewingAs() || !hw.studentName()) return;
  for (const row of [...store.S.mocks]) {
    if (row.status !== "done" || row.submitted || !row.finishedAt || Date.now() - Date.parse(row.finishedAt) > 21 * 86400000) continue;
    const mock = await load(row.mock).catch(() => null); if (!mock?.[row.section]) continue;
    try { await submitPart(mock, row.section, row); } catch { return; }
  }
}
