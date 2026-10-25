// The exam screen: one section of a mock, laid out like the computer-delivered IELTS. Full screen, a clock, a question palette,
// Review flags, the passage beside the questions, the recording that plays once, the essay editor with its word count,
// the speaking parts recorded one by one. Every time she leaves the screen is counted and shown to her at the end.
import { h, icon, mmss, uid } from "../util.js";
import * as store from "../store.js";
import * as hw from "../homework.js";
import * as M from "../mocks.js";
import { toast, chime } from "../ui.js";
import { RAW } from "../feedkey.js";

export const live = false;
const MIN = { reading: 60, writing: 60 };

export default async function (ctx) {
  const [mockId, section] = ctx.params;
  const root = h("div", { class: "exam" });
  if (!M.SECTIONS.includes(section)) { root.append(leave("That part does not exist.")); return root; }
  let mock;
  try { mock = await M.load(mockId); } catch (e) { root.append(leave(e.message)); return root; }
  const sec = mock[section];
  if (!sec) { root.append(leave(`This mock has no ${M.LABEL[section]} part.`)); return root; }
  const row = M.attempt(mockId, section);
  if (row?.status === "done") { root.append(resultScreen(mock, section, row)); return root; }
  if (row?.status === "in-progress" && (section === "reading" || section === "writing" || section === "listening") && Date.parse(row.deadline) < Date.now()) {
    // the clock ran out while the screen was closed: hand it in as it is
    await finishLR(mock, section, row, { auto: true }); ctx.rerender(); return root;
  }
  if (!row) { root.append(intro(ctx, mock, section)); return root; }
  store.S.busy++; ctx.onLeave(() => { store.S.busy = Math.max(0, store.S.busy - 1); });
  if (section === "speaking") root.append(await speakingExam(ctx, mock, row));
  else root.append(await lrwExam(ctx, mock, section, row));
  return root;
}

const leave = (msg) => h("div", { class: "exam-intro" }, h("p", { class: "lead" }, msg), h("a", { class: "btn", href: "#/mock" }, "Back to Mock"));

// ---------------------------------------------------------------- the first screen
function intro(ctx, mock, section) {
  const name = hw.studentName() || "Candidate";
  const text = {
    listening: ["You will hear the recording once only.", "Put on headphones and check the volume on the next screen.", "Answer as you listen. When the recording ends you have two minutes to check.", "About 30 minutes."],
    reading: ["Three passages, 40 questions, 60 minutes.", "The passage stays on the left, the questions on the right. You can highlight the text.", "There is no extra time to transfer answers.", "The clock starts when you press Start."],
    writing: ["Two tasks, 60 minutes together.", "Task 1: at least 150 words. Task 2: at least 250 words. Task 2 counts twice.", "No spelling help, like the real test.", "Both texts go to your teacher when you finish."],
    speaking: ["Three parts, about 14 minutes, recorded.", "Part 1: short questions. Part 2: one minute to prepare, up to two minutes to talk. Part 3: a discussion.", "Each recording starts by itself after the question appears. Speak as you would to an examiner.", "Your recordings go to your teacher."],
  }[section];
  const box = h("div", { class: "exam-intro" },
    h("div", { class: "ex-brand" }, "IELTS"), h("div", { class: "kicker" }, mock.title || mock.id),
    h("h1", null, M.LABEL[section]),
    h("ul", { class: "ex-rules" }, text.map((t) => h("li", null, t))),
    h("p", { class: "small muted" }, `Candidate: ${name}. Once you start, stay on this screen until the end. Leaving it is noted, the way an invigilator would notice.`),
    h("div", { class: "row-actions" }, h("button", { class: "btn primary", onclick: async (e) => {
      e.currentTarget.disabled = true;
      // full screen where the browser allows it; never wait on it for more than a moment (some browsers neither grant nor refuse)
      try { if (document.documentElement.requestFullscreen && !/iphone|ipad/i.test(navigator.userAgent)) await Promise.race([document.documentElement.requestFullscreen({ navigationUI: "hide" }), new Promise((r) => setTimeout(r, 1500))]); } catch {}
      const minutes = section === "listening" ? 45 : section === "speaking" ? 30 : MIN[section];
      await M.startAttempt(mock.id, section, minutes);
      ctx.rerender();
    } }, "Start"), h("a", { class: "btn quiet", href: "#/mock" }, "Not now")));
  return box;
}

// ---------------------------------------------------------------- shared chrome: clock, watcher, palette
function chrome(ctx, mock, section, row, { onTimeUp, showClock = true } = {}) {
  const name = hw.studentName() || "Candidate";
  const clock = h("span", { class: "ex-clock num", "aria-live": "off" });
  const hideBtn = h("button", { class: "ex-btn", onclick: () => { clock.classList.toggle("hidden"); hideBtn.textContent = clock.classList.contains("hidden") ? "Show" : "Hide"; } }, "Hide");
  const top = h("div", { class: "ex-top" },
    h("div", { class: "ex-left" }, h("span", { class: "ex-brand" }, "IELTS"), h("span", { class: "ex-name" }, name)),
    h("div", { class: "ex-mid" }, showClock ? [icon("timer", 16), clock] : null),
    h("div", { class: "ex-right" }, showClock ? hideBtn : null, h("button", { class: "ex-btn", onclick: () => { try { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); } catch {} } }, "Screen")));
  let warned = new Set(), timer = null;
  const tick = () => {
    if (!row.deadline) return;
    const left = Math.max(0, Math.round((Date.parse(row.deadline) - Date.now()) / 1000));
    clock.textContent = left >= 3600 ? `${Math.floor(left / 3600)}:${String(Math.floor((left % 3600) / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}` : mmss(left);
    clock.classList.toggle("warn", left <= 300);
    for (const w of [600, 300]) if (left <= w && left > w - 2 && !warned.has(w)) { warned.add(w); notice(`${w / 60} minutes remaining`); }
    if (left === 0) { clearInterval(timer); onTimeUp?.(); }
  };
  if (showClock) { tick(); timer = setInterval(tick, 500); ctx.onLeave(() => clearInterval(timer)); }
  // leaving the screen is counted
  let save = debounce(() => M.saveAttempt(row), 800);
  const mark = (kind) => { row.leaves = (row.leaves || 0) + 1; row.events = [...(row.events || []), { t: new Date().toISOString(), kind }].slice(-60); save(); };
  const onVis = () => { if (document.hidden) mark("hidden"); };
  const onBlur = () => mark("blur");
  const onFs = () => { if (!document.fullscreenElement) mark("fullscreen-exit"); };
  document.addEventListener("visibilitychange", onVis); window.addEventListener("blur", onBlur); document.addEventListener("fullscreenchange", onFs);
  ctx.onLeave(() => { document.removeEventListener("visibilitychange", onVis); window.removeEventListener("blur", onBlur); document.removeEventListener("fullscreenchange", onFs); });
  return { top, save };
}
function notice(text) { const n = h("div", { class: "ex-notice", role: "status" }, text); document.body.append(n); setTimeout(() => n.remove(), 4000); }
function debounce(fn, ms) { let t; return () => { clearTimeout(t); t = setTimeout(fn, ms); }; }

// ---------------------------------------------------------------- questions
const letterOf = (opt) => String(opt).trim().split(/\s+/)[0].replace(/[.)]$/, "");
function renderGroup(g, row, onChange, scrollTo) {
  const R = row.responses, F = row.flags;
  const box = h("div", { class: "qgroup-ex" });
  if (g.title) box.append(h("h3", null, g.title));
  if (g.instructions) box.append(h("p", { class: "qinst" }, g.instructions));
  const flag = (n) => h("label", { class: "qflag" }, h("input", { type: "checkbox", checked: !!F[n], onchange: (e) => { F[n] = e.target.checked; onChange(); } }), "Review");
  const numEl = (n) => h("span", { class: "qn num", id: "q-" + n }, String(n));
  if (g.type === "gap" || g.type === "table") {
    const lines = h("div", { class: "gaplines" + (g.type === "table" ? " table" : "") });
    for (const l of g.lines || []) {
      const line = h("div", { class: "gapline" + (/^\s*$/.test(String(l)) ? " blank" : "") });
      const parts = String(l).split(/(\[\[\d+\]\])/);
      for (const p of parts) {
        const m = p.match(/^\[\[(\d+)\]\]$/);
        if (m) { const n = Number(m[1]); line.append(numEl(n), h("input", { type: "text", class: "gap", autocomplete: "off", autocorrect: "off", spellcheck: false, "aria-label": `Answer ${n}`, value: R[n] || "", oninput: (e) => { R[n] = e.target.value; onChange(); }, onfocus: () => scrollTo?.(n, false) })); }
        else if (p) line.append(p);
      }
      lines.append(line);
    }
    box.append(lines);
  } else if (g.type === "mcq") {
    for (const it of g.items || []) {
      const n = Number(it.n), opts = h("div", { class: "opts" });
      for (const o of it.options || []) { const L = letterOf(o); opts.append(h("button", { class: "opt" + (R[n] === L ? " on" : ""), onclick: () => { R[n] = L; onChange(); opts.querySelectorAll(".opt").forEach((b) => b.classList.toggle("on", b === opts.querySelector(`[data-l="${L}"]`))); }, dataset: { l: L } }, h("b", null, L), h("span", null, String(o).replace(/^\S+\s*/, "")))); }
      box.append(h("div", { class: "qitem" }, h("div", { class: "qhead" }, numEl(n), h("span", { class: "qtext" }, it.text), flag(n)), opts));
    }
  } else if (g.type === "multi") {
    const ns = (g.n || []).map(Number), opts = h("div", { class: "opts" });
    const chosen = () => ns.map((n) => R[n]).filter(Boolean);
    for (const o of g.options || []) {
      const L = letterOf(o);
      const b = h("button", { class: "opt" + (chosen().includes(L) ? " on" : ""), onclick: () => {
        let c = chosen(); if (c.includes(L)) c = c.filter((x) => x !== L); else if (c.length < ns.length) c.push(L); else return;
        c.sort(); ns.forEach((n, i) => { R[n] = c[i] || ""; }); onChange();
        opts.querySelectorAll(".opt").forEach((x) => x.classList.toggle("on", c.includes(x.dataset.l)));
      }, dataset: { l: L } }, h("b", null, L), h("span", null, String(o).replace(/^\S+\s*/, "")));
      opts.append(b);
    }
    box.append(h("div", { class: "qitem" }, h("div", { class: "qhead" }, h("span", { class: "qn num", id: "q-" + ns[0] }, ns.join("–")), h("span", { class: "qtext" }, g.text || ""), flag(ns[0])), opts));
  } else if (g.type === "match" || g.type === "headings") {
    const opts = (g.options || []).map((o) => [letterOf(o), String(o).replace(/^\S+\s*/, "")]);
    box.append(h("div", { class: "optlist" }, opts.map(([L, t]) => h("div", null, h("b", null, L), " ", t))));
    for (const it of g.items || []) {
      const n = Number(it.n);
      box.append(h("div", { class: "qitem row-item" }, numEl(n), h("span", { class: "qtext grow" }, it.text),
        h("select", { "aria-label": `Answer ${n}`, onchange: (e) => { R[n] = e.target.value; onChange(); } }, h("option", { value: "" }, "–"), opts.map(([L]) => h("option", { value: L, selected: R[n] === L }, L))), flag(n)));
    }
  } else if (g.type === "tfng" || g.type === "ynng") {
    const vals = g.type === "tfng" ? ["TRUE", "FALSE", "NOT GIVEN"] : ["YES", "NO", "NOT GIVEN"];
    for (const it of g.items || []) {
      const n = Number(it.n), seg = h("div", { class: "seg3" });
      for (const v of vals) seg.append(h("button", { class: "opt" + (R[n] === v ? " on" : ""), onclick: () => { R[n] = v; onChange(); seg.querySelectorAll(".opt").forEach((b) => b.classList.toggle("on", b.textContent === v)); } }, v));
      box.append(h("div", { class: "qitem" }, h("div", { class: "qhead" }, numEl(n), h("span", { class: "qtext" }, it.text), flag(n)), seg));
    }
  } else if (g.type === "short") {
    for (const it of g.items || []) {
      const n = Number(it.n);
      box.append(h("div", { class: "qitem" }, h("div", { class: "qhead" }, numEl(n), h("span", { class: "qtext" }, it.text), flag(n)), h("input", { type: "text", class: "gap wide", autocomplete: "off", spellcheck: false, "aria-label": `Answer ${n}`, value: R[n] || "", oninput: (e) => { R[n] = e.target.value; onChange(); } })));
    }
  }
  return box;
}
function palette(nums, row, goto, groupsOf) {
  const pal = h("div", { class: "ex-pal", role: "navigation", "aria-label": "Questions" });
  const draw = () => {
    pal.replaceChildren(...nums.map((n) => h("button", { class: "pn num" + (String(row.responses[n] || "").trim() ? " done" : "") + (row.flags[n] ? " flag" : ""), onclick: () => goto(n), "aria-label": `Question ${n}${row.responses[n] ? ", answered" : ""}` }, String(n))));
  };
  draw(); return { pal, draw };
}

// ---------------------------------------------------------------- listening, reading, writing
async function lrwExam(ctx, mock, section, row) {
  const sec = mock[section];
  let finished = false;
  const finish = async (opts = {}) => { if (finished) return; finished = true; await finishLR(mock, section, row, opts); ctx.rerender(); };
  const { top, save } = chrome(ctx, mock, section, row, { onTimeUp: () => finish({ auto: true }), showClock: section !== "listening" || !!row.checking });
  const root = h("div", { class: "ex-shell " + section }, top);
  const body = h("div", { class: "ex-body" });
  const bottom = h("div", { class: "ex-bottom" });
  root.append(body, bottom);
  const onChange = () => { save(); pal?.draw(); };
  let pal = null;

  if (section === "writing") {
    let task = 0; const tasks = sec.tasks || [];
    const draw = () => {
      const t = tasks[task]; const text = row.texts[t.no] || "";
      const ta = h("textarea", { class: "essay-in", spellcheck: false, autocorrect: "off", autocapitalize: "sentences", "aria-label": `Task ${t.no}`, value: text, placeholder: "" });
      const wc = h("span", { class: "wc num" }, `Words: ${M.countWords(text)}`);
      ta.addEventListener("input", () => { row.texts[t.no] = ta.value; const n = M.countWords(ta.value); wc.textContent = `Words: ${n}`; const tab = bottom.querySelector(`.ex-part[data-t="${t.no}"] .tiny`); if (tab) tab.textContent = `${n} w`; save(); });
      body.replaceChildren(
        h("div", { class: "ex-left-pane" }, h("div", { class: "wtask" }, h("h3", null, `Writing Task ${t.no}`), h("p", { class: "small muted" }, `You should spend about ${t.minutes || (t.no === 1 ? 20 : 40)} minutes on this task. Write at least ${t.words || (t.no === 1 ? 150 : 250)} words.`),
          ...(String(t.prompt || "").split(/\n\s*\n/).map((p) => h("p", null, p))), t.image ? h("img", { src: /^https?:/.test(t.image) ? t.image : `${RAW}/${t.image}`, alt: "Task figure", class: "wimg" }) : null)),
        h("div", { class: "ex-right-pane" }, ta, h("div", { class: "ex-under" }, wc)));
      bottom.replaceChildren(h("div", { class: "ex-parts" }, tasks.map((x, i) => h("button", { class: "ex-part" + (i === task ? " on" : ""), dataset: { t: x.no }, onclick: () => { task = i; draw(); } }, `Task ${x.no}`, h("span", { class: "tiny num" }, `${M.countWords(row.texts[x.no] || "")} w`)))),
        h("button", { class: "btn primary small", onclick: () => confirmFinish(finish, "Hand in both tasks?") }, "Finish"));
      setTimeout(() => ta.focus({ preventScroll: true }), 50);
    };
    draw(); return root;
  }

  // listening and reading share the question panel
  const units = section === "reading" ? sec.passages : sec.parts;
  const nums = M.questionNumbers(sec);
  let part = Math.max(0, Math.min(row.part || 0, units.length - 1));
  const qpane = h("div", { class: "ex-right-pane qpane" });
  const ppane = h("div", { class: "ex-left-pane ppane" });
  const goto = (n) => { const u = units.findIndex((x) => (x.groups || []).some((g) => JSON.stringify(g).includes(`[[${n}]]`) || (g.items || []).some((it) => Number(it.n) === n) || (g.n || []).includes(n))); if (u >= 0 && u !== part) { part = u; drawPart(); } setTimeout(() => { const el = qpane.querySelector(`#q-${n}`); el?.scrollIntoView({ block: "center", behavior: "smooth" }); el?.parentElement?.querySelector("input,select,button")?.focus?.({ preventScroll: true }); }, 30); };
  pal = palette(nums, row, goto);
  function drawPart() {
    const u = units[part]; row.part = part;
    qpane.replaceChildren(h("div", { class: "qintro" }, h("b", null, section === "reading" ? `Passage ${u.no || part + 1}` : `Part ${u.no || part + 1}`), u.intro ? h("span", null, " · " + u.intro) : null), ...(u.groups || []).map((g) => renderGroup(g, row, onChange, goto)));
    if (section === "reading") {
      const paras = Array.isArray(u.text) ? u.text : String(u.text || "").split(/\n\s*\n/);
      const passage = h("div", { class: "passage", lang: "en" }, u.title ? h("h2", null, u.title) : null, u.subtitle ? h("p", { class: "muted" }, u.subtitle) : null, ...paras.map((p) => { const m = String(p).match(/^([A-H])\s+(.*)$/s); return m && m[2].length > 40 ? h("p", null, h("b", { class: "plabel" }, m[1]), " ", m[2]) : h("p", null, String(p)); }));
      ppane.replaceChildren(passage, highlighter(passage));
      ppane.scrollTop = 0;
    }
    qpane.scrollTop = 0;
    bottom.replaceChildren(h("div", { class: "ex-parts" }, units.map((x, i) => h("button", { class: "ex-part" + (i === part ? " on" : ""), onclick: () => { part = i; drawPart(); save(); } }, section === "reading" ? `Passage ${x.no || i + 1}` : `Part ${x.no || i + 1}`))), pal.pal,
      h("button", { class: "btn primary small", onclick: () => confirmFinish(finish, section === "listening" ? "Finish now and hand in?" : "Hand in your answers?") }, "Finish"));
    pal.draw();
  }
  if (section === "reading") { body.append(ppane, h("div", { class: "ex-split" }), qpane); splitDrag(body); }
  else body.append(audioPane(ctx, mock, sec, row, save, () => finish({ auto: true })), qpane);
  drawPart();
  return root;
}
function confirmFinish(finish, text) {
  const sc = h("div", { class: "ex-confirm" }, h("div", { class: "ex-confirm-in" }, h("p", null, text), h("p", { class: "small muted" }, "You cannot come back to this part afterwards."), h("div", { class: "row-actions" }, h("button", { class: "btn primary", onclick: () => { sc.remove(); finish(); } }, "Yes, hand in"), h("button", { class: "btn", onclick: () => sc.remove() }, "Keep working"))));
  document.body.append(sc);
}
// select text in the passage, then press Highlight; press a highlight to clear it
function highlighter(passage) {
  const btn = h("button", { class: "hl-btn", hidden: true }, "Highlight");
  const onSel = () => {
    const s = document.getSelection(); if (!s || s.isCollapsed || !passage.contains(s.anchorNode)) { btn.hidden = true; return; }
    const r = s.getRangeAt(0).getBoundingClientRect(), p = passage.parentElement.getBoundingClientRect();
    btn.style.left = `${Math.max(8, r.left - p.left)}px`; btn.style.top = `${r.top - p.top + passage.parentElement.scrollTop - 36}px`; btn.hidden = false;
  };
  document.addEventListener("selectionchange", onSel);
  btn.addEventListener("mousedown", (e) => e.preventDefault());
  btn.addEventListener("click", () => {
    const s = document.getSelection(); if (!s || s.isCollapsed) return;
    try { const range = s.getRangeAt(0); const m = document.createElement("mark"); m.className = "hl"; m.onclick = () => { m.replaceWith(...m.childNodes); }; range.surroundContents(m); } catch { toast("Select inside one paragraph to highlight."); }
    s.removeAllRanges(); btn.hidden = true;
  });
  return btn;
}
function splitDrag(body) {
  const bar = body.querySelector(".ex-split"); if (!bar) return;
  let dragging = false;
  bar.addEventListener("pointerdown", (e) => { dragging = true; bar.setPointerCapture(e.pointerId); });
  bar.addEventListener("pointermove", (e) => { if (!dragging) return; const r = body.getBoundingClientRect(); const f = Math.min(0.75, Math.max(0.25, (e.clientX - r.left) / r.width)); body.style.setProperty("--split", `${f * 100}%`); });
  bar.addEventListener("pointerup", () => { dragging = false; });
}

// the recording: loads, plays once, then two minutes to check
function audioPane(ctx, mock, sec, row, save, onDone) {
  const files = sec.audio || [];
  const pane = h("div", { class: "ex-audio" });
  const status = h("div", { class: "ex-audio-s" }, "Loading the recording…");
  const vol = h("input", { type: "range", min: 0, max: 1, step: 0.05, value: 0.9, "aria-label": "Volume" });
  pane.append(h("div", { class: "ex-audio-row" }, icon("volume", 18), vol, status));
  const audio = new Audio(); audio.preload = "auto"; vol.addEventListener("input", () => { audio.volume = Number(vol.value); }); audio.volume = 0.9;
  ctx.onLeave(() => { audio.pause(); audio.src = ""; });
  let idx = 0, checkTimer = null;
  const startCheck = () => {
    if (row.checking) return;
    row.checking = true; row.deadline = new Date(Date.now() + 2 * 60000).toISOString(); save(); chime();
    status.textContent = "The recording has ended. Two minutes to check your answers.";
    const left = () => Math.max(0, Math.round((Date.parse(row.deadline) - Date.now()) / 1000));
    checkTimer = setInterval(() => { const s = left(); status.textContent = `Checking time: ${mmss(s)} left`; if (s <= 0) { clearInterval(checkTimer); onDone(); } }, 500);
    ctx.onLeave(() => clearInterval(checkTimer));
  };
  if (row.checking) { startCheck(); return pane; }
  if (row.played) { status.textContent = "The recording has been played. Finish when you are ready, or it ends by itself."; startCheck(); return pane; }
  (async () => {
    try {
      const blobs = [];
      for (const f of files) blobs.push(await M.audioBlob(mock.id, f, (k, n) => { status.textContent = `Loading the recording… ${k + 1} of ${n}`; }));
      if (!blobs.length) { status.textContent = "This mock has no recording. Finish when you are ready."; return; }
      const urls = blobs.map((b) => URL.createObjectURL(b));
      const playNext = () => {
        if (idx >= urls.length) { row.played = true; save(); startCheck(); return; }
        audio.src = urls[idx]; status.textContent = urls.length > 1 ? `Playing · recording ${idx + 1} of ${urls.length}` : "Playing. The recording plays once.";
        audio.play().catch(() => { status.replaceChildren("Press to play the recording once. ", h("button", { class: "btn small primary", onclick: () => audio.play() }, "Play")); });
        idx++;
      };
      audio.addEventListener("ended", playNext);
      audio.addEventListener("error", () => { status.textContent = "The recording could not be played. Finish when you are ready."; });
      playNext();
    } catch (e) { status.textContent = "Could not load the recording: " + e.message; }
  })();
  return pane;
}

async function finishLR(mock, section, row, { auto = false } = {}) {
  row.status = "done"; row.finishedAt = new Date().toISOString(); row.auto = auto;
  if (section === "listening" || section === "reading") {
    const r = M.mark(mock[section], mock[section].answers || {}, row.responses);
    row.raw = r.raw; row.total = r.total; row.detail = r.detail; row.band = M.bandFor(section, r.raw, r.total);
  }
  await M.saveAttempt(row);
  try { if (document.fullscreenElement) await document.exitFullscreen(); } catch {}
  if (section === "writing") {
    const files = Object.entries(row.texts || {}).filter(([, t]) => String(t).trim()).map(([k, t]) => ({ blob: new Blob([`${mock.title || mock.id}, Writing Task ${k}\n${M.countWords(t)} words\n\n${t}`], { type: "text/plain" }), name: `${mock.id}_writing_task${k}.txt` }));
    if (files.length) row.sent = await hw.sendFiles({ date: mock.date || row.finishedAt.slice(0, 10), label: `${mock.title || mock.id} writing`, files });
    await M.saveAttempt(row);
  }
  hw.sendText(`${hw.studentName() || "Student"} finished ${mock.title || mock.id} ${M.LABEL[section]}${row.band != null ? `: band ${row.band} (${row.raw}/${row.total})` : ""}${row.leaves ? `, left the screen ${row.leaves}×` : ""}.`);
  hw.report();
}

// ---------------------------------------------------------------- speaking
function pickMime() { for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) if (window.MediaRecorder?.isTypeSupported?.(m)) return m; return ""; }
const extOf = (type) => (/mp4/.test(type) ? "m4a" : /ogg/.test(type) ? "ogg" : "webm");
async function speakingExam(ctx, mock, row) {
  const sp = mock.speaking;
  const steps = [];
  for (const t of sp.part1 || []) for (const q of t.questions || []) steps.push({ part: 1, topic: t.topic, q, max: 40 });
  if (sp.part2) steps.push({ part: 2, card: sp.part2, prep: sp.part2.prep || 60, max: sp.part2.talk || 120 });
  for (const t of sp.part3 || []) for (const q of t.questions || []) steps.push({ part: 3, topic: t.topic, q, max: 60 });
  const { top, save } = chrome(ctx, mock, "speaking", row, { showClock: false });
  const root = h("div", { class: "ex-shell speaking" }, top);
  const body = h("div", { class: "ex-body sp" }); root.append(body);
  let i = row.recordings?.length || 0;
  let stream = null, rec = null, timer = null;
  ctx.onLeave(() => { clearInterval(timer); try { rec?.state !== "inactive" && rec?.stop(); } catch {} stream?.getTracks().forEach((t) => t.stop()); });

  async function getStream() {
    if (stream) return stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } }); return stream; }
    catch { toast("The microphone is blocked. Allow it in your browser settings."); return null; }
  }
  function show() {
    const st = steps[i];
    if (!st) { finishSpeaking(); return; }
    const label = st.part === 2 ? "Part 2" : `Part ${st.part}${st.topic ? " · " + st.topic : ""}`;
    const card = h("div", { class: "spcard" });
    const status = h("div", { class: "sp-status", "aria-live": "polite" });
    const ring = h("div", { class: "sp-ring num" }, "");
    const next = h("button", { class: "btn primary", disabled: true }, i === steps.length - 1 ? "Finish" : "Next");
    body.replaceChildren(h("div", { class: "sp-k" }, label, h("span", { class: "faint num" }, ` · ${i + 1} of ${steps.length}`)), card, status, ring, h("div", { class: "row-actions", style: { justifyContent: "center" } }, next));
    if (st.part === 2) {
      const c = st.card;
      card.append(h("p", { class: "sp-q" }, c.card || c.title), c.points?.length ? h("p", { class: "small muted" }, "You should say:") : null, h("ul", null, (c.points || []).map((p) => h("li", null, p))), c.and ? h("p", null, "and ", c.and) : null);
      const notes = h("textarea", { rows: 3, placeholder: "Notes (one minute)", "aria-label": "Notes" }); card.append(notes);
      let left = st.prep; status.textContent = "Prepare your talk."; ring.textContent = mmss(left);
      timer = setInterval(() => { left--; ring.textContent = mmss(left); if (left <= 0) { clearInterval(timer); notes.disabled = true; chime(); record(st, status, ring, next, `Part 2: ${c.card || c.title}`); } }, 1000);
    } else {
      card.append(h("p", { class: "sp-q" }, st.q));
      status.textContent = "Recording starts in a moment."; let wait = 2;
      timer = setInterval(() => { wait--; if (wait <= 0) { clearInterval(timer); record(st, status, ring, next, `Part ${st.part}: ${st.q}`); } }, 800);
    }
  }
  async function record(st, status, ring, next, label) {
    const s = await getStream(); if (!s) { status.textContent = "No microphone. Allow it, then press Next to try this question again."; next.disabled = false; next.onclick = () => show(); return; }
    const mime = pickMime(); let parts = [];
    try { rec = new MediaRecorder(s, mime ? { mimeType: mime, audioBitsPerSecond: 40000 } : { audioBitsPerSecond: 40000 }); } catch { rec = new MediaRecorder(s); }
    rec.ondataavailable = (e) => e.data.size && parts.push(e.data);
    let t = 0; status.replaceChildren(h("span", { class: "rec-dot" }), " Recording. Press Next when you have finished.");
    ring.textContent = mmss(st.max);
    const stop = () => { if (rec.state !== "inactive") rec.stop(); };
    rec.onstop = async () => {
      clearInterval(timer);
      const blob = new Blob(parts, { type: rec.mimeType || mime || "audio/webm" });
      row.recordings = [...(row.recordings || []), { id: uid(), part: st.part, label, seconds: t, blob, at: new Date().toISOString() }];
      await M.saveAttempt(row); i++; show();
    };
    rec.start(1000);
    timer = setInterval(() => { t++; ring.textContent = mmss(Math.max(0, st.max - t)); if (t >= st.max) { chime(); stop(); } }, 1000);
    next.disabled = false; next.onclick = () => { next.disabled = true; stop(); };
  }
  async function finishSpeaking() {
    body.replaceChildren(h("div", { class: "sp-k" }, "Sending your recordings…"), h("div", { class: "progressline" }, h("i", { style: { width: "30%" } })));
    row.status = "done"; row.finishedAt = new Date().toISOString(); await M.saveAttempt(row);
    const files = (row.recordings || []).map((r, k) => ({ blob: r.blob, name: `${mock.id}_speaking_${k + 1}_part${r.part}.${extOf(r.blob.type)}` }));
    row.sent = await hw.sendFiles({ date: mock.date || row.finishedAt.slice(0, 10), label: `${mock.title || mock.id} speaking`, files });
    await M.saveAttempt(row);
    try { if (document.fullscreenElement) await document.exitFullscreen(); } catch {}
    hw.sendText(`${hw.studentName() || "Student"} finished ${mock.title || mock.id} Speaking: ${files.length} recordings${row.leaves ? `, left the screen ${row.leaves}×` : ""}.`);
    hw.report(); ctx.rerender();
  }
  show();
  return root;
}

// ---------------------------------------------------------------- after
function resultScreen(mock, section, row) {
  const box = h("div", { class: "exam-result" });
  const leaves = row.leaves || 0;
  const leaveLine = leaves === 0 ? "You stayed on the screen the whole time. That is exactly how the real test goes." : leaves === 1 ? "You left the screen once. In the real room there is no leaving; next time, let nothing pull you out." : `You left the screen ${leaves} times. In the real room that is not possible. Practise the staying as much as the answering.`;
  box.append(h("div", { class: "kicker" }, mock.title || mock.id), h("h1", null, `${M.LABEL[section]} handed in`));
  if (section === "listening" || section === "reading") {
    box.append(h("div", { class: "res-band num" }, h("b", null, row.band?.toFixed(1)), h("span", null, `band · ${row.raw} of ${row.total} correct`)));
    box.append(h("p", { class: "muted" }, leaveLine));
    const list = h("ol", { class: "answers" }, (row.detail || []).map((d) => h("li", { class: d.ok ? "ok" : "no" }, h("span", { class: "n num" }, d.n), h("span", { class: "mine" }, d.mine || "—"), d.ok ? null : h("span", { class: "key" }, d.key))));
    const det = h("details", null, h("summary", null, "Every answer"), list); box.append(det);
  } else if (section === "writing") {
    box.append(h("p", { class: "lead" }, Object.entries(row.texts || {}).map(([k, t]) => `Task ${k}: ${M.countWords(t)} words`).join(" · ")), h("p", { class: "muted" }, row.sent === "sent" ? "Both texts are with your teacher. The band comes from him." : "Your texts are saved and will be sent when you are online."), h("p", { class: "muted" }, leaveLine));
  } else {
    box.append(h("p", { class: "lead" }, `${(row.recordings || []).length} recordings`), h("p", { class: "muted" }, row.sent === "sent" ? "They are with your teacher. The band comes from him." : "Saved. They will be sent when you are online."), h("p", { class: "muted" }, leaveLine));
  }
  const next = M.SECTIONS[M.SECTIONS.indexOf(section) + 1];
  box.append(h("div", { class: "row-actions", style: { marginTop: "18px" } }, next ? h("a", { class: "btn primary", href: `#/exam/${encodeURIComponent(mock.id)}/${next}` }, `Next: ${M.LABEL[next]}`) : h("a", { class: "btn primary", href: "#/progress" }, "See your progress"), h("a", { class: "btn", href: "#/mock" }, "Back to Mock")));
  return box;
}
