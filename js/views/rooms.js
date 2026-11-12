// Two homework steps that open a room of their own:
//   speaking  topics, then one question at a time: record, send, then the model answer with the book's highlights;
//             a highlighted phrase taps into the Speaking deck.
//   reading   a Part 3 passage and its questions, split like the computer test; highlight, or keep a word in the Reading deck;
//             check the answers at the end.
// Every recording is sent the moment she presses Send. Offline, it waits in the outbox and goes when she is back online.
import { h, icon, mmss } from "../util.js";
import * as store from "../store.js";
import * as hw from "../homework.js";
import { toast, sheet } from "../ui.js";
import * as db from "../db.js";
import { treat } from "./treat.js";
import * as nudge from "../nudge.js";
import { orb } from "./orb.js";

const DECKS = {
  speaking: { id: "deck-speaking", name: "Speaking phrases", note: "Phrases you kept from model answers." },
  reading: { id: "deck-reading", name: "Reading words", note: "Words you caught in reading passages." },
};
async function keep(kind, front, back) {
  const d = DECKS[kind];
  if (!store.deckById(d.id)) await store.saveDeck({ id: d.id, name: d.name, kind: "mine", note: d.note, createdAt: new Date().toISOString() });
  const key = front.trim().toLowerCase(), have = store.S.cards.find((c) => c.deck === d.id && c.front.trim().toLowerCase() === key);
  if (have) return { card: have, added: false };
  const card = await store.addCard({ deck: d.id, front: front.trim(), back, tag: kind });
  store.changed(); return { card, added: true };
}
async function unkeep(kind, front) {
  const d = DECKS[kind], key = front.trim().toLowerCase(), c = store.S.cards.find((x) => x.deck === d.id && x.front.trim().toLowerCase() === key);
  if (c) await store.removeCard(c.id);
}
const kept = (kind, front) => store.S.cards.some((c) => c.deck === DECKS[kind].id && c.front.trim().toLowerCase() === front.trim().toLowerCase());
const slug = (s) => String(s || "x").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);
const sentenceAround = (text, at) => { const s = text.lastIndexOf(".", at) + 1, e = text.indexOf(".", at); return text.slice(s, e < 0 ? undefined : e + 1).replace(/==/g, "").trim(); };

// a full-screen room that slides up over the app
function room(title, sub, onClose, beforeClose) {
  const body = h("div", { class: "room-body" });
  const el = h("div", { class: "room", role: "dialog", "aria-modal": "true", "aria-label": title },
    h("header", { class: "room-top" },
      h("button", { class: "iconbtn", "aria-label": "Close", onclick: () => (beforeClose ? beforeClose(close) : close()) }, icon("close", 22)),
      h("div", { class: "grow" }, h("div", { class: "room-k" }, sub || ""), h("div", { class: "room-t" }, title))),
    body);
  const close = () => { el.classList.add("out"); setTimeout(() => { el.remove(); document.body.classList.remove("roomed"); onClose?.(); }, 260); };
  document.body.append(el); document.body.classList.add("roomed");
  return { el, body, close, setTitle(t, s) { el.querySelector(".room-t").textContent = t; el.querySelector(".room-k").textContent = s || ""; } };
}

/* ============================================================ speaking */
const qkey = (ti, qi) => `t${ti}q${qi}`;
const sentOf = (c) => hw.stateOf(c.date).steps[c.step.id]?.sent || {};

export function speaking(c) {
  const s = c.step, topics = s.topics || [];
  const wrap = h("div", { class: "sp" });
  const draw = () => {
    const sent = sentOf(c);
    wrap.replaceChildren(
      h("div", { class: "sp-grid" }, topics.map((t, ti) => {
        const n = t.questions.filter((_, qi) => sent[qkey(ti, qi)]).length, all = t.questions.length;
        return h("button", { class: "sp-topic" + (n === all ? " full" : ""), "aria-label": `${t.name}, ${n} of ${all} sent`, onclick: () => openSpeaking(c, ti, draw) },
          h("span", { class: "sp-num num" }, t.num || String(ti + 1), n === all ? icon("check", 16) : null),
          h("span", { class: "sp-name" }, t.name),
          h("span", { class: "sp-dots-row", "aria-hidden": "true" }, t.questions.map((_, qi) => h("i", { class: sent[qkey(ti, qi)] ? "on" : "" }))));
      })));
  };
  draw();
  return wrap;
}

function openSpeaking(c, ti0, redraw) {
  const s = c.step, topics = s.topics;
  let ti = ti0, qi = Math.max(0, topics[ti].questions.findIndex((_, i) => !sentOf(c)[qkey(ti, i)]));
  const O = orb();
  let spoke = false; const opened = Date.now(); nudge.track("room", "speaking");
  const R = room(topics[ti].name, "Speaking, Part 1", () => { stopAll(); O.destroy(); redraw(); if (!spoke && Date.now() - opened < 4 * 60000) { nudge.track("mute"); setTimeout(() => nudge.maybeAsk(), 700); } nudge.sync(true); }, (close) => guard(close));
  let rec = null, stream = null, timer = null, take = null, secs = 0, showModel = false, ans = 0;

  // an answer that is recorded but not sent is kept on the phone until it is sent or thrown away
  const draftKey = () => `draft:${c.date}:${s.id}:${qkey(ti, qi)}`;
  const saveDraft = () => db.put("media", { key: draftKey(), blob: take, secs, at: new Date().toISOString(), q: topics[ti].questions[qi].q, topic: ti, n: qi }).catch(() => {});
  const dropDraft = (k = draftKey()) => db.del("media", k).catch(() => {});
  async function loadDraft() {
    const k = draftKey(), d = await db.get("media", k).catch(() => null);
    if (!d?.blob || k !== draftKey() || take || rec) return;
    take = d.blob; take.url = URL.createObjectURL(take); secs = d.secs || 0; showModel = false; draw();
  }
  // leaving with an unsent answer: say so, offer to send it
  function guard(then) {
    if (!take || rec) return then();
    sheet((close) => h("div", null,
      h("h2", null, "Not sent yet"),
      h("p", { class: "muted", style: { marginTop: "8px" } }, "Your teacher hasn't got this answer. It stays here until you send it."),
      h("div", { class: "row-actions", style: { marginTop: "16px", justifyContent: "flex-end" } },
        h("button", { class: "btn", onclick: () => { close(); take = null; then(); } }, "Later"),
        h("button", { class: "btn primary", onclick: async (e) => { close(); await send(null); then(); } }, "Send it"))));
  }

  function stopAll() { try { if (rec && rec.state !== "inactive") rec.stop(); } catch {} stream?.getTracks().forEach((t) => t.stop()); clearInterval(timer); O.quiet(); }
  const pickMime = () => { for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) if (window.MediaRecorder?.isTypeSupported?.(m)) return m; return ""; };
  const extOf = (t) => (/mp4/.test(t) ? "m4a" : /ogg/.test(t) ? "ogg" : "webm");

  async function start() {
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } }); }
    catch { toast("The microphone is blocked. Allow it in your browser settings."); return; }
    const mime = pickMime(), parts = [];
    try { rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 40000 } : { audioBitsPerSecond: 40000 }); } catch { rec = new MediaRecorder(stream); }
    rec.ondataavailable = (e) => e.data.size && parts.push(e.data);
    rec.onstop = () => { O.quiet(); stream.getTracks().forEach((t) => t.stop()); clearInterval(timer); take = new Blob(parts, { type: rec.mimeType || mime || "audio/webm" }); take.url = URL.createObjectURL(take); rec = null; store.S.busy = Math.max(0, (store.S.busy || 1) - 1); saveDraft(); draw(); };
    store.S.busy = (store.S.busy || 0) + 1; rec.start(1000); secs = 0; O.listen(stream); spoke = true; nudge.track("rec");
    timer = setInterval(() => { secs++; const t = R.el.querySelector(".mic-t"); if (t) t.textContent = mmss(secs); if (secs >= (s.max || 120)) rec?.stop(); }, 1000);
    draw();
  }
  async function send(btn) {
    if (btn) { btn.disabled = true; btn.lastChild.textContent = "Sending…"; }
    const t = topics[ti], q = t.questions[qi], k = draftKey();
    const r = await hw.sendFiles({ date: c.date, label: `Speaking · ${t.name} · Q${qi + 1}`, note: q.q, files: [{ blob: take, name: `${c.date}_${slug(t.name)}_Q${qi + 1}.${extOf(take.type)}` }] });
    const st = hw.stateOf(c.date).steps[s.id] || {};
    const sent = { ...sentOf(c), [qkey(ti, qi)]: new Date().toISOString() }, took = { ...(st.secs || {}), [qkey(ti, qi)]: secs };
    await hw.setStep(c.date, s.id, { sent, secs: took });
    dropDraft(k); nudge.track("sent", qkey(ti, qi));
    const total = topics.reduce((n, x) => n + x.questions.length, 0);
    const finished = Object.keys(sent).length >= total && !hw.stepDone(c.date, s.id);
    if (finished) { await hw.setStep(c.date, s.id, { done: true, doneAt: new Date().toISOString() }); await hw.noteCompletion(c.date, c.hw); }
    toast(r === "sent" ? "Sent to your teacher." : "Saved. It sends when you're back online.");
    take = null; showModel = true; ans = 0; draw();
    if (finished) setTimeout(() => celebrate(total, took), 900);
    else setTimeout(() => nudge.offer(), 2500);
  }
  // the last answer: the treat, with what she actually did
  function celebrate(total, took) {
    const mins = Math.round(Object.values(took).reduce((a, b) => a + (b || 0), 0) / 60);
    const phrases = store.S.cards.filter((x) => x.deck === DECKS.speaking.id).length;
    treat({ line: `Part 1. All ${total}.`, sub: [mins ? `${mins} minutes of you, in English` : "", phrases ? `${phrases} phrases kept` : ""].filter(Boolean).join(" · ") });
  }
  function go(d) {
    if (take && !rec) return guard(() => go(d));
    stopAll(); take = null; showModel = false; ans = 0;
    qi += d;
    if (qi >= topics[ti].questions.length) { if (ti < topics.length - 1) { ti++; qi = 0; } else { qi = topics[ti].questions.length - 1; } }
    if (qi < 0) { if (ti > 0) { ti--; qi = topics[ti].questions.length - 1; } else qi = 0; }
    R.setTitle(topics[ti].name, "Speaking, Part 1"); draw(d); loadDraft();
  }

  function modelView(q) {
    const answers = q.answers || [];
    if (!answers.length) return null;
    const a = answers[Math.min(ans, answers.length - 1)], text = a.text;
    const p = h("p", { class: "sp-answer" }); let last = 0; const rx = /==(.+?)==/g; let m; const phrases = [];
    while ((m = rx.exec(text))) {
      p.append(text.slice(last, m.index).replace(/==/g, ""));
      const phrase = m[1].replace(/[.,;:!]+$/, ""), sentence = sentenceAround(text, m.index);
      phrases.push([phrase, sentence]);
      const mk = h("button", { class: "chunk" + (kept("speaking", phrase) ? " kept" : ""), title: "Keep this phrase", onclick: async () => {
        if (kept("speaking", phrase)) { await unkeep("speaking", phrase); mk.classList.remove("kept"); toast("Taken out of Speaking phrases."); }
        else { await keep("speaking", phrase, sentence); mk.classList.add("kept"); toast(`"${phrase}" is in Speaking phrases.`); }
        upd();
      } }, m[1]);
      p.append(mk); last = m.index + m[0].length;
    }
    p.append(text.slice(last));
    const all = h("button", { class: "btn small" }), upd = () => { const left = phrases.filter(([f]) => !kept("speaking", f)).length; all.textContent = left ? `Keep all ${left}` : "All kept"; all.disabled = !left; };
    all.onclick = async () => { for (const [f, snt] of phrases) await keep("speaking", f, snt); p.querySelectorAll(".chunk").forEach((x) => x.classList.add("kept")); upd(); toast("Kept in Speaking phrases."); };
    upd();
    return h("section", { class: "sp-model" },
      h("div", { class: "sp-model-h" }, h("b", null, "Model answer"),
        answers.length > 1 ? h("span", { class: "seg" }, answers.map((_, i) => h("button", { class: i === ans ? "on" : "", onclick: () => { ans = i; draw(); } }, String(i + 1)))) : null,
        a.written ? h("span", { class: "tiny faint" }, "written for 8.5") : null),
      p,
      phrases.length ? h("div", { class: "sp-keep" }, h("span", { class: "tiny muted grow" }, "Tap a highlighted phrase to keep it in Speaking phrases."), all) : null);
  }

  function draw(dir = 0) {
    const t = topics[ti], q = t.questions[qi], sent = sentOf(c)[qkey(ti, qi)], recording = !!rec;
    const dots = h("div", { class: "sp-dots" }, t.questions.map((_, i) => h("button", { class: (i === qi ? "on " : "") + (sentOf(c)[qkey(ti, i)] ? "sent" : ""), "aria-label": `Question ${i + 1}`, onclick: () => { if (rec) return; const jump = () => { stopAll(); take = null; showModel = false; qi = i; draw(); loadDraft(); }; take ? guard(jump) : jump(); } })));
    const mic = O.el;
    mic.setAttribute("aria-label", recording ? "Stop recording" : take ? "Record again" : "Record your answer");
    mic.onclick = () => (rec ? rec.stop() : start());
    mic.classList.toggle("small", !recording && !!(take || showModel));
    O.icon(icon(recording ? "stop" : "mic", 22));
    const card = h("article", { class: "sp-card" + (dir > 0 ? " in-r" : dir < 0 ? " in-l" : "") },
      h("div", { class: "sp-qk num" }, `Question ${qi + 1} of ${t.questions.length}`),
      h("h2", { class: "sp-q" }, q.q),
      h("div", { class: "sp-rec" },
        mic,
        h("div", { class: "sp-state" },
          recording ? h("span", null, h("b", { class: "mic-t num" }, mmss(secs)), " Recording. Tap the sphere to stop.")
            : take ? h("span", { class: "unsent" }, "Recorded, not sent yet. Press Send.")
            : sent ? h("span", { class: "ok-t" }, icon("check", 16), " Sent. Tap the sphere to record a better one.")
            : h("span", { class: "muted" }, "Tap the sphere and answer as you would in the exam."))),
      take && !recording ? h("div", { class: "sp-take" }, h("audio", { controls: true, src: take.url }),
        h("div", { class: "row-actions" }, h("button", { class: "btn", onclick: () => { take = null; dropDraft(); draw(); } }, "Discard"), h("button", { class: "btn primary send-nudge", onclick: (e) => send(e.currentTarget) }, icon("upload", 18), "Send"))) : null,
      sent && !take && !recording && !showModel && q.answers?.length ? h("button", { class: "btn quiet", onclick: () => { showModel = true; draw(); } }, icon("eye", 18), "See the model answer") : null,
      showModel && !recording ? modelView(q) : null);
    R.body.replaceChildren(
      dots, card,
      h("nav", { class: "sp-nav" },
        h("button", { class: "btn", disabled: (ti === 0 && qi === 0) || recording, onclick: () => go(-1) }, icon("back", 18), "Back"),
        h("button", { class: "btn primary", disabled: recording || (ti === topics.length - 1 && qi === t.questions.length - 1), onclick: () => go(1) }, qi === t.questions.length - 1 && ti < topics.length - 1 ? `Next: ${topics[ti + 1].name}` : "Next", icon("chevron", 18))));
  }
  draw(); loadDraft();
}

/* ============================================================ reading */
export function reading(c) {
  const s = c.step, ps = s.passages || [];
  const res = hw.stateOf(c.date).steps[s.id]?.results || {};
  return h("div", { class: "rd" },
    h("div", { class: "sp-grid rd-grid" }, ps.length
      ? ps.map((p, i) => h("button", { class: "sp-topic" + (res[i] ? " full" : ""), onclick: () => openReading(c, i) },
          h("span", { class: "sp-num num" }, `Passage ${i + 1}`, res[i] ? h("b", null, `${res[i].score}/${res[i].of}`) : null),
          h("span", { class: "sp-name" }, p.title),
          h("span", { class: "sp-foot num" }, `${countQs(p)} questions${p.minutes ? ` · ${p.minutes} min` : ""}`)))
      : [1, 2].map((i) => h("div", { class: "sp-topic ghost" }, h("span", { class: "sp-num num" }, `Passage ${i}`), h("span", { class: "sp-name" }, "Soon")))));
}
const countQs = (p) => (p.groups || []).reduce((n, g) => n + (g.items || []).length, 0);

function openReading(c, pi) {
  const s = c.step, p = s.passages[pi];
  const R = room(p.title, `Reading, passage ${pi + 1}`);
  const answers = {}; let checked = false;
  const passage = h("article", { class: "rd-pass" }, h("h2", null, p.title), (p.paragraphs || []).map((t) => h("p", null, t)));
  const qs = h("section", { class: "rd-qs" });
  const tabs = h("div", { class: "rd-tabs seg" }, h("button", { class: "on", onclick: (e) => tab("pass", e.currentTarget) }, "Passage"), h("button", { onclick: (e) => tab("qs", e.currentTarget) }, "Questions"));
  const split = h("div", { class: "rd-split show-pass" }, passage, qs);
  function tab(which, btn) { split.className = "rd-split show-" + which; tabs.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b === btn)); }

  function drawQs() {
    const key = p.answers || {};
    const groups = (p.groups || []).map((g) => h("div", { class: "rd-g" },
      g.title ? h("h3", null, g.title) : null, g.instructions ? h("p", { class: "muted small" }, g.instructions) : null,
      (g.items || []).map((it) => {
        const right = checked ? String(answers[it.n] || "").trim().toLowerCase() === String(key[it.n] || "").trim().toLowerCase() : null;
        const opts = it.options || g.options;
        return h("div", { class: "rd-q" + (checked ? (right ? " right" : " wrong") : "") },
          h("div", { class: "rd-qrow" }, h("b", { class: "num" }, String(it.n)), h("span", null, it.text)),
          opts ? h("div", { class: "rd-opts" }, opts.map((o) => { const v = typeof o === "string" ? o : o.v, label = typeof o === "string" ? o : `${o.v}  ${o.t}`; return h("button", { class: "opt" + (answers[it.n] === v ? " pick" : ""), disabled: checked, onclick: () => { answers[it.n] = v; drawQs(); } }, label); }))
            : h("input", { value: answers[it.n] || "", disabled: checked, "aria-label": "Answer " + it.n, oninput: (e) => { answers[it.n] = e.target.value; } }),
          checked && !right ? h("div", { class: "rd-key small" }, `Answer: ${key[it.n]}`) : null);
      })));
    const all = (p.groups || []).flatMap((g) => g.items || []);
    const score = all.filter((it) => String(answers[it.n] || "").trim().toLowerCase() === String(key[it.n] || "").trim().toLowerCase()).length;
    qs.replaceChildren(...groups, h("div", { class: "row-actions", style: { margin: "14px 0 40px" } },
      checked ? h("div", { class: "rd-score" }, h("b", { class: "num" }, `${score} of ${all.length}`), " right")
        : h("button", { class: "btn primary", onclick: async () => {
          checked = true; drawQs();
          const res = { ...(hw.stateOf(c.date).steps[s.id]?.results || {}), [pi]: { score, of: all.length, at: new Date().toISOString() } };
          await hw.setStep(c.date, s.id, { results: res });
          hw.sendText(`${hw.studentName() || "Student"} | Reading: ${p.title}: ${score} of ${all.length}`);
          if (Object.keys(res).length >= s.passages.length) { await hw.setStep(c.date, s.id, { done: true, doneAt: new Date().toISOString() }); await hw.noteCompletion(c.date, c.hw); }
        } }, "Check my answers")));
  }
  drawQs();
  R.body.append(tabs, split);

  // select text: highlight it, or keep it
  const bar = h("div", { class: "selbar", hidden: true },
    h("button", { onclick: () => mark() }, "Highlight"),
    h("button", { onclick: () => keepSel() }, icon("plus", 16), "Reading words"));
  R.el.append(bar);
  let range = null;
  const onSel = () => setTimeout(() => {
    const sel = getSelection();
    if (!sel.rangeCount || sel.isCollapsed || !passage.contains(sel.anchorNode)) { bar.hidden = true; return; }
    range = sel.getRangeAt(0); const r = range.getBoundingClientRect();
    bar.style.left = Math.max(8, Math.min(innerWidth - 230, r.left + r.width / 2 - 110)) + "px"; bar.style.top = Math.max(60, r.top - 50) + "px"; bar.hidden = false;
  }, 10);
  passage.addEventListener("mouseup", onSel); passage.addEventListener("touchend", onSel);
  document.addEventListener("selectionchange", () => { if (getSelection().isCollapsed) setTimeout(() => { if (getSelection().isCollapsed) bar.hidden = true; }, 200); });
  function mark() {
    if (!range) return;
    const w = document.createTreeWalker(passage, NodeFilter.SHOW_TEXT), nodes = [];
    while (w.nextNode()) if (range.intersectsNode(w.currentNode)) nodes.push(w.currentNode);
    nodes.forEach((n) => { const a = n === range.startContainer ? range.startOffset : 0, b = n === range.endContainer ? range.endOffset : n.length; if (b <= a) return; const mid = n.splitText(a); mid.splitText(b - a); const m = document.createElement("mark"); m.className = "hl"; mid.parentNode.insertBefore(m, mid); m.append(mid); });
    getSelection().removeAllRanges(); bar.hidden = true;
  }
  async function keepSel() {
    if (!range) return;
    const word = range.toString().trim().replace(/\s+/g, " ");
    if (!word || word.length > 80) { toast("Select a word or a short phrase."); return; }
    const para = range.startContainer.parentElement.closest("p")?.textContent || "", at = para.indexOf(word);
    const r = await keep("reading", word, sentenceAround(para, Math.max(0, at)));
    mark(); toast(r.added ? `"${word}" is in Reading words.` : "Already in Reading words.");
  }
  passage.addEventListener("click", (e) => { const m = e.target.closest("mark.hl"); if (m && getSelection().isCollapsed) m.replaceWith(...m.childNodes); });
}
