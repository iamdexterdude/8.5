// Teacher mode: build each day's homework and publish it, tell Claude what to set, class settings, music.
// One password opens it; the relay checks the password and does the publishing. Nothing else is ever typed.
import { h, icon, todayISO, addDays, fmtDate } from "../util.js";
import * as store from "../store.js";
import * as hw from "../homework.js";
import { adminLoad, adminSave, putEncrypted, removePublished, listPublished, fetchPublished, encryptOnly, sendTeacherNote, validateHomework, session, lock, unlock, changePassword } from "../publish.js";
import { SITE, CLAUDE_BOT } from "../feedkey.js";
import { head, toast, sheet } from "../ui.js";
import { homeworkSection } from "./hwview.js";

export const live = false;
let tab = "homework";
let draft = null;
let published = null;     // the days that are published, from the relay

const sid = () => "s" + Math.random().toString(36).slice(2, 8);
const lines = (t) => t.split("\n").map((x) => x.trim()).filter(Boolean);
const paras = (t) => t.split(/\n\s*\n/).map((x) => x.replace(/\s*\n\s*/g, " ").trim()).filter(Boolean);
function groups(t) {
  return t.split(/\n\s*\n/).map((b) => lines(b)).filter((b) => b.length).map((b) => (b[0].endsWith("?") ? { name: "", questions: b } : { name: b[0], questions: b.slice(1) }));
}
function cards(t) {
  return lines(t).map((l) => { const [left, ex] = l.split("|").map((x) => x.trim()); const m = left.match(/^(.+?)\s+[-–—]\s+(.+)$/); return m ? { front: m[1].trim(), back: m[2].trim() + (ex ? `\nExample: ${ex}` : "") } : { front: left, back: ex ? `Example: ${ex}` : "" }; }).filter((c) => c.front && c.back);
}

// what each step type asks the teacher for
const SPEC = {
  questions: { label: "Questions to prepare", fields: [["title", "text", "Part 1 questions"], ["intro", "text", ""], ["groups", "area", "", groups, "One topic per block: the topic name on the first line, then one question per line. A blank line starts the next topic."], ["url", "text", ""]] },
  read: { label: "Read a sample answer", fields: [["title", "text", "Sample answer"], ["intro", "text", ""], ["paragraphs", "area", "", paras, "Paste the answer. A blank line starts a new paragraph."], ["highlights", "area", "", lines, "Phrases to highlight in it, one per line."], ["url", "text", ""]] },
  words: { label: "New words (becomes a deck)", fields: [["title", "text", "New words"], ["deck", "text", ""], ["cards", "area", "", cards, "One per line: phrase - meaning | example sentence"]] },
  watch: { label: "Watch a video", fields: [["title", "text", "Video walkthrough"], ["url", "text", ""], ["minutes", "number", ""], ["text", "text", ""]] },
  photos: { label: "Upload photos as a PDF", fields: [["title", "text", "Your notes"], ["prompt", "text", ""], ["label", "text", ""]] },
  record: { label: "Record answers", fields: [["title", "text", "Record your answers"], ["prompt", "text", ""], ["questions", "area", "", lines, "One question per line."], ["label", "text", ""], ["max", "number", "120"]] },
  check: { label: "Confirm", fields: [["title", "text", "Check"], ["text", "text", ""], ["button", "text", "Done"]] },
  text: { label: "Note or link", fields: [["title", "text", "Note"], ["text", "text", ""], ["url", "text", ""], ["linkText", "text", ""]] },
};
const FIELD_NAME = { title: "Title", intro: "Short instruction", deck: "Deck name", url: "Link (optional)", minutes: "Minutes", text: "Text", prompt: "Instruction", label: "Name of the file sent to you", button: "Button text", max: "Seconds per answer", linkText: "Link text", groups: "Questions", paragraphs: "Text", highlights: "Highlights", cards: "Words", questions: "Questions" };

const step = (type) => ({ id: sid(), type, title: SPEC[type].fields[0][2] || SPEC[type].label, _raw: {} });
const TEMPLATES = {
  "Speaking, Part 1": () => ({ id: sid(), kind: "speaking", title: "Speaking", summary: "", minutes: 120, steps: [
    { ...step("questions"), title: "Part 1 questions" }, { ...step("read"), title: "Sample answer" }, { ...step("words"), title: "New words" },
    { ...step("photos"), title: "Your written answers", label: "Speaking written answers", prompt: "Write your answer to each question by hand and highlight the new words you used. Photograph the pages." },
    { ...step("record"), title: "Record your answers", label: "Speaking recordings", max: 120, prompt: "Record one answer for each question." }] }),
  "Writing, lesson notes": () => ({ id: sid(), kind: "writing", title: "Writing", summary: "Review what has been taught", minutes: 20, steps: [
    { ...step("check"), title: "Review the lesson", text: "Go back over what was taught in the lesson.", button: "I reviewed it" },
    { ...step("photos"), title: "Upload your notes", label: "Writing lesson notes", prompt: "Photograph your notes from the lesson." }] }),
  "Reading, video walkthrough": () => ({ id: sid(), kind: "reading", title: "Reading", summary: "One passage", minutes: 40, steps: [
    { ...step("watch"), title: "Watch the video walkthrough" }, { ...step("check"), title: "Check", text: "Make sure you understand every question.", button: "I understand every question" }] }),
  "Blank task": () => ({ id: sid(), kind: "custom", title: "New task", summary: "", minutes: 30, steps: [step("check")] }),
};

const emptyDraft = (date) => ({ v: 1, date, lesson: { no: "", title: "", focus: "", time: "", link: "" }, tasks: [] });
const draftKey = (d) => "eight-draft-" + d;
const saveDraft = () => { try { localStorage.setItem(draftKey(draft.date), JSON.stringify(draft)); } catch {} };
const loadDraft = (d) => { try { const v = localStorage.getItem(draftKey(d)); return v ? JSON.parse(v) : null; } catch { return null; } };
const clean = (hwObj) => JSON.parse(JSON.stringify(hwObj, (k, v) => (k === "_raw" ? undefined : v)));
const defaultDate = () => { const t = todayISO(); const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tashkent", hour: "2-digit", hour12: false }).format(new Date())); return hour >= 17 ? addDays(t, 1) : t; };

export default async function (ctx) {
  const root = h("div");
  root.append(head("Teacher mode", { back: "#/today", actions: session() ? h("button", { class: "btn small quiet", onclick: () => { lock(); ctx.rerender(); } }, "Lock") : null }));
  if (!session()) { root.append(lockPanel(ctx)); return root; }
  if (!draft) draft = loadDraft(defaultDate()) || emptyDraft(defaultDate());
  if (published === null) { published = []; listPublished().then((f) => { published = f.map((x) => x.replace(/\.json$/, "")).sort(); if (tab === "homework") ctx.rerender(); }).catch(() => {}); }
  root.append(h("nav", { class: "seg", "aria-label": "Teacher mode", style: { marginBottom: "16px" } }, [["homework", "Homework"], ["claude", "Tell Claude"], ["class", "Class"], ["music", "Music"]].map(([k, l]) => h("button", { class: "seglink", "aria-current": tab === k ? "page" : null, onclick: () => { tab = k; ctx.rerender(); } }, l))));
  root.append(tab === "homework" ? homeworkTab(ctx) : tab === "claude" ? claudeTab(ctx) : tab === "class" ? classTab(ctx) : musicTab(ctx));
  return root;
}

// ------------------------------------------------------------------ the password screen
function lockPanel(ctx) {
  const msg = h("div", { class: "small", style: { color: "var(--danger)", minHeight: "20px" }, "aria-live": "polite" });
  const p = h("input", { type: "password", placeholder: "Teacher password", "aria-label": "Teacher password", autocomplete: "current-password" });
  const btn = h("button", { class: "btn primary", onclick: go }, "Open teacher mode");
  async function go() {
    btn.disabled = true; msg.textContent = "Opening…";
    const r = await unlock(p.value);
    if (r.status === "ok") { await syncFromPublished(); ctx.rerender(); return; }
    msg.textContent = r.status === "wrong" ? "That is not the password." : r.status === "none" ? "No password is set yet. On the PC, run: node tools/teacher/publish.mjs password" : r.message || "Could not open teacher mode.";
    btn.disabled = false;
  }
  p.addEventListener("keydown", (e) => e.key === "Enter" && go());
  setTimeout(() => p.focus(), 50);
  return h("div", null, h("p", { class: "muted" }, "For the teacher. The student never needs this screen."), h("div", { class: "field", style: { maxWidth: "340px" } }, h("label", null, "Teacher password"), p), btn, msg);
}

// bring the published class settings (name, Telegram, music) onto this device, so every device shows the same thing
async function syncFromPublished() {
  try { const c = await fetchPublished("config.json"); if (c) adminSave({ student: c.student || "", teacher: c.teacher || "", lessonTime: c.lessonTime || "", lessonLink: c.lessonLink || "", music: c.music || [] }); } catch {}
}
const cfgOf = () => { const x = adminLoad(); return { student: x.student || "", teacher: x.teacher || "", lessonTime: x.lessonTime || "", lessonLink: x.lessonLink || "", music: (x.music || []).filter((t) => t.title || t.url), updatedAt: new Date().toISOString() }; };
async function publishConfig(out) {
  out.textContent = "Publishing the class settings…";
  try { const c = cfgOf(); await putEncrypted("config.json", c, "Class settings"); hw.F.config = c; out.textContent = "Published. Her app picks it up the next time it opens Today."; }
  catch (e) { out.textContent = "Could not publish: " + e.message; }
}

// ------------------------------------------------------------------ homework tab
function homeworkTab(ctx) {
  const box = h("div"), rerender = () => { saveDraft(); ctx.rerender(); };
  const pick = (d) => { saveDraft(); draft = loadDraft(d) || emptyDraft(d); ctx.rerender(); };
  const dateIn = h("input", { type: "date", value: draft.date, "aria-label": "Homework for", onchange: (e) => pick(e.target.value) });
  const isPublished = published?.includes(draft.date);
  box.append(h("section", { class: "section", style: { marginTop: 0 } },
    h("div", { class: "field", style: { maxWidth: "260px" } }, h("label", null, "Homework for the day"), dateIn),
    h("div", { class: "row-actions" },
      h("span", { class: "pill " + (isPublished ? "ok" : "") }, isPublished ? "Published" : "Not published"),
      h("button", { class: "btn small", onclick: async () => { try { const v = await fetchPublished(`hw/${draft.date}.json`); if (!v) { toast("Nothing is published for that day."); return; } draft = { ...emptyDraft(draft.date), ...v }; saveDraft(); toast("Loaded what is published."); ctx.rerender(); } catch (e) { toast("Could not load it: " + e.message); } } }, "Load what is published"),
      h("button", { class: "btn small", onclick: () => { const d = loadDraft(addDays(draft.date, -1)); if (!d) { toast("Nothing from the day before."); return; } draft = { ...d, date: draft.date, publishedAt: undefined }; saveDraft(); toast("Copied the day before."); ctx.rerender(); } }, "Copy the day before")),
    published?.length ? h("div", { class: "chips" }, h("span", { class: "tiny faint" }, "Published:"), published.map((d) => h("button", { class: "chip" + (d === draft.date ? " on" : ""), onclick: () => pick(d) }, fmtDate(d, { day: "numeric", month: "short" })))) : null));

  const L = draft.lesson;
  const f = (label, key, ph) => h("div", { class: "field" }, h("label", null, label), h("input", { type: "text", value: L[key] || "", placeholder: ph || "", oninput: (e) => { L[key] = e.target.value; saveDraft(); } }));
  box.append(h("section", { class: "section" }, h("div", { class: "shead" }, h("h2", null, "The lesson")), f("Lesson title", "title", "For example: Part 2 and essay structure"), f("What we cover", "focus", "For example: the Part 2 notes method, plan an essay in five minutes"),
    h("div", { class: "grid3" }, f("Lesson number", "no", "2"), f("Start time", "time", "19:00"), f("Lesson link (optional)", "link", "https://"))));

  box.append(h("section", { class: "section" }, h("div", { class: "shead" }, h("h2", null, "Tasks"), h("span", { class: "kicker" }, "She does them in this order")),
    draft.tasks.length ? draft.tasks.map((t, i) => taskEditor(t, i, rerender)) : h("p", { class: "muted" }, "No tasks yet. Add one from a template below."),
    h("div", { class: "row-actions", style: { marginTop: "12px" } }, Object.keys(TEMPLATES).map((k) => h("button", { class: "btn small", onclick: () => { draft.tasks.push(TEMPLATES[k]()); rerender(); } }, icon("plus", 16), k)))));

  const raw = h("textarea", { rows: 10, spellcheck: false, "aria-label": "Homework as JSON", style: { fontFamily: "ui-monospace, monospace", fontSize: "13px" } }, JSON.stringify(clean(draft), null, 2));
  box.append(h("details", { class: "quiet-box" }, h("summary", { style: { cursor: "pointer", fontWeight: 600 } }, "Raw JSON (advanced, or paste what Claude made)"), raw,
    h("div", { class: "row-actions", style: { marginTop: "8px" } }, h("button", { class: "btn small", onclick: () => { try { const v = JSON.parse(raw.value); draft = { ...emptyDraft(v.date || draft.date), ...v }; saveDraft(); toast("Loaded from JSON."); ctx.rerender(); } catch { toast("That is not valid JSON."); } } }, "Use this JSON"))));

  const out = h("div", { class: "small muted", "aria-live": "polite", style: { marginTop: "8px" } });
  box.append(h("div", { class: "row-actions", style: { margin: "24px 0 6px" } },
    h("button", { class: "btn", onclick: () => preview() }, icon("play", 18), "Preview as the student"),
    h("button", { class: "btn primary", onclick: (e) => publish(out, e.currentTarget, ctx) }, icon("upload", 18), "Publish to the student"),
    isPublished ? h("button", { class: "btn danger", onclick: async (e) => { e.currentTarget.disabled = true; try { await removePublished(`hw/${draft.date}.json`); published = published.filter((d) => d !== draft.date); delete hw.F.hw[draft.date]; out.textContent = `Unpublished ${draft.date}.`; ctx.rerender(); } catch (err) { out.textContent = err.message; } } }, "Unpublish") : null,
    h("button", { class: "btn quiet", onclick: download }, icon("download", 18), "Download file")), out);
  return box;
}

function taskEditor(t, i, rerender) {
  const mv = (arr, from, to) => { if (to < 0 || to >= arr.length) return; arr.splice(to, 0, arr.splice(from, 1)[0]); rerender(); };
  const inp = (key, label, type = "text") => h("div", { class: "field", style: { margin: 0 } }, h("label", { class: "small" }, label), h("input", { type, value: t[key] ?? "", oninput: (e) => { t[key] = type === "number" ? Number(e.target.value) || 0 : e.target.value; saveDraft(); } }));
  return h("div", { class: "taskedit" },
    h("div", { class: "grid3 wide" }, inp("title", "Task title"), inp("summary", "One line about it"), inp("minutes", "Minutes", "number")),
    h("ol", { class: "stepedit" }, t.steps.map((s, j) => h("li", null, stepEditor(s, () => { t.steps.splice(j, 1); rerender(); }, (d) => mv(t.steps, j, j + d))))),
    h("div", { class: "row-actions" },
      h("select", { "aria-label": "Add a step", style: { width: "auto" }, onchange: (e) => { if (!e.target.value) return; t.steps.push(step(e.target.value)); rerender(); } }, [h("option", { value: "" }, "Add a step…"), ...Object.entries(SPEC).map(([k, v]) => h("option", { value: k }, v.label))]),
      h("button", { class: "btn small", onclick: () => mv(draft.tasks, i, i - 1) }, "Move up"), h("button", { class: "btn small", onclick: () => mv(draft.tasks, i, i + 1) }, "Move down"),
      h("button", { class: "btn small danger", onclick: () => { draft.tasks.splice(i, 1); rerender(); } }, icon("trash", 16), "Delete task")));
}

function stepEditor(s, remove, move) {
  const spec = SPEC[s.type] || SPEC.text; s._raw ||= {};
  const fields = spec.fields.map(([key, kind, def, parse, hint]) => {
    const label = FIELD_NAME[key] || key;
    if (kind === "area") {
      const raw = s._raw[key] ?? (s[key] ? (key === "paragraphs" ? s[key].join("\n\n") : key === "highlights" || key === "questions" ? s[key].join("\n") : key === "groups" ? s[key].map((g) => [g.name, ...g.questions].filter(Boolean).join("\n")).join("\n\n") : key === "cards" ? s[key].map((c) => `${c.front} - ${c.back.replace(/\nExample: /, " | ")}`).join("\n") : "") : "");
      return h("div", { class: "field", style: { margin: "6px 0" } }, h("label", { class: "small" }, label), h("textarea", { rows: key === "paragraphs" ? 7 : 4, spellcheck: false, value: raw, oninput: (e) => { s._raw[key] = e.target.value; s[key] = parse(e.target.value); saveDraft(); } }), hint ? h("span", { class: "tiny faint" }, hint) : null);
    }
    return h("div", { class: "field", style: { margin: "6px 0" } }, h("label", { class: "small" }, label), h("input", { type: kind === "number" ? "number" : "text", value: s[key] ?? def ?? "", oninput: (e) => { s[key] = kind === "number" ? Number(e.target.value) || undefined : e.target.value; saveDraft(); } }));
  });
  return h("div", { class: "stepedit-in" }, h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } }, h("b", { class: "small" }, spec.label),
    h("span", null, h("button", { class: "btn small quiet", onclick: () => move(-1), "aria-label": "Move step up" }, "Up"), h("button", { class: "btn small quiet", onclick: () => move(1), "aria-label": "Move step down" }, "Down"), h("button", { class: "btn small quiet danger", onclick: remove, "aria-label": "Delete step" }, icon("trash", 16)))), fields);
}

function finalHomework() {
  const v = clean(draft); v.v ||= 1; v.publishedAt = new Date().toISOString();
  for (const t of v.tasks) { t.id ||= sid(); for (const s of t.steps) { s.id ||= sid(); if (s.type === "photos" && !s.label) s.label = s.title; if (s.type === "record" && !s.label) s.label = s.title; if (s.type === "words" && !s.deck) s.deck = s.title; } }
  return v;
}
function preview() {
  const v = finalHomework(), errs = validateHomework(v);
  if (errs.length) { toast(errs[0]); return; }
  const date = "preview-" + v.date;
  sheet((close) => h("div", null, h("h2", null, "How it looks to the student"), h("p", { class: "small muted" }, "Nothing you do here is sent."), homeworkSection(date, v), h("div", { class: "row-actions", style: { marginTop: "12px" } }, h("button", { class: "btn", onclick: close }, "Close"))));
}
async function publish(out, btn, ctx) {
  const v = finalHomework(), errs = validateHomework(v);
  if (errs.length) { out.textContent = errs[0]; return; }
  btn.disabled = true; out.textContent = "Publishing…";
  try { await putEncrypted(`hw/${v.date}.json`, v, `Homework for ${v.date}`); out.textContent = `Published for ${v.date}. She sees it the next time she opens Today.`; hw.F.hw[v.date] = v; if (published && !published.includes(v.date)) { published.push(v.date); published.sort(); } ctx.rerender(); }
  catch (e) { out.textContent = `Could not publish: ${e.message}`; btn.disabled = false; }
}
async function download() {
  const v = finalHomework();
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([JSON.stringify(v, null, 2)], { type: "application/json" })), download: `${v.date}.json` }); document.body.append(a); a.click(); a.remove();
}

// ------------------------------------------------------------------ tell Claude
// Write the homework in your own words; Claude turns it into the day's homework and publishes it.
const tellKey = (d) => "eight-tell-" + d;
function claudeTab(ctx) {
  const a = adminLoad(); let date = a.tellDate || defaultDate();
  const ta = h("textarea", { rows: 12, placeholder: "For example:\nSpeaking: two Part 1 topics, Hometown and Weekends, 12 questions, the sample answer is in the PDF I will attach, highlight the phrases in bold. She writes answers by hand, photographs them, and records one answer per question.\nWriting: review today's lesson on Task 2 planning, upload notes.\nReading: watch RM13 day 4 passage 3 walkthrough (link), make sure she understands every question.", "aria-label": "Tell Claude the homework" });
  try { ta.value = localStorage.getItem(tellKey(date)) || ""; } catch {}
  const dateIn = h("input", { type: "date", value: date, "aria-label": "Homework for", onchange: (e) => { date = e.target.value; adminSave({ tellDate: date }); try { ta.value = localStorage.getItem(tellKey(date)) || ""; } catch {} } });
  ta.addEventListener("input", () => { try { localStorage.setItem(tellKey(date), ta.value); } catch {} });
  const out = h("div", { class: "small muted", "aria-live": "polite", style: { marginTop: "8px" } });
  const message = () => `8.5 homework for ${date} (${fmtDate(date, { weekday: "long" })}).\n\n${ta.value.trim()}\n\nClaude: build the homework file from this and publish it with: node tools/teacher/publish.mjs homework <file>`;
  const need = () => { if (!ta.value.trim()) { out.textContent = "Write the homework first."; return false; } return true; };
  return h("div", null,
    h("p", { class: "lead" }, "Say what the homework is, in your words. Claude builds it and publishes it."),
    h("p", { class: "small muted" }, "Mention: the date, each task (speaking, writing, reading), the topics and questions, what she must read, watch, write, photograph or record, and any links. Attach PDFs to the same Telegram message."),
    h("div", { class: "field", style: { maxWidth: "260px" } }, h("label", null, "Homework for the day"), dateIn),
    h("div", { class: "field" }, h("label", null, "The homework, in detail"), ta),
    h("div", { class: "row-actions" },
      h("a", { class: "btn primary", href: "#", onclick: (e) => { e.preventDefault(); if (!need()) return; window.open(`https://t.me/share/url?url=${encodeURIComponent(SITE)}&text=${encodeURIComponent(message())}`, "_blank", "noopener"); out.textContent = `Telegram opens: choose the chat with @${CLAUDE_BOT} and send. Claude publishes it when Claude Code is running on the PC.`; } }, icon("upload", 18), "Send to Claude on Telegram"),
      h("button", { class: "btn", onclick: async () => { if (!need()) return; try { await navigator.clipboard.writeText(message()); out.textContent = "Copied. Paste it to Claude Code."; } catch { out.textContent = "Could not copy. Select the text and copy it by hand."; } } }, "Copy for Claude Code"),
      h("button", { class: "btn", onclick: async (e) => { if (!need()) return; const b = e.currentTarget; b.disabled = true; out.textContent = "Saving…"; try { await putEncrypted(`requests/${date}-${sid().slice(1)}.json`, { date, text: ta.value.trim(), savedAt: new Date().toISOString() }, "Note for Claude"); out.textContent = "Saved. In Claude Code say: publish the homework I saved in teacher mode."; } catch (err) { out.textContent = err.message; } b.disabled = false; } }, "Save for Claude")),
    out,
    h("p", { class: "tiny faint", style: { marginTop: "16px" } }, "You can also paste the JSON Claude gives you into Homework, Raw JSON, then Publish."));
}

// ------------------------------------------------------------------ class settings
function classTab(ctx) {
  const a = adminLoad();
  const field = (label, key, type = "text", hint, props = {}) => h("div", { class: "field" }, h("label", null, label), h("input", { type, value: a[key] || "", autocomplete: "off", oninput: (e) => adminSave({ [key]: e.target.value.trim() }), ...props }), hint ? h("span", { class: "tiny faint" }, hint) : null);
  const out = h("div", { class: "small muted", "aria-live": "polite" });
  const p1 = h("input", { type: "password", "aria-label": "New password", autocomplete: "new-password" }), p2 = h("input", { type: "password", "aria-label": "Repeat the new password", autocomplete: "new-password" });
  const pwOut = h("div", { class: "small muted", "aria-live": "polite" });
  return h("div", null,
    h("section", { class: "section", style: { marginTop: 0 } }, h("div", { class: "shead" }, h("h2", null, "Her link")),
      h("p", { class: "small muted" }, "One link, nothing to type. She opens it and installs it like an app."),
      h("div", { class: "row-actions" }, h("input", { type: "text", readOnly: true, value: SITE, "aria-label": "Student link", style: { maxWidth: "360px" }, onfocus: (e) => e.target.select() }), h("button", { class: "btn small", onclick: () => { navigator.clipboard?.writeText(SITE); toast("Copied."); } }, "Copy"))),
    h("section", { class: "section" }, h("div", { class: "shead" }, h("h2", null, "The class")),
      field("Her name", "student", "text", "Shown on Today and on what she sends you. She never has to type it.", { placeholder: "Muslima" }),
      field("Your Telegram username", "teacher", "text", "Gives her a Message your teacher button.", { placeholder: "@username" }),
      h("div", { class: "grid3 wide" }, field("Lesson start time", "lessonTime", "time"), field("Lesson link (Zoom, Meet, Telegram call)", "lessonLink", "text", null, { placeholder: "https://" })),
      h("div", { class: "row-actions" }, h("button", { class: "btn primary", onclick: () => publishConfig(out) }, icon("upload", 18), "Publish class settings")), out),
    h("section", { class: "section" }, h("div", { class: "shead" }, h("h2", null, "Telegram")),
      h("p", { class: "small muted" }, `Her photos (as one PDF) and recordings arrive in your Telegram, in the chat with @${CLAUDE_BOT}. Each file is named with the date and the task.`),
      h("div", { class: "row-actions" }, h("button", { class: "btn small", onclick: async (e) => { const b = e.currentTarget; b.disabled = true; try { await sendTeacherNote("8.5: test message. Her work will arrive here."); toast("Sent. Check Telegram."); } catch (err) { toast(err.message); } b.disabled = false; } }, "Send a test message"))),
    h("section", { class: "section" }, h("div", { class: "shead" }, h("h2", null, "Password")),
      h("div", { class: "grid3 wide" }, h("div", { class: "field" }, h("label", null, "New password (10+ characters)"), p1), h("div", { class: "field" }, h("label", null, "Repeat it"), p2)),
      h("div", { class: "row-actions" }, h("button", { class: "btn", onclick: async (e) => { if (p1.value.length < 10) { pwOut.textContent = "Use at least 10 characters."; return; } if (p1.value !== p2.value) { pwOut.textContent = "The two passwords are different."; return; } const b = e.currentTarget; b.disabled = true; pwOut.textContent = "Changing…"; try { await changePassword(p1.value); pwOut.textContent = "Changed. Use the new password from now on, on every device."; p1.value = p2.value = ""; } catch (err) { pwOut.textContent = err.message; } b.disabled = false; } }, "Change the password")), pwOut));
}

// ------------------------------------------------------------------ music
function musicTab(ctx) {
  const a = adminLoad(), list = a.music || [];
  const save = () => adminSave({ music: list });
  const out = h("div", { class: "small muted", "aria-live": "polite" });
  const rows = list.map((t, i) => h("div", { class: "taskedit" },
    h("div", { class: "grid3 wide" }, ...["title", "artist"].map((k) => h("div", { class: "field", style: { margin: 0 } }, h("label", { class: "small" }, k === "title" ? "Track" : "Artist"), h("input", { type: "text", value: t[k] || "", oninput: (e) => { t[k] = e.target.value; save(); } })))),
    h("div", { class: "field", style: { margin: "6px 0" } }, h("label", { class: "small" }, "Link (YouTube, Spotify or Apple Music)"), h("input", { type: "text", value: t.url || "", oninput: (e) => { t.url = e.target.value; save(); } })),
    h("div", { class: "field", style: { margin: "6px 0" } }, h("label", { class: "small" }, "A line from you (optional)"), h("input", { type: "text", value: t.note || "", oninput: (e) => { t.note = e.target.value; save(); } })),
    h("div", { class: "row-actions" }, h("span", { class: "tiny faint num" }, `Track ${i + 1}`), h("button", { class: "btn small quiet danger", onclick: () => { list.splice(i, 1); save(); ctx.rerender(); } }, icon("trash", 16), "Remove"))));
  const bulk = h("textarea", { rows: 4, placeholder: "Title - Artist - https://link\nTitle - Artist - https://link", "aria-label": "Add many tracks" });
  return h("div", null, h("p", { class: "small muted" }, "After she finishes a day's homework she gets one track from this list, in order. Only the links are stored, never the songs."),
    h("p", { class: "tiny faint" }, `${list.length} tracks`), rows,
    h("div", { class: "row-actions", style: { marginTop: "10px" } },
      h("button", { class: "btn", onclick: () => { list.push({ title: "", artist: "", url: "", note: "" }); save(); ctx.rerender(); } }, icon("plus", 18), "Add a track"),
      h("button", { class: "btn primary", onclick: () => publishConfig(out) }, icon("upload", 18), "Publish the list")), out,
    h("details", { class: "quiet-box" }, h("summary", { style: { cursor: "pointer", fontWeight: 600 } }, "Add many at once"), h("p", { class: "tiny faint" }, "One per line: Title - Artist - link"), bulk,
      h("div", { class: "row-actions", style: { marginTop: "8px" } }, h("button", { class: "btn small", onclick: () => { for (const l of lines(bulk.value)) { const [title = "", artist = "", url = ""] = l.split(/\s+-\s+/).map((x) => x.trim()); if (title) list.push({ title, artist, url, note: "" }); } save(); ctx.rerender(); } }, "Add these"))));
}
