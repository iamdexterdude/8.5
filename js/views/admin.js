// Teacher mode: send homework, mocks and decks to Claude in words; see how she is doing; estimate her mocks; notes; class settings; music.
// One password opens it; the relay checks the password and does the publishing.
import { h, icon, todayISO, addDays, fmtDate, fmtShort } from "../util.js";
import * as store from "../store.js";
import * as hw from "../homework.js";
import { adminLoad, adminSave, putEncrypted, fetchPublished, readPublished, sendTeacherNote, sendToClaude, claudeStatus, session, lock, unlock, changePassword } from "../publish.js";
import { SITE } from "../feedkey.js";
import { head, toast } from "../ui.js";

export const live = false;
let tab = "claude";

const defaultDate = () => { const t = todayISO(); const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tashkent", hour: "2-digit", hour12: false }).format(new Date())); return hour >= 17 ? addDays(t, 1) : t; };
const lines = (t) => t.split("\n").map((x) => x.trim()).filter(Boolean);

export default async function (ctx) {
  const root = h("div");
  root.append(head("Teacher mode", { back: "#/today", actions: session() ? h("button", { class: "btn small quiet", onclick: () => { lock(); ctx.rerender(); } }, "Lock") : null }));
  if (!session()) { root.append(lockPanel(ctx)); return root; }
  root.append(h("nav", { class: "seg", "aria-label": "Teacher mode", style: { marginBottom: "16px" } }, [["claude", "Send to Claude"], ["student", "Her work"], ["mocks", "Mocks"], ["anki", "Anki"], ["class", "Class"], ["music", "Music"]].map(([k, l]) => h("button", { class: "seglink", "aria-current": tab === k ? "page" : null, onclick: () => { tab = k; ctx.rerender(); } }, l))));
  root.append(tab === "claude" ? claudeTab(ctx) : tab === "student" ? await studentTab(ctx) : tab === "mocks" ? mocksTab(ctx) : tab === "anki" ? ankiTab(ctx) : tab === "class" ? classTab(ctx) : musicTab(ctx));
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
async function syncFromPublished() {
  try { const c = await fetchPublished("config.json"); if (c) adminSave({ cfg: c }); } catch {}
}
const cfgOf = () => ({ ...(adminLoad().cfg || {}) });
async function publishConfig(patch, out, done = "Published.") {
  const c = { ...cfgOf(), ...patch, updatedAt: new Date().toISOString() };
  adminSave({ cfg: c });
  if (out) out.textContent = "Publishing…";
  try { await putEncrypted("config.json", c, "Class settings"); hw.F.config = c; if (out) out.textContent = done; }
  catch (e) { if (out) out.textContent = "Could not publish: " + e.message; else toast(e.message); }
}

// ------------------------------------------------------------------ send to Claude: homework, a mock, a deck
const tellKey = (k, d) => `eight-tell-${k}-${d}`;
let tellFiles = [], tellPoll = 0;
const MAX_ATTACH = 60 * 1024 * 1024;
const STEP_TEXT = { picked: "The PC has it. Claude is reading your note…", building: "Claude is building it…", fixing: "Claude is fixing a problem it found…", publishing: "Publishing it to her app…" };
const kb = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");
const KINDS = {
  homework: { label: "Homework", ph: "For example:\nSpeaking: two Part 1 topics, Hometown and Weekends, 12 questions, the sample answer is in the PDF I attached, highlight the phrases in bold. She writes answers by hand, photographs them, and records one answer per question.\nWriting: review today's lesson on Task 2 planning, upload notes.\nReading: watch RM13 day 4 passage 3 walkthrough (link).", help: "Mention the date, each task, the topics and questions, what she must read, watch, write, photograph or record, and any links. Attach PDFs or photos." },
  mock: { label: "Mock", ph: "For example:\nMock 3, Cambridge 18 Test 2. Listening paper, reading paper, writing paper and the keys are in the PDFs; the audio is attached. Speaking: use the Part 1 topics Work and Hometown, the Part 2 card about a book, Part 3 on reading habits.", help: "Attach the papers (PDF), the answer keys and the listening audio (mp3 or m4a). Say which mock number this is. Claude builds the whole test and the app marks Listening and Reading by itself." },
  deck: { label: "Anki deck", ph: "For example:\nLesson 3 words: to spring up - appear suddenly | New cafes have sprung up everywhere\na sense of community\nto put up with - tolerate", help: "List the words or phrases, with meanings and examples if you have them. One per line is easiest. Claude makes the deck; every card arrives new." },
};
function claudeTab(ctx) {
  const a = adminLoad(); let kind = a.tellKind || "homework", date = a.tellDate || defaultDate();
  const ta = h("textarea", { rows: 10, "aria-label": "Tell Claude" });
  const help = h("p", { class: "small muted" });
  const load = () => { ta.placeholder = KINDS[kind].ph; help.textContent = KINDS[kind].help; try { ta.value = localStorage.getItem(tellKey(kind, date)) || ""; } catch {} };
  const kindSeg = h("div", { class: "seg", role: "group", "aria-label": "What to send" }, Object.entries(KINDS).map(([k, v]) => h("button", { "aria-pressed": String(kind === k), onclick: (e) => { kind = k; adminSave({ tellKind: k }); e.currentTarget.parentElement.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === e.currentTarget))); load(); } }, v.label)));
  const dateIn = h("input", { type: "date", value: date, "aria-label": "For the day", onchange: (e) => { date = e.target.value; adminSave({ tellDate: date }); load(); } });
  ta.addEventListener("input", () => { try { localStorage.setItem(tellKey(kind, date), ta.value); } catch {} });
  load();
  const out = h("div", { class: "small muted", "aria-live": "polite", style: { marginTop: "8px" } });
  const status = h("div", { class: "tellstatus", "aria-live": "polite" });
  const need = () => { if (!ta.value.trim()) { out.textContent = "Write it first."; return false; } if (!date) { out.textContent = "Pick the day."; return false; } return true; };
  const fileIn = h("input", { type: "file", multiple: true, accept: ".pdf,image/*,audio/*,.txt,.doc,.docx,.mp3,.m4a", hidden: true, onchange: (e) => { tellFiles.push(...e.target.files); e.target.value = ""; drawFiles(); } });
  const fileList = h("ul", { class: "rows", style: { marginTop: "8px" } });
  function drawFiles() {
    fileList.hidden = !tellFiles.length;
    fileList.replaceChildren(...tellFiles.map((f, i) => h("li", null, h("div", { class: "row", style: { minHeight: "48px" } }, h("div", { class: "grow" }, h("div", { class: "title" }, f.name), h("div", { class: "sub" }, kb(f.size))),
      h("button", { class: "btn small quiet", "aria-label": `Remove ${f.name}`, onclick: () => { tellFiles.splice(i, 1); drawFiles(); } }, icon("close", 16))))));
  }
  drawFiles();
  const sendBtn = h("button", { class: "btn primary", onclick: send }, icon("send", 18), "Send to Claude");
  async function send() {
    if (!need()) return;
    if (tellFiles.reduce((n, f) => n + f.size, 0) > MAX_ATTACH) { out.textContent = "The attachments are too large: 60 MB together at most."; return; }
    sendBtn.disabled = true; out.textContent = ""; tellPoll++;
    const line = (t) => { status.dataset.state = "sending"; status.replaceChildren(h("div", { class: "t" }, h("span", { class: "dot", "aria-hidden": "true" }), t)); };
    try {
      const sentAt = Date.now(), id = await sendToClaude({ date, kind, text: ta.value.trim(), files: tellFiles }, line);
      tellFiles = []; drawFiles(); try { localStorage.removeItem(tellKey(kind, date)); } catch {}
      adminSave({ tellLast: { id, date, kind, sentAt } }); follow(id, date, kind, sentAt);
    } catch (err) { status.dataset.state = "failed"; status.replaceChildren(h("div", { class: "t" }, "Not sent"), h("div", { class: "s" }, err.message)); }
    sendBtn.disabled = false;
  }
  function draw(st, d, k, sentAt) {
    const what = KINDS[k]?.label.toLowerCase() || "it", day = (x) => fmtDate(x, { weekday: "long", day: "numeric", month: "long" });
    const wait = (t) => h("div", { class: "t" }, h("span", { class: "dot", "aria-hidden": "true" }), t);
    status.dataset.state = st?.state || "waiting";
    if (!st) status.replaceChildren(wait("Sent. Waiting for the PC to pick it up…"), Date.now() - sentAt > 90000 ? h("div", { class: "s" }, "The PC has not picked it up yet. It must be on and online; the request waits until it is.") : "");
    else if (st.state === "working") status.replaceChildren(wait(STEP_TEXT[st.step] || "Claude is working on it…"), h("div", { class: "s" }, `The ${what} for ${day(d)}. A few minutes; a mock with audio takes longer. Telegram tells you when it is live.`));
    else if (st.state === "published") status.replaceChildren(h("div", { class: "t" }, icon("check", 18), `Published`), h("div", { class: "s" }, st.summary || "She sees it the next time she opens the app."));
    else status.replaceChildren(h("div", { class: "t" }, `Not published`), h("div", { class: "s" }, `${st.error || "Something went wrong."}\nYour text is still here. Press Send to try again.`));
  }
  function follow(id, d, k, sentAt) {
    const me = ++tellPoll; let delay = 2500; draw(null, d, k, sentAt);
    const tick = async () => {
      if (me !== tellPoll || !status.isConnected) return;
      let st; try { st = await claudeStatus(id); } catch { st = undefined; }
      if (me !== tellPoll || !status.isConnected) return;
      if (st !== undefined) draw(st, d, k, sentAt);
      if (st && (st.state === "published" || st.state === "failed")) return;
      if (Date.now() - sentAt > 2 * 3600000) return;
      delay = Math.min(delay * 1.25, 10000); setTimeout(tick, delay);
    };
    setTimeout(tick, 1500);
  }
  const last = a.tellLast; if (last?.id && Date.now() - last.sentAt < 12 * 3600000) follow(last.id, last.date, last.kind || "homework", last.sentAt);
  return h("div", null,
    h("p", { class: "lead" }, "Say what it is, in your words, attach the files, press Send. Claude builds it, checks it and publishes it to her app."),
    h("div", { class: "field" }, h("div", { class: "lbl" }, "What"), kindSeg), help,
    h("div", { class: "field", style: { maxWidth: "260px" } }, h("label", null, "For the day"), dateIn),
    h("div", { class: "field" }, h("label", null, "In detail"), ta),
    fileIn, fileList,
    h("div", { class: "row-actions" }, sendBtn, h("button", { class: "btn", onclick: () => fileIn.click() }, icon("plus", 18), "Attach files")),
    out, status,
    h("p", { class: "tiny faint", style: { marginTop: "16px" } }, "Send works while the PC is on: the watcher there hands your note to Claude Code. If the PC is off, the note waits and goes through when it is back."));
}

// ------------------------------------------------------------------ her work
async function studentTab(ctx) {
  let rep = null;
  try { const t = await readPublished(`students/${hw.studentId()}.json`); rep = t ? JSON.parse(t) : null; } catch {}
  if (!rep) return h("div", null, h("p", { class: "muted" }, "Nothing reported yet. Her app sends a small report each time she studies, finishes homework or a mock."));
  const when = (iso) => new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Tashkent", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const box = h("div", null, h("p", { class: "small muted" }, `${rep.student}, reported ${when(rep.at)}. Streak ${rep.streak} ${rep.streak === 1 ? "day" : "days"}.`));
  const hb = rep.habits;
  if (hb) {
    const bits = [];
    bits.push(`${hb.activeDays7 ?? 0} of the last 7 days active`);
    if (hb.usualHour != null) bits.push(`usually starts around ${String(hb.usualHour).padStart(2, "0")}:00`);
    if (hb.lateDays7) bits.push(`${hb.lateDays7} ${hb.lateDays7 === 1 ? "night" : "nights"} after 23:00 this week`);
    if (hb.hwDone14) bits.push(`homework: ${hb.hwDone14} done in 14 days${hb.hwLate14 ? `, ${hb.hwLate14} late by two days or more` : ""}${hb.hwNight14 ? `, ${hb.hwNight14} finished after 23:00` : ""}`);
    if (hb.lastActive) bits.push(`last active ${fmtShort(hb.lastActive)}`);
    box.append(h("section", { class: "section", style: { marginTop: "8px" } }, h("div", { class: "shead" }, h("h2", null, "Habits")), h("p", null, bits.join(" · ") + "."), h("p", { class: "tiny faint" }, "Her Today screen says these things to her too, gently, one at a time.")));
  }
  const a = rep.anki || {};
  box.append(h("section", { class: "section", style: { marginTop: "8px" } }, h("div", { class: "shead" }, h("h2", null, "Anki")),
    h("div", { class: "stats" }, stat(a.cards ?? 0, "cards"), stat(a.due ?? 0, "due now"), stat(a.reviews14 ?? 0, "reviews, 14 days"), stat(a.days14 ?? 0, "days studied, of 14")),
    a.lastReview ? h("p", { class: "small muted" }, "Last review " + fmtShort(a.lastReview) + ".") : h("p", { class: "small muted" }, "She has not reviewed yet."),
    a.decks?.length ? h("ul", { class: "rows" }, a.decks.map((d) => h("li", null, h("div", { class: "row", style: { minHeight: "44px" } }, h("div", { class: "grow" }, h("div", { class: "title" }, d.name), h("div", { class: "sub num" }, `${d.total} cards · ${d.fresh} new · ${d.due} due · ${d.started} started`)), h("span", { class: "pill" }, d.kind === "teacher" ? "yours" : "hers"))))) : null,
    h("div", { class: "row-actions", style: { marginTop: "10px" } }, h("button", { class: "btn small", onclick: () => { tab = "anki"; ctx.rerender(); } }, "Write her a note"))));
  if (rep.mocks?.length) box.append(h("section", { class: "section" }, h("div", { class: "shead" }, h("h2", null, "Mocks")),
    h("ul", { class: "rows" }, rep.mocks.slice().reverse().map((m) => h("li", null, h("div", { class: "row", style: { minHeight: "44px" } }, h("div", { class: "grow" }, h("div", { class: "title" }, `${m.mock} · ${m.section}`), h("div", { class: "sub num" }, `${when(m.finishedAt)}${m.leaves ? ` · left the screen ${m.leaves}×` : ""}`)), m.band != null ? h("b", { class: "num" }, `${m.band} (${m.raw})`) : h("span", { class: "faint small" }, "with you")))))));
  if (rep.homework?.length) box.append(h("section", { class: "section" }, h("div", { class: "shead" }, h("h2", null, "Homework")),
    h("ul", { class: "rows" }, rep.homework.slice().reverse().map((d) => h("li", null, h("div", { class: "row", style: { minHeight: "40px" } }, h("div", { class: "grow" }, fmtDate(d.date, { weekday: "short", day: "numeric", month: "short" })), h("span", { class: "pill " + (d.completedAt ? "ok" : d.done ? "warn" : "") }, d.completedAt ? "Done" : `${d.done} of ${d.total}`)))))));
  if (rep.checkins?.length) box.append(h("section", { class: "section" }, h("div", { class: "shead" }, h("h2", null, "What she said on Today")),
    h("ul", { class: "rows" }, rep.checkins.slice().reverse().map((c) => h("li", null, h("div", { class: "row", style: { minHeight: "40px", alignItems: "flex-start" } }, h("div", { class: "grow" }, h("div", { class: "sub" }, c.prompt), h("div", null, c.answer)), h("span", { class: "tiny faint num" }, when(c.at))))))));
  return box;
}
const stat = (v, k) => h("div", { class: "stat" }, h("b", { class: "num" }, String(v)), h("span", null, k));

// ------------------------------------------------------------------ mocks: what is published, and your estimates
function mocksTab(ctx) {
  const mocks = [...(hw.F.mocks || [])].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const box = h("div", null, h("p", { class: "small muted" }, "A mock arrives through Send to Claude (papers, keys and audio attached). Listening and Reading are marked in her app; you give the Writing and Speaking bands here, and a line for her."));
  if (!mocks.length) box.append(h("p", { class: "muted" }, "No mocks published yet."));
  for (const m of mocks) {
    const est = hw.F.results?.[m.id] || {};
    const w = h("input", { type: "number", step: "0.5", min: 0, max: 9, value: est.writing?.band ?? "", "aria-label": "Writing band", placeholder: "7.0" });
    const s = h("input", { type: "number", step: "0.5", min: 0, max: 9, value: est.speaking?.band ?? "", "aria-label": "Speaking band", placeholder: "6.5" });
    const wn = h("input", { type: "text", value: est.writing?.note || "", placeholder: "One line on her writing (optional)", "aria-label": "Writing note" });
    const sn = h("input", { type: "text", value: est.speaking?.note || "", placeholder: "One line on her speaking (optional)", "aria-label": "Speaking note" });
    const note = h("input", { type: "text", value: est.note || "", placeholder: "A line about the whole mock (optional)", "aria-label": "Mock note" });
    const out = h("div", { class: "small muted", "aria-live": "polite" });
    box.append(h("section", { class: "taskedit" }, h("div", { class: "shead" }, h("h2", null, m.title || m.id), h("span", { class: "kicker" }, m.date ? fmtShort(m.date) : "")),
      h("div", { class: "grid3 wide" }, h("div", { class: "field", style: { margin: 0 } }, h("label", { class: "small" }, "Writing band"), w), h("div", { class: "field", style: { margin: 0 } }, h("label", { class: "small" }, "Speaking band"), s)),
      h("div", { class: "field", style: { margin: "8px 0" } }, wn), h("div", { class: "field", style: { margin: "8px 0" } }, sn), h("div", { class: "field", style: { margin: "8px 0" } }, note),
      h("div", { class: "row-actions" }, h("button", { class: "btn primary small", onclick: async (e) => { const b = e.currentTarget; b.disabled = true; out.textContent = "Publishing…";
        const v = { writing: w.value ? { band: Number(w.value), note: wn.value.trim() } : null, speaking: s.value ? { band: Number(s.value), note: sn.value.trim() } : null, note: note.value.trim(), at: new Date().toISOString() };
        try { await putEncrypted(`results/${m.id}.json`, v, `Estimate ${m.id}`); hw.F.results[m.id] = v; out.textContent = "Published. She sees it in Progress."; } catch (err) { out.textContent = err.message; } b.disabled = false; } }, "Publish bands")), out));
  }
  return box;
}

// ------------------------------------------------------------------ anki: a note to her, and a quick deck
function ankiTab(ctx) {
  const c = cfgOf();
  const ta = h("textarea", { rows: 3, placeholder: "For example: Four days without a review. Ten minutes tonight, then it is easy again.", "aria-label": "Note for her Anki", value: c.ankiNote?.text || "" });
  const out = h("div", { class: "small muted", "aria-live": "polite" });
  const name = h("input", { type: "text", placeholder: "Lesson 3: Part 2 phrases", "aria-label": "Deck name" });
  const cards = h("textarea", { rows: 6, placeholder: "to spring up - appear suddenly | New cafes have sprung up everywhere\na sense of community - the feeling of belonging\n…", "aria-label": "Cards" });
  const out2 = h("div", { class: "small muted", "aria-live": "polite" });
  return h("div", null,
    h("section", { class: "section", style: { marginTop: 0 } }, h("div", { class: "shead" }, h("h2", null, "A note on her Anki screen")),
      h("p", { class: "small muted" }, "Shows once, at the top of her Anki, until she taps Got it. Her numbers are under Her work."),
      h("div", { class: "field" }, ta),
      h("div", { class: "row-actions" }, h("button", { class: "btn primary small", onclick: () => publishConfig({ ankiNote: ta.value.trim() ? { text: ta.value.trim(), at: new Date().toISOString() } : null }, out, "Published. She sees it the next time she opens Anki.") }, "Publish the note"), c.ankiNote?.text ? h("button", { class: "btn small quiet", onclick: () => { ta.value = ""; publishConfig({ ankiNote: null }, out, "Removed."); } }, "Remove") : null), out),
    h("section", { class: "section" }, h("div", { class: "shead" }, h("h2", null, "A deck, quickly")),
      h("p", { class: "small muted" }, "One card per line: phrase - meaning | example. For anything longer, use Send to Claude with Anki deck."),
      h("div", { class: "field" }, h("label", null, "Deck name"), name), h("div", { class: "field" }, h("label", null, "Cards"), cards),
      h("div", { class: "row-actions" }, h("button", { class: "btn primary small", onclick: async (e) => {
        const list = lines(cards.value).map((l) => { const [left, ex] = l.split("|").map((x) => x.trim()); const m = left.match(/^(.+?)\s+[-–—]\s+(.+)$/); return m ? { front: m[1].trim(), back: m[2].trim(), example: ex || "" } : null; }).filter(Boolean);
        if (!name.value.trim() || !list.length) { out2.textContent = "Give it a name and at least one card written as phrase - meaning."; return; }
        const b = e.currentTarget; b.disabled = true; out2.textContent = "Publishing…";
        const id = (name.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "deck") + "-" + Date.now().toString(36).slice(-4);
        try {
          await putEncrypted(`decks/${id}.json`, { id, name: name.value.trim(), note: "", cards: list.map((c, i) => ({ id: String(i + 1), ...c })), publishedAt: new Date().toISOString() }, `Deck ${id}`);
          const index = (await fetchPublished("decks/index.json")) || []; index.push({ id, name: name.value.trim(), date: todayISO(), cards: list.length });
          await putEncrypted("decks/index.json", index, `Index: ${id}`);
          out2.textContent = `Published: ${list.length} cards. They arrive new in her Anki.`; name.value = ""; cards.value = "";
        } catch (err) { out2.textContent = err.message; } b.disabled = false; } }, "Publish the deck")), out2));
}

// ------------------------------------------------------------------ class settings
function classTab(ctx) {
  const c = cfgOf();
  const field = (label, key, type = "text", hint, props = {}) => h("div", { class: "field" }, h("label", null, label), h("input", { type, value: c[key] || "", autocomplete: "off", oninput: (e) => { c[key] = e.target.value.trim(); adminSave({ cfg: c }); }, ...props }), hint ? h("span", { class: "tiny faint" }, hint) : null);
  const days = new Set((c.lessonDays || [1, 3, 5]).map(Number));
  const dayChips = h("div", { class: "chips" }, [1, 2, 3, 4, 5, 6, 7].map((d) => h("button", { class: "chip" + (days.has(d) ? " on" : ""), "aria-pressed": String(days.has(d)), onclick: (e) => { days.has(d) ? days.delete(d) : days.add(d); c.lessonDays = [...days].sort(); adminSave({ cfg: c }); e.currentTarget.classList.toggle("on", days.has(d)); } }, ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][d])));
  const out = h("div", { class: "small muted", "aria-live": "polite" });
  const tnote = h("textarea", { rows: 2, placeholder: "A line that shows on her Today, once, until she taps Got it.", "aria-label": "Note for Today", value: c.todayNote?.text || "" });
  const nout = h("div", { class: "small muted", "aria-live": "polite" });
  const p1 = h("input", { type: "password", "aria-label": "New password", autocomplete: "new-password" }), p2 = h("input", { type: "password", "aria-label": "Repeat the new password", autocomplete: "new-password" });
  const pwOut = h("div", { class: "small muted", "aria-live": "polite" });
  return h("div", null,
    h("section", { class: "section", style: { marginTop: 0 } }, h("div", { class: "shead" }, h("h2", null, "Her link")),
      h("div", { class: "row-actions" }, h("input", { type: "text", readOnly: true, value: SITE, "aria-label": "Student link", style: { maxWidth: "360px" }, onfocus: (e) => e.target.select() }), h("button", { class: "btn small", onclick: () => { navigator.clipboard?.writeText(SITE); toast("Copied."); } }, "Copy"))),
    h("section", { class: "section" }, h("div", { class: "shead" }, h("h2", null, "The class")),
      field("Her name", "student", "text", null, { placeholder: "Muslima" }),
      field("Your Telegram username", "teacher", "text", "Gives her a Message your teacher button.", { placeholder: "@username" }),
      h("div", { class: "field" }, h("div", { class: "lbl" }, "Lesson days"), dayChips),
      h("div", { class: "grid3 wide" }, field("Lesson time", "lessonTime", "time"), field("Lesson link (Zoom, Meet, Telegram)", "lessonLink", "text", null, { placeholder: "https://" })),
      h("div", { class: "row-actions" }, h("button", { class: "btn primary", onclick: () => publishConfig({ student: c.student, teacher: c.teacher, lessonDays: [...days].sort(), lessonTime: c.lessonTime, lessonLink: c.lessonLink }, out, "Published. Her app picks it up the next time it opens.") }, icon("upload", 18), "Publish class settings")), out),
    h("section", { class: "section" }, h("div", { class: "shead" }, h("h2", null, "A note on her Today")),
      h("div", { class: "field" }, tnote),
      h("div", { class: "row-actions" }, h("button", { class: "btn small primary", onclick: () => publishConfig({ todayNote: tnote.value.trim() ? { text: tnote.value.trim(), at: new Date().toISOString() } : null }, nout, "Published.") }, "Publish the note"), c.todayNote?.text ? h("button", { class: "btn small quiet", onclick: () => { tnote.value = ""; publishConfig({ todayNote: null }, nout, "Removed."); } }, "Remove") : null), nout),
    h("section", { class: "section" }, h("div", { class: "shead" }, h("h2", null, "Telegram")),
      h("p", { class: "small muted" }, "Her photos, essays and recordings arrive in your Telegram from the 8.5 bot, with a line each time she finishes a mock part or answers a Today question."),
      h("div", { class: "row-actions" }, h("button", { class: "btn small", onclick: async (e) => { const b = e.currentTarget; b.disabled = true; try { await sendTeacherNote("8.5: test message. Her work will arrive here."); toast("Sent. Check Telegram."); } catch (err) { toast(err.message); } b.disabled = false; } }, "Send a test message"))),
    h("section", { class: "section" }, h("div", { class: "shead" }, h("h2", null, "Password")),
      h("div", { class: "grid3 wide" }, h("div", { class: "field" }, h("label", null, "New password (4+ characters)"), p1), h("div", { class: "field" }, h("label", null, "Repeat it"), p2)),
      h("div", { class: "row-actions" }, h("button", { class: "btn", onclick: async (e) => { if (p1.value.length < 4) { pwOut.textContent = "Use at least 4 characters."; return; } if (p1.value !== p2.value) { pwOut.textContent = "The two passwords are different."; return; } const b = e.currentTarget; b.disabled = true; pwOut.textContent = "Changing…"; try { await changePassword(p1.value); pwOut.textContent = "Changed."; p1.value = p2.value = ""; } catch (err) { pwOut.textContent = err.message; } b.disabled = false; } }, "Change the password")), pwOut));
}

// ------------------------------------------------------------------ music
function musicTab(ctx) {
  const c = cfgOf(), list = c.music || [];
  const save = () => { c.music = list; adminSave({ cfg: c }); };
  const out = h("div", { class: "small muted", "aria-live": "polite" });
  const rows = list.map((t, i) => h("div", { class: "taskedit" },
    h("div", { class: "grid3 wide" }, ...["title", "artist"].map((k) => h("div", { class: "field", style: { margin: 0 } }, h("label", { class: "small" }, k === "title" ? "Track" : "Artist"), h("input", { type: "text", value: t[k] || "", oninput: (e) => { t[k] = e.target.value; save(); } })))),
    h("div", { class: "field", style: { margin: "6px 0" } }, h("label", { class: "small" }, "Link"), h("input", { type: "text", value: t.url || "", oninput: (e) => { t.url = e.target.value; save(); } })),
    h("div", { class: "field", style: { margin: "6px 0" } }, h("label", { class: "small" }, "A line from you (optional)"), h("input", { type: "text", value: t.note || "", oninput: (e) => { t.note = e.target.value; save(); } })),
    h("div", { class: "row-actions" }, h("span", { class: "tiny faint num" }, `Track ${i + 1}`), h("button", { class: "btn small quiet danger", onclick: () => { list.splice(i, 1); save(); ctx.rerender(); } }, icon("trash", 16), "Remove"))));
  const bulk = h("textarea", { rows: 4, placeholder: "Title - Artist - https://link", "aria-label": "Add many tracks" });
  return h("div", null, h("p", { class: "small muted" }, "After she finishes a day's homework she gets one track from this list, in order."),
    h("p", { class: "tiny faint" }, `${list.length} tracks`), rows,
    h("div", { class: "row-actions", style: { marginTop: "10px" } },
      h("button", { class: "btn", onclick: () => { list.push({ title: "", artist: "", url: "", note: "" }); save(); ctx.rerender(); } }, icon("plus", 18), "Add a track"),
      h("button", { class: "btn primary", onclick: () => publishConfig({ music: list.filter((t) => t.title || t.url) }, out, "Published.") }, icon("upload", 18), "Publish the list")), out,
    h("details", { class: "quiet-box" }, h("summary", { style: { cursor: "pointer", fontWeight: 600 } }, "Add many at once"), bulk,
      h("div", { class: "row-actions", style: { marginTop: "8px" } }, h("button", { class: "btn small", onclick: () => { for (const l of lines(bulk.value)) { const [title = "", artist = "", url = ""] = l.split(/\s+-\s+/).map((x) => x.trim()); if (title) list.push({ title, artist, url, note: "" }); } save(); ctx.rerender(); } }, "Add these"))));
}
