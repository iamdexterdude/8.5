// The kinds of homework step a teacher can set, and how each one is done on screen.
//   questions  read  words  watch  photos  record  check  text
// Each step ends with a button that marks it done and moves her to the next one.
import { h, icon, mmss } from "../util.js";
import * as store from "../store.js";
import * as hw from "../homework.js";
import { imagesToPdf } from "../pdf.js";
import { toast } from "../ui.js";

const slug = (s) => String(s || "work").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "work";
// what she has picked or recorded in a step survives a re-render of the screen
const MEM = new Map();
const mem = (key, init) => { if (!MEM.has(key)) MEM.set(key, init()); return MEM.get(key); };

function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
// shows the phrases the teacher highlighted in a sample answer
function withHighlights(text, phrases) {
  const list = (phrases || []).filter(Boolean).sort((a, b) => b.length - a.length);
  if (!list.length) return [text];
  const rx = new RegExp("(" + list.map(esc).join("|") + ")", "gi"), out = []; let last = 0, m;
  while ((m = rx.exec(text))) { out.push(text.slice(last, m.index)); out.push(h("mark", null, m[0])); last = m.index + m[0].length; }
  out.push(text.slice(last)); return out;
}

async function finishStep(c, data) {
  await hw.setStep(c.date, c.step.id, { done: true, doneAt: new Date().toISOString(), ...(data ? { data } : {}) });
  await hw.noteCompletion(c.date, c.hw);
  c.advance?.();
}
const doneBtn = (c, label = "Done", data) => h("button", { class: "btn primary", onclick: (e) => { e.currentTarget.disabled = true; finishStep(c, data); } }, icon("check", 18), label);
const linkBtn = (url, label, ic = "link") => h("a", { class: "btn", href: url, target: "_blank", rel: "noopener" }, icon(ic, 18), label);

// ---------------------------------------------------------------- step bodies
function questions(c) {
  const s = c.step;
  return h("div", null,
    s.intro ? h("p", { class: "muted" }, s.intro) : null,
    (s.groups || []).map((g) => h("div", { class: "qgroup" }, g.name ? h("h3", null, g.name) : null, h("ol", null, (g.questions || []).map((q) => h("li", null, q))))),
    s.url ? h("div", { class: "row-actions", style: { marginTop: "8px" } }, linkBtn(s.url, s.linkText || "Open the file")) : null,
    h("div", { class: "row-actions" }, doneBtn(c, s.button || "I have read the questions")));
}

function read(c) {
  const s = c.step;
  return h("div", null,
    s.intro ? h("p", { class: "muted" }, s.intro) : null,
    h("div", { class: "model-text hwtext" }, (s.paragraphs || []).map((p) => h("p", null, ...withHighlights(p, s.highlights)))),
    s.highlights?.length ? h("p", { class: "tiny faint" }, "The highlighted phrases are the ones to take into your own answer.") : null,
    s.url ? h("div", { class: "row-actions", style: { marginBottom: "8px" } }, linkBtn(s.url, s.linkText || "Open the file")) : null,
    h("div", { class: "row-actions" }, doneBtn(c, s.button || "I have read it")));
}

function words(c) {
  const s = c.step, cards = s.cards || [];
  const msg = h("div", { class: "small muted", "aria-live": "polite" });
  return h("div", null,
    s.intro ? h("p", { class: "muted" }, s.intro) : null,
    h("ul", { class: "rows" }, cards.map((k) => h("li", null, h("div", { class: "row", style: { alignItems: "flex-start", minHeight: "48px" } },
      h("div", { class: "grow" }, h("div", { class: "title" }, k.front || k.term), h("div", { class: "sub", style: { whiteSpace: "pre-line" } }, k.back || [k.meaning, k.example ? "Example: " + k.example : ""].filter(Boolean).join("\n"))))))),
    h("div", { class: "row-actions", style: { marginTop: "12px" } },
      h("button", { class: "btn primary", onclick: async (e) => { e.currentTarget.disabled = true; await hw.addWords(c.date, s, c.task); msg.textContent = `${cards.length} cards added to your deck "${s.deck || s.title}".`; await finishStep(c); } }, icon("review", 18), `Add ${cards.length} words to my cards`)),
    msg);
}

function watch(c) {
  const s = c.step;
  return h("div", null,
    s.text ? h("p", null, s.text) : null,
    h("div", { class: "row-actions" },
      s.url ? linkBtn(s.url, `Open the video${s.minutes ? ` (${s.minutes} min)` : ""}`, "video") : null,
      doneBtn(c, s.button || "I watched it")));
}

function check(c) {
  return h("div", null, c.step.text ? h("p", null, c.step.text) : null, h("div", { class: "row-actions" }, doneBtn(c, c.step.button || "Done")));
}

function text(c) {
  return h("div", null, c.step.text ? h("p", null, c.step.text) : null, c.step.url ? linkBtn(c.step.url, c.step.linkText || "Open") : null, h("div", { class: "row-actions", style: { marginTop: "8px" } }, doneBtn(c, c.step.button || "Got it")));
}

function photos(c) {
  const s = c.step, key = `${c.date}:${s.id}`, files = mem(key + ":files", () => []);
  const grid = h("div", { class: "thumbs" }), msg = h("div", { class: "small muted", "aria-live": "polite", style: { marginTop: "6px" } });
  const send = h("button", { class: "btn primary", disabled: true, onclick: build }, icon("upload", 18), "Make the PDF and send it");
  const draw = () => {
    grid.replaceChildren(...files.map((f, i) => h("div", { class: "thumb" }, h("img", { src: f.url || (f.url = URL.createObjectURL(f.file)), alt: `Page ${i + 1}` }), h("button", { class: "x", "aria-label": `Remove page ${i + 1}`, onclick: () => { files.splice(i, 1); draw(); } }, icon("close", 16)))));
    send.disabled = !files.length; send.lastChild.textContent = files.length ? `Make the PDF (${files.length} ${files.length === 1 ? "page" : "pages"}) and send it` : "Make the PDF and send it";
  };
  const input = h("input", { type: "file", accept: "image/*", multiple: true, class: "sr", id: "ph-" + s.id, onchange: (e) => { for (const f of e.target.files) files.push({ file: f }); e.target.value = ""; draw(); } });
  async function build() {
    send.disabled = true; msg.textContent = "Making the PDF…";
    try {
      const parts = await imagesToPdf(files.map((f) => f.file)), base = `${c.date}_${slug(s.label || s.title)}`;
      msg.textContent = "Sending…";
      const r = await hw.sendFiles({ date: c.date, label: s.label || s.title, files: parts.map((blob, i) => ({ blob, name: parts.length > 1 ? `${base}_part${i + 1}.pdf` : `${base}.pdf` })) });
      MEM.delete(key + ":files");
      await finishStep(c, { pages: files.length, sent: r });
    } catch (e) { console.error(e); msg.textContent = "That did not work. Check the photos and try again."; send.disabled = false; }
  }
  draw();
  return h("div", null, s.prompt ? h("p", null, s.prompt) : null,
    h("div", { class: "row-actions" }, input, h("label", { class: "btn", for: "ph-" + s.id }, icon("plus", 18), files.length ? "Add more pages" : "Take or choose photos")),
    grid, h("div", { class: "row-actions", style: { marginTop: "10px" } }, send), msg);
}

function pickMime() { for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) if (window.MediaRecorder?.isTypeSupported?.(m)) return m; return ""; }
const extOf = (type) => (/mp4/.test(type) ? "m4a" : /ogg/.test(type) ? "ogg" : "webm");

function record(c) {
  const s = c.step, key = `${c.date}:${s.id}`, qs = s.questions || [], takes = mem(key + ":takes", () => Array(qs.length).fill(null));
  const max = s.max || 120; let rec = null, stream = null, timer = null, current = -1;
  const rows = h("div"), msg = h("div", { class: "small muted", "aria-live": "polite", style: { marginTop: "6px" } });
  const send = h("button", { class: "btn primary", disabled: true, onclick: sendAll }, icon("upload", 18), "Send my recordings");
  function refresh() {
    const n = takes.filter(Boolean).length;
    send.disabled = n < qs.length || current >= 0; send.lastChild.textContent = n < qs.length ? `Record all ${qs.length} to send (${n} done)` : "Send my recordings";
  }
  async function start(i, btn) {
    if (current >= 0) return;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } }); }
    catch { toast("The microphone is blocked. Allow it in your browser settings."); return; }
    const mime = pickMime(); let parts = [];
    try { rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 40000 } : { audioBitsPerSecond: 40000 }); } catch { rec = new MediaRecorder(stream); }
    rec.ondataavailable = (e) => e.data.size && parts.push(e.data);
    rec.onstop = () => { stream.getTracks().forEach((t) => t.stop()); clearInterval(timer); takes[i] = new Blob(parts, { type: rec.mimeType || mime || "audio/webm" }); current = -1; store.S.busy = Math.max(0, (store.S.busy || 1) - 1); draw(); };
    current = i; store.S.busy = (store.S.busy || 0) + 1; rec.start(1000);
    let t = 0; timer = setInterval(() => { t++; btn.textContent = `Stop (${mmss(t)})`; if (t >= max) stop(); }, 1000); btn.textContent = "Stop (0:00)"; btn.classList.add("rec");
  }
  function stop() { if (rec && rec.state !== "inactive") rec.stop(); }
  function draw() {
    rows.replaceChildren(...qs.map((q, i) => {
      const btn = h("button", { class: "btn small", onclick: () => (current === i ? stop() : start(i, btn)), disabled: current >= 0 && current !== i }, takes[i] ? "Record again" : "Record");
      return h("div", { class: "attempt", style: { alignItems: "flex-start" } }, h("div", { class: "grow", style: { flex: "1 1 220px" } }, h("b", { class: "num" }, `${i + 1}. `), q),
        takes[i] ? h("audio", { controls: true, src: takes[i].url ||= URL.createObjectURL(takes[i]) }) : null, btn);
    }));
    refresh();
  }
  async function sendAll() {
    send.disabled = true; msg.textContent = "Sending…";
    const files = takes.map((b, i) => ({ blob: b, name: `${c.date}_${slug(s.label || s.title)}_Q${i + 1}.${extOf(b.type)}` }));
    const r = await hw.sendFiles({ date: c.date, label: s.label || s.title, files });
    MEM.delete(key + ":takes"); await finishStep(c, { recordings: files.length, sent: r });
  }
  draw();
  return h("div", null, s.prompt ? h("p", null, s.prompt) : null, rows, h("div", { class: "row-actions", style: { marginTop: "10px" } }, send), msg);
}

const BODIES = { questions, read, words, watch, check, text, photos, record, link: text };
export const STEP_LABEL = { questions: "Questions", read: "Read", words: "New words", watch: "Watch", check: "Check", text: "Note", photos: "Photos", record: "Record", link: "Link" };

// c = { date, hw, task, step, advance }
export function stepBody(c) { return (BODIES[c.step.type] || text)(c); }
