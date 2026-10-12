// Speaking studio: Part 1 round, Part 2 cue card (60 s prep, 120 s talk), Part 3 chain, full mock. Records in the browser.
import { h, icon, uid, todayISO, mmss, fmtShort, reducedMotion } from "../util.js";
import * as store from "../store.js";
import * as db from "../db.js";
import { head, ring, makeTimer, chime, toast } from "../ui.js";

export const live = false;

// ---- recording: pick a format this browser can make (Safari makes mp4, Chrome and Edge make webm) ----
function pickMime() {
  const opts = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  for (const m of opts) if (window.MediaRecorder?.isTypeSupported?.(m)) return m;
  return "";
}

export default async function (ctx) {
  const S = store.S, q = ctx.query, bank = S.bank;
  const mode = q.mode || "choose";
  const from = q.from || ""; const taskKey = q.task || "";
  const back = q.session ? "#/session" : taskKey ? "#/today" : "#/practice";
  const root = h("div");

  // ----- build the steps for each mode -----
  const courseQs = (kind, words) => Object.entries(S.pack?.[kind] || {}).filter(([k]) => words.some((w) => k.includes(w))).flatMap(([, v]) => v);
  const part1For = (date) => {
    const d = store.dayByDate(date);
    const w = d?.agenda?.find((a) => /warm-up/i.test(a.title))?.text || "";
    const topics = (w.match(/Part 1:\s*([^.]+)/i)?.[1] || "").split(/,| and /).map((x) => x.trim().toLowerCase()).filter(Boolean);
    const keys = topics.length ? topics : ["work", "mornings", "hometown", "free time"];
    const own = keys.flatMap((k) => bank.part1[k] || []);
    return [...courseQs("part1", keys).slice(0, 3), ...own].slice(0, 8);
  };
  const part3Qs = (themes, n = 5) => {
    const words = themes.flatMap((t) => (bank.labels[t] || t).toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3));
    return [...courseQs("part3", words).slice(0, 3), ...themes.flatMap((t) => bank.part3[t] || [])].slice(0, n);
  };
  const info = bank.days[from] || {};
  const cardById = (id) => bank.cards[id] || courseCards().find((c) => c.id === id);
  function courseCards() { return (S.pack?.cueCards || []).map((c) => ({ ...c, say: ["what it is, or who it is", "when and where", "what happened, or what it is like", "and explain why it matters to you"] })); }

  const steps = [];
  const unit = q.unit ? store.unitById(q.unit) : null;
  if (mode === "part1") for (const qn of (unit?.questions?.length ? unit.questions : part1For(from)).slice(0, 8)) steps.push({ part: 1, text: qn, speak: 30 });
  else if (mode === "part3") for (const qn of (unit?.questions?.length ? unit.questions : part3Qs([q.theme || info.part3?.[0] || "work"], 6)).slice(0, 8)) steps.push({ part: 3, text: qn, speak: 60 });
  else if (mode === "part2") { const c = cardById(q.card) || bank.cards[info.cards?.[0]] || Object.values(bank.cards)[0]; steps.push({ part: 2, card: c, prep: 60, speak: 120 }); }
  else if (mode === "mock") {
    const d = store.dayByDate(from) || store.dayByDate(todayISO()); const l1 = d?.questions;
    const cardId = (bank.days[d?.date]?.cards || [])[0]; const c = bank.cards[cardId] || Object.values(bank.cards)[0];
    const p1 = l1 ? l1.part1.split(" · ").flatMap((g) => g.replace(/^[^:]+:\s*/, "").split(/(?<=\?)\s+/).slice(0, 2)) : [];
    for (const qn of (p1.length ? p1 : part1For(d?.date).slice(0, 4))) steps.push({ part: 1, text: qn, speak: 30 });
    steps.push({ part: 2, card: c, prep: 60, speak: 120 });
    const p3 = l1 ? l1.part3.split(/(?<=\?)\s+/).slice(0, 4) : part3Qs(bank.days[d?.date]?.part3 || ["work"], 4);
    for (const qn of p3) steps.push({ part: 3, text: qn, speak: 60 });
  } else if (taskKey) {
    // opened from a task: choose the mode from the task text
    const t = findTask(taskKey); const txt = (t?.text || "").toLowerCase(); const d = store.dayByDate(from) || store.dayByDate(taskKey.slice(0, 10));
    const di = bank.days[d?.date] || {};
    if (/part 2|card/.test(txt) && (di.cards || []).length) { location.hash = `#/speak?mode=part2&card=${di.cards[0]}&from=${d.date}&task=${encodeURIComponent(taskKey)}${q.session ? "&session=1" : ""}`; return h("div"); }
    if (/part 3|answer/.test(txt)) { location.hash = `#/speak?mode=part3&theme=${(di.part3 || ["work"])[0]}&from=${d?.date || ""}&task=${encodeURIComponent(taskKey)}${q.session ? "&session=1" : ""}`; return h("div"); }
    location.hash = `#/speak?mode=part1&from=${d?.date || ""}&task=${encodeURIComponent(taskKey)}${q.session ? "&session=1" : ""}`; return h("div");
  }

  if (!steps.length) return chooser(back, from);

  let i = 0;
  const stage = h("div"); root.append(stage);
  const meta = { taskKey, lessonNo: q.lesson ? Number(q.lesson) : null, mode, from };

  function showStep() {
    const st = steps[i];
    stage.replaceChildren(head(titleOf(mode), { back, sub: `${i + 1} of ${steps.length}` }),
      h("div", { class: "progressline" }, h("i", { style: { width: `${(i / steps.length) * 100}%` } })), stepUI(st));
  }

  function stepUI(st) {
    const box = h("div");
    const attempts = []; // { blob, url, seconds }
    const attemptsEl = h("div", { "aria-live": "polite" });
    let mediaRecorder = null, stream = null, chunks = [], recStart = 0, speakTimer = null, raf = 0, analyser = null, ac = null;
    const canvas = h("canvas", { class: "wave", width: 600, height: 96, role: "img", "aria-label": "Live sound level" });
    const recBtn = h("button", { class: "recbtn", "aria-label": "Start recording" }, icon("mic", 34));
    const status = h("div", { class: "kicker", style: { textAlign: "center", margin: "6px 0" }, "aria-live": "polite" }, "Press the microphone when you are ready.");
    const r = ring(st.speak, st.part === 2 ? "Speaking" : "Answer", { small: true });
    const notes = h("textarea", { rows: 4, placeholder: "Five keywords, one minute. Not sentences.", spellcheck: false, "aria-label": "Notes for your talk" });
    const nextBtn = h("button", { class: "btn primary", onclick: nextStep }, i === steps.length - 1 ? "Finish" : "Next question");

    function drawWave() {
      if (!analyser) return;
      const c = canvas.getContext("2d"), w = canvas.width, hgt = canvas.height, data = new Uint8Array(analyser.fftSize);
      const style = getComputedStyle(document.documentElement);
      const loop = () => {
        analyser.getByteTimeDomainData(data);
        c.clearRect(0, 0, w, hgt); c.lineWidth = 2; c.strokeStyle = style.getPropertyValue("--accent").trim() || "#1E3FA8"; c.beginPath();
        for (let x = 0; x < w; x++) { const v = data[Math.floor((x / w) * data.length)] / 128 - 1; const y = hgt / 2 + v * (hgt / 2) * 0.9; x ? c.lineTo(x, y) : c.moveTo(x, y); }
        c.stroke(); raf = requestAnimationFrame(loop);
      };
      loop();
    }

    async function startRec() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      } catch (e) {
        status.textContent = "The microphone is blocked. Allow it in your browser settings, then try again."; toast("Microphone not available."); return;
      }
      const mime = pickMime();
      try { mediaRecorder = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 48000 } : { audioBitsPerSecond: 48000 }); }
      catch { mediaRecorder = new MediaRecorder(stream); }
      chunks = []; mediaRecorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      mediaRecorder.onstop = onStopped;
      ac = new (window.AudioContext || window.webkitAudioContext)(); const srcNode = ac.createMediaStreamSource(stream);
      analyser = ac.createAnalyser(); analyser.fftSize = 1024; srcNode.connect(analyser); if (!reducedMotion()) drawWave();
      mediaRecorder.start(1000); recStart = Date.now();
      recBtn.classList.add("rec"); recBtn.setAttribute("aria-label", "Stop recording"); recBtn.replaceChildren(icon("stop", 30));
      status.textContent = "Recording";
      speakTimer = makeTimer(st.speak, { onTick: (s) => r.set(s, st.speak), onEnd: () => { chime(); stopRec(); } }); speakTimer.start();
    }
    function stopRec() {
      speakTimer?.destroy(); cancelAnimationFrame(raf);
      if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
      stream?.getTracks().forEach((t) => t.stop()); ac?.close?.().catch?.(() => {});
      recBtn.classList.remove("rec"); recBtn.setAttribute("aria-label", "Record again"); recBtn.replaceChildren(icon("mic", 34));
    }
    async function onStopped() {
      const seconds = Math.max(1, Math.round((Date.now() - recStart) / 1000));
      const blob = new Blob(chunks, { type: mediaRecorder.mimeType || pickMime() || "audio/webm" });
      const a = { id: uid(), blob, url: URL.createObjectURL(blob), seconds, best: attempts.length === 0 };
      attempts.push(a);
      status.textContent = "Listen back. Keep the best attempt."; renderAttempts();
    }
    function renderAttempts() {
      attemptsEl.replaceChildren(...attempts.map((a, n) => h("div", { class: "attempt" },
        h("b", null, `Attempt ${n + 1}`), h("span", { class: "faint num" }, mmss(a.seconds)),
        h("audio", { controls: true, src: a.url, preload: "metadata" }),
        h("button", { class: "btn small" + (a.best ? " primary" : ""), "aria-pressed": String(a.best), onclick: () => { attempts.forEach((x) => (x.best = x === a)); renderAttempts(); } }, a.best ? "Keeping this one" : "Keep this one"))));
    }
    recBtn.onclick = () => { if (mediaRecorder && mediaRecorder.state === "recording") stopRec(); else { r.set(st.speak, st.speak); startRec(); } };

    async function nextStep() {
      const keep = attempts.find((a) => a.best);
      if (!keep) { toast("Record an answer first, or skip."); return; }
      stopRec();
      const rec = { id: uid(), createdAt: new Date().toISOString(), date: todayISO(), part: st.part, prompt: st.card ? st.card.title : st.text, seconds: keep.seconds, attempts: attempts.length, blob: keep.blob, mime: keep.blob.type,
        taskKey: meta.taskKey, lessonNo: meta.lessonNo, mode: meta.mode, notes: notes.value || "" };
      await db.put("recordings", rec);
      await store.addStudy(Math.max(1, Math.round(keep.seconds / 60)), "speaking");
      if (meta.taskKey) await store.markDone(meta.taskKey, { recordingId: rec.id });
      if (i < steps.length - 1) { i++; showStep(); }
      else { toast("Recording saved."); location.hash = q.session ? "#/session" : (meta.lessonNo ? `#/lesson/${meta.lessonNo}` : "#/practice"); }
    }

    // prep for Part 2
    if (st.part === 2) {
      const c = st.card;
      const prepRing = ring(st.prep, "Preparation", { small: true });
      const prepBtn = h("button", { class: "btn primary" }, icon("play", 18), "Start 1 minute of preparation");
      let pt = null;
      const prepBox = h("div", { style: { textAlign: "center" } }, prepRing.el, h("div", { class: "row-actions", style: { justifyContent: "center" } }, prepBtn));
      prepBtn.onclick = () => { if (pt) { pt.destroy(); pt = null; prepRing.set(st.prep, st.prep); prepBtn.replaceChildren(icon("play", 18), "Start 1 minute of preparation"); return; }
        pt = makeTimer(st.prep, { onTick: (s) => prepRing.set(s, st.prep), onEnd: () => { chime(); toast("Preparation is over. Start speaking."); } }); pt.start(); prepBtn.replaceChildren("Reset"); };
      box.append(h("div", { class: "cue" }, h("h2", null, c.title), h("div", { class: "small muted" }, "You should say:"), h("ul", null, c.say.map((x) => h("li", null, x)))),
        h("div", { class: "field", style: { marginTop: "12px" } }, h("label", null, "Notes"), notes), prepBox,
        h("details", { class: "quiet-box" }, h("summary", { style: { cursor: "pointer", fontWeight: 600 } }, "A simple arc to follow"), h("p", { class: "small", style: { marginTop: "6px" } }, "Setting, what happened, one vivid detail, how it changed you.")));
    } else {
      box.append(h("div", { class: "lead", style: { textAlign: "center", margin: "20px 8px", fontFamily: "var(--f-display)", fontWeight: 600, fontSize: "24px", lineHeight: 1.25 } }, st.text));
      if (st.part === 3) box.append(h("p", { class: "small muted", style: { textAlign: "center" } }, "Direct answer, reason, example, then a contrast or concession."));
    }
    box.append(canvas, r.el, h("div", { style: { display: "grid", placeItems: "center", margin: "6px 0" } }, recBtn), status, attemptsEl,
      h("div", { class: "row-actions", style: { justifyContent: "center", marginTop: "16px" } }, nextBtn, steps.length > 1 && i < steps.length - 1 ? h("button", { class: "btn quiet", onclick: () => { stopRec(); i++; showStep(); } }, "Skip") : null));
    return box;
  }

  ctx.onLeave(() => {});
  showStep();
  return root;
}

function titleOf(mode) { return { part1: "Part 1", part2: "Part 2", part3: "Part 3", mock: "Speaking mock" }[mode] || "Speaking"; }
function findTask(key) { for (const d of store.S.plan.days) for (const t of [...d.tasks, ...d.homework]) if (t.key === key) return t; return null; }

// ---- chooser ----
function chooser(back, from) {
  const S = store.S, bank = S.bank, today = todayISO();
  const date = store.dayByDate(today) ? today : S.plan.start;
  const info = bank.days[date] || {};
  const root = h("div");
  root.append(head("Speaking", { back, sub: "Record, listen back, keep the best" }));
  root.append(h("section", { class: "section" }, h("div", { class: "shead" }, h("h2", null, "Modes")),
    h("ul", { class: "rows" },
      row("Part 1 round", "Six short answers, 30 seconds each", `#/speak?mode=part1&from=${date}`),
      row("Part 2 cue card", "One minute to prepare, up to two minutes to talk", `#/speak?mode=part2&card=${(info.cards || Object.keys(bank.cards))[0]}&from=${date}`),
      row("Part 3 questions", `Theme: ${bank.labels[(info.part3 || ["work"])[0]]}`, `#/speak?mode=part3&theme=${(info.part3 || ["work"])[0]}&from=${date}`),
      row("Full speaking mock", "Parts 1, 2 and 3 in exam order, about 12 minutes", `#/speak?mode=mock&from=${date}`))));
  root.append(h("section", { class: "section" }, h("div", { class: "shead" }, h("h2", null, "Cue cards")),
    h("ul", { class: "rows" }, Object.entries(bank.cards).map(([id, c]) => h("li", null, h("a", { class: "row", href: `#/speak?mode=part2&card=${id}&from=${date}` }, h("div", { class: "grow" }, h("div", { class: "title small" }, c.title), h("div", { class: "sub" }, c.cat)), icon("chevron", 18)))))));
  const cc = (S.pack?.cueCards || []);
  if (cc.length) root.append(h("section", { class: "section" }, h("div", { class: "shead" }, h("h2", null, "Cue cards from the course")),
    h("ul", { class: "rows" }, cc.map((c) => h("li", null, h("a", { class: "row", href: `#/speak?mode=part2&card=${c.id}&from=${date}` }, h("div", { class: "grow" }, h("div", { class: "title small" }, c.title), h("div", { class: "sub" }, c.source)), icon("chevron", 18)))))));
  root.append(recordingsList());
  return root;
  function row(t, s, href) { return h("li", null, h("a", { class: "row", href }, h("div", { class: "grow" }, h("div", { class: "title" }, t), h("div", { class: "sub" }, s)), icon("mic", 20))); }
}

// the recordings she has kept, with playback
function recordingsList() {
  const box = h("section", { class: "section" }, h("div", { class: "shead" }, h("h2", null, "Your recordings")));
  db.all("recordings").then((rows) => {
    rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (!rows.length) { box.append(h("p", { class: "muted" }, "Nothing yet. Your first recording will be here.")); return; }
    box.append(h("ul", { class: "rows" }, rows.slice(0, 30).map((r) => h("li", null, h("div", { class: "row", style: { flexWrap: "wrap" } },
      h("div", { class: "grow" }, h("div", { class: "title small" }, r.prompt), h("div", { class: "sub" }, `${fmtShort(r.date)}, Part ${r.part}, ${mmss(r.seconds)}${r.lessonNo ? ", Lesson " + r.lessonNo : ""}`)),
      h("audio", { controls: true, preload: "none", src: URL.createObjectURL(r.blob), style: { height: "40px", maxWidth: "100%" } }),
      h("button", { class: "btn small quiet danger", "aria-label": "Delete recording", onclick: async () => { await db.del("recordings", r.id); location.reload(); } }, icon("trash", 18)))))));
  });
  return box;
}
