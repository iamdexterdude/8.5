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

// ---------------------------------------------------------------- shared chrome: header with clock, settings, help; the watcher
const PREFS = "eight-exam-prefs";
const prefs = () => { try { return JSON.parse(localStorage.getItem(PREFS) || "{}"); } catch { return {}; } };
const setPref = (k, v) => { const p = { ...prefs(), [k]: v }; try { localStorage.setItem(PREFS, JSON.stringify(p)); } catch {} return p; };
function applyPrefs(el) { const p = prefs(); el.dataset.fs = p.fs || "standard"; el.dataset.colour = p.colour || "bw"; }

function chrome(ctx, mock, section, row, { onTimeUp, showClock = true, extra = null } = {}) {
  const name = hw.studentName() || "Candidate";
  const clock = h("span", { class: "ex-clock num", "aria-live": "off" });
  const clockWrap = h("span", { class: "ex-clockwrap" }, icon("timer", 18), clock);
  const pop = (build) => { document.querySelector(".ex-pop")?.remove(); const p = h("div", { class: "ex-pop", role: "dialog" }, build(() => p.remove())); document.body.append(p); setTimeout(() => document.addEventListener("pointerdown", function off(e) { if (!p.contains(e.target)) { p.remove(); document.removeEventListener("pointerdown", off); } }), 0); return p; };
  const settings = () => pop((close) => {
    const shell = document.querySelector(".ex-shell") || document.querySelector(".exam");
    const group = (label, key, opts) => h("fieldset", null, h("legend", null, label), opts.map(([v, l]) => h("label", { class: "ex-radio" }, h("input", { type: "radio", name: key, checked: (prefs()[key] || opts[0][0]) === v, onchange: () => { setPref(key, v); applyPrefs(shell); } }), h("span", null, l))));
    return h("div", null, h("h3", null, "Settings"),
      group("Text size", "fs", [["standard", "Standard"], ["large", "Large"], ["xlarge", "Extra large"]]),
      group("Colours", "colour", [["bw", "Black on white"], ["wb", "White on black"], ["yb", "Yellow on black"]]),
      h("button", { class: "ex-btn dark", onclick: close }, "OK"));
  });
  const help = () => pop((close) => h("div", null, h("h3", null, "Help"),
    h("ul", { class: "ex-help" },
      h("li", null, "Move between questions with the numbers at the bottom, or the arrows on the right."),
      h("li", null, "Tick Review to mark a question you want to come back to. It shows on its number."),
      section === "reading" ? h("li", null, "Select words in the passage, then choose Highlight or Notes. Click a highlight to clear it or read the note.") : null,
      h("li", null, "Drag an answer into a box, or tap the answer and then tap the box."),
      h("li", null, "Settings changes the text size and colours."),
      h("li", null, "Submit hands in this part. The clock hands it in by itself when time is up.")),
    h("button", { class: "ex-btn dark", onclick: close }, "Close")));
  const hideBtn = h("button", { class: "ex-tool", onclick: () => { clockWrap.classList.toggle("hidden"); hideBtn.lastChild.textContent = clockWrap.classList.contains("hidden") ? "Show" : "Hide"; } }, icon("eye", 18), h("span", null, "Hide"));
  const top = h("header", { class: "ex-top" },
    h("div", { class: "ex-left" }, h("span", { class: "ex-brand" }, "IELTS"), h("span", { class: "ex-cand" }, name)),
    h("div", { class: "ex-mid" }, showClock ? clockWrap : null),
    h("div", { class: "ex-right" }, extra,
      h("button", { class: "ex-tool", onclick: settings }, icon("settings", 18), h("span", null, "Settings")),
      h("button", { class: "ex-tool", onclick: help }, h("b", { class: "ex-q" }, "?"), h("span", null, "Help")),
      showClock ? hideBtn : null));
  let warned = new Set(), timer = null;
  const tick = () => {
    if (!row.deadline) return;
    const left = Math.max(0, Math.round((Date.parse(row.deadline) - Date.now()) / 1000));
    clock.textContent = left > 60 ? `${Math.ceil(left / 60)} minutes left` : `${left} seconds left`;
    clockWrap.classList.toggle("warn", left <= 300);
    for (const w of [600, 300]) if (left <= w && left > w - 2 && !warned.has(w)) { warned.add(w); notice(`${w / 60} minutes left`); }
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
  ctx.onLeave(() => { document.removeEventListener("visibilitychange", onVis); window.removeEventListener("blur", onBlur); document.removeEventListener("fullscreenchange", onFs); document.querySelector(".ex-pop")?.remove(); });
  return { top, save };
}
function notice(text) { const n = h("div", { class: "ex-notice", role: "status" }, text); document.body.append(n); setTimeout(() => n.remove(), 4000); }
function debounce(fn, ms) { let t; return () => { clearTimeout(t); t = setTimeout(fn, ms); }; }

// ---------------------------------------------------------------- questions, the way the computer test shows them
const letterOf = (opt) => String(opt).trim().split(/\s+/)[0].replace(/[.)]$/, "");
const textOf = (opt) => String(opt).trim().replace(/^\S+\s*/, "");
const numsOfGroup = (g) => g.type === "gap" || g.type === "table" ? (g.lines || []).flatMap((l) => [...String(l).matchAll(/\[\[(\d+)\]\]/g)].map((m) => Number(m[1]))) : g.type === "multi" ? (g.n || []).map(Number) : (g.items || []).map((it) => Number(it.n));

function renderGroup(g, row, onChange, at) {
  const R = row.responses;
  const nums = numsOfGroup(g);
  const box = h("div", { class: "qgroup-ex" });
  box.append(h("div", { class: "qg-head" }, h("b", null, nums.length > 1 ? `Questions ${nums[0]}–${nums[nums.length - 1]}` : `Question ${nums[0]}`), g.instructions ? h("p", { class: "qinst" }, g.instructions) : null));
  if (g.image) box.append(h("img", { src: /^(https?:|data:)/.test(g.image) ? g.image : `${RAW}/${g.image}`, alt: g.title || "The picture for these questions", class: "qimg" }));
  const set = (n, v) => { R[n] = v; onChange(n); };

  // drag and drop: options to boxes (tap an option, then a box, works too)
  let picked = null, chips = [];
  const opts = (g.options || []).map((o) => ({ L: letterOf(o), t: textOf(o) }));
  const reuse = g.reuse || opts.length < nums.length || g.type === "headings";
  const refresh = () => { const used = new Set(nums.map((n) => R[n]).filter(Boolean)); for (const c of chips) { c.classList.toggle("used", !reuse && used.has(c.dataset.l)); c.classList.toggle("picked", picked === c.dataset.l); } };
  const optionBox = (title) => {
    chips = opts.map(({ L, t }) => {
      const c = h("div", { class: "dchip", draggable: "true", tabindex: "0", role: "button", dataset: { l: L }, "aria-label": `${L} ${t}` }, g.type === "gap" ? null : h("b", null, L), h("span", null, t));
      c.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/plain", L); e.dataTransfer.effectAllowed = "copyMove"; });
      c.addEventListener("click", () => { picked = picked === L ? null : L; refresh(); });
      c.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); c.click(); } });
      return c;
    });
    const b = h("div", { class: "dchips" + (g.type === "gap" ? " words" : "") }, title ? h("div", { class: "dchips-t" }, title) : null, chips);
    setTimeout(refresh, 0);
    return b;
  };
  const drop = (n) => {
    const z = h("span", { class: "drop", id: "q-" + n, dataset: { q: n }, tabindex: "0", role: "button", "aria-label": `Answer ${n}` });
    const paint = () => { const L = R[n], o = opts.find((x) => x.L === L); z.replaceChildren(L ? h("span", { class: "drop-v" }, g.type === "gap" ? (o?.t || L) : `${L}${o && o.t !== L ? "  " + o.t : ""}`) : h("span", { class: "drop-n num" }, String(n))); z.classList.toggle("filled", !!L); };
    const put = (L) => { set(n, L); picked = null; paint(); refresh(); at(n); };
    z.addEventListener("dragover", (e) => { e.preventDefault(); z.classList.add("over"); });
    z.addEventListener("dragleave", () => z.classList.remove("over"));
    z.addEventListener("drop", (e) => { e.preventDefault(); z.classList.remove("over"); const L = e.dataTransfer.getData("text/plain"); if (L) put(L); });
    z.addEventListener("click", () => { if (picked) put(picked); else if (R[n]) { set(n, ""); paint(); refresh(); } at(n); });
    z.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); z.click(); } if (e.key === "Backspace" || e.key === "Delete") { set(n, ""); paint(); refresh(); } });
    paint(); return z;
  };
  const gapInput = (n) => h("input", { type: "text", class: "gap", id: "q-" + n, dataset: { q: n }, placeholder: String(n), autocomplete: "off", autocorrect: "off", autocapitalize: "off", spellcheck: false, "aria-label": `Answer ${n}`, value: R[n] || "", oninput: (e) => set(n, e.target.value), onfocus: () => at(n) });
  const blank = (n) => (opts.length ? drop(n) : gapInput(n));
  const inline = (text) => String(text).split(/(\[\[\d+\]\])/).filter(Boolean).map((p) => { const m = p.match(/^\[\[(\d+)\]\]$/); return m ? blank(Number(m[1])) : p; });

  if (g.type === "gap" || g.type === "table") {
    if (g.title) box.append(h("h3", { class: "qg-title" }, g.title));
    if (g.type === "table") {
      const table = h("table", { class: "qtable" });
      if (g.header) table.append(h("thead", null, h("tr", null, g.header.map((c) => h("th", null, c)))));
      table.append(h("tbody", null, (g.lines || []).map((l) => h("tr", null, String(l).split(/\s+·\s+/).map((cell) => h("td", null, cell.split("\n").map((ln) => h("div", null, inline(ln)))))))));
      box.append(h("div", { class: "qtable-wrap" }, table));
    } else {
      const lines = h("div", { class: "gaplines" });
      for (const l of g.lines || []) {
        const s = String(l);
        if (/^\s*$/.test(s)) lines.append(h("div", { class: "gapline blank" }));
        else if (s.startsWith("## ")) lines.append(h("h4", { class: "gap-h" }, s.slice(3)));
        else lines.append(h("div", { class: "gapline" + (s.startsWith("• ") ? " bullet" : "") }, inline(s.replace(/^•\s+/, ""))));
      }
      box.append(lines);
    }
    if (opts.length) box.append(optionBox());
  } else if (g.type === "mcq") {
    for (const it of g.items || []) {
      const n = Number(it.n);
      box.append(h("div", { class: "qitem", dataset: { q: n } }, h("div", { class: "qhead", id: "q-" + n }, h("b", { class: "qnum num" }, n), h("span", { class: "qtext" }, it.text)),
        h("div", { class: "radios", role: "radiogroup", "aria-label": `Question ${n}` }, (it.options || []).map((o) => { const L = letterOf(o); return h("label", { class: "ex-radio" }, h("input", { type: "radio", name: "q" + n, value: L, checked: R[n] === L, onchange: () => { set(n, L); at(n); } }), h("span", { class: "rl" }, L), h("span", null, textOf(o))); }))));
    }
  } else if (g.type === "multi") {
    const ns = (g.n || []).map(Number), chosen = () => ns.map((n) => R[n]).filter(Boolean);
    const list = h("div", { class: "radios" });
    for (const o of g.options || []) {
      const L = letterOf(o);
      const cb = h("input", { type: "checkbox", value: L, checked: chosen().includes(L), onchange: (e) => {
        let c = chosen(); if (e.target.checked) { if (c.length >= ns.length) { e.target.checked = false; notice(`Choose ${ns.length === 2 ? "TWO" : "THREE"} answers only.`); return; } c.push(L); } else c = c.filter((x) => x !== L);
        c.sort(); ns.forEach((n, i) => { R[n] = c[i] || ""; }); onChange(ns[0]); at(ns[0]);
      } });
      list.append(h("label", { class: "ex-radio check" }, cb, h("span", { class: "rl" }, L), h("span", null, textOf(o))));
    }
    box.append(h("div", { class: "qitem", dataset: { q: ns[0] } }, h("div", { class: "qhead", id: "q-" + ns[0] }, h("b", { class: "qnum num" }, ns.join("–")), h("span", { class: "qtext" }, g.text || "")), list));
    for (const n of ns.slice(1)) box.append(h("span", { id: "q-" + n, class: "qanchor" }));
  } else if (g.type === "tfng" || g.type === "ynng") {
    const vals = g.type === "tfng" ? ["TRUE", "FALSE", "NOT GIVEN"] : ["YES", "NO", "NOT GIVEN"];
    for (const it of g.items || []) {
      const n = Number(it.n);
      box.append(h("div", { class: "qitem", dataset: { q: n } }, h("div", { class: "qhead", id: "q-" + n }, h("b", { class: "qnum num" }, n), h("span", { class: "qtext" }, it.text)),
        h("div", { class: "radios", role: "radiogroup" }, vals.map((v) => h("label", { class: "ex-radio" }, h("input", { type: "radio", name: "q" + n, value: v, checked: R[n] === v, onchange: () => { set(n, v); at(n); } }), h("span", null, v))))));
    }
  } else if (g.type === "match" || g.type === "headings") {
    if (g.title) box.append(h("h3", { class: "qg-title" }, g.title));
    if (g.letters) {
      // letters only (which paragraph): a drop-down, like the test's answer boxes for these
      for (const it of g.items || []) {
        const n = Number(it.n);
        box.append(h("div", { class: "qitem row-item", dataset: { q: n } }, h("b", { class: "qnum num", id: "q-" + n }, n), h("span", { class: "qtext grow" }, it.text),
          h("select", { "aria-label": `Answer ${n}`, onchange: (e) => { set(n, e.target.value); at(n); }, onfocus: () => at(n) }, h("option", { value: "" }, ""), opts.map(({ L }) => h("option", { value: L, selected: R[n] === L }, L)))));
      }
    } else {
      const rows = h("div", { class: "matchrows" }, g.itemsTitle ? h("div", { class: "dchips-t" }, g.itemsTitle) : null, (g.items || []).map((it) => { const n = Number(it.n); return h("div", { class: "qitem match-item", dataset: { q: n } }, h("span", { class: "qtext" }, it.text), drop(n)); }));
      box.append(h("div", { class: "matchwrap" }, rows, optionBox(g.optionsTitle || "")));
    }
  } else if (g.type === "short") {
    for (const it of g.items || []) {
      const n = Number(it.n);
      box.append(h("div", { class: "qitem", dataset: { q: n } }, h("div", { class: "qhead" }, h("b", { class: "qnum num" }, n), h("span", { class: "qtext" }, it.text)), gapInput(n)));
    }
  }
  if (g.note) box.append(h("p", { class: "small muted" }, g.note));
  return box;
}

// the bar at the bottom: the parts, the question numbers of the open part, Review, the arrows and Submit
function navBar(units, nums, row, state, go, onSubmit, label) {
  const bar = h("nav", { class: "ex-nav", "aria-label": "Questions" });
  const draw = () => {
    const unitNums = units.map((u) => M.questionNumbers({ parts: [u] }));
    const answered = (n) => !!String(row.responses[n] || "").trim();
    const review = h("label", { class: "ex-review" }, h("input", { type: "checkbox", checked: !!row.flags[state.cur], onchange: (e) => { row.flags[state.cur] = e.target.checked; state.save(); draw(); } }), h("span", null, "Review"));
    bar.replaceChildren(
      review,
      h("div", { class: "ex-parts2" }, units.map((u, i) => {
        const ns = unitNums[i], done = ns.filter(answered).length, name = `${label} ${u.no || i + 1}`;
        if (i !== state.part) return h("button", { class: "ex-p", onclick: () => go(ns[0]) }, h("b", null, name), h("span", { class: "num" }, `${done} of ${ns.length}`));
        return h("div", { class: "ex-p on" }, h("b", null, name), h("div", { class: "ex-qs" }, ns.map((n) => h("button", { class: "ex-qn num" + (answered(n) ? " done" : "") + (row.flags[n] ? " flag" : "") + (n === state.cur ? " cur" : ""), "aria-label": `Question ${n}`, onclick: () => go(n) }, n))));
      })),
      h("div", { class: "ex-arrows" },
        h("button", { class: "ex-arrow", "aria-label": "Previous question", disabled: nums.indexOf(state.cur) <= 0, onclick: () => go(nums[nums.indexOf(state.cur) - 1]) }, icon("back", 22)),
        h("button", { class: "ex-arrow", "aria-label": "Next question", disabled: nums.indexOf(state.cur) >= nums.length - 1, onclick: () => go(nums[nums.indexOf(state.cur) + 1]) }, icon("chevron", 22)),
        h("button", { class: "ex-submit", "aria-label": "Submit", onclick: onSubmit }, icon("check", 20), h("span", null, "Submit"))));
  };
  draw(); return { bar, draw };
}

// ---------------------------------------------------------------- listening, reading, writing
async function lrwExam(ctx, mock, section, row) {
  const sec = mock[section];
  let finished = false;
  const finish = async (opts = {}) => { if (finished) return; finished = true; await finishLR(mock, section, row, opts); ctx.rerender(); };
  const vol = section === "listening" ? h("label", { class: "ex-tool ex-vol" }, icon("volume", 18), h("input", { type: "range", min: 0, max: 1, step: 0.05, value: prefs().vol ?? 0.9, "aria-label": "Volume" })) : null;
  const { top, save } = chrome(ctx, mock, section, row, { onTimeUp: () => finish({ auto: true }), showClock: section !== "listening" || !!row.checking, extra: vol });
  const root = h("div", { class: "ex-shell " + section }, top);
  applyPrefs(root);
  const partbar = h("div", { class: "ex-partbar" });
  const body = h("div", { class: "ex-body" });
  const bottom = h("div", { class: "ex-bottom" });
  root.append(partbar, body, bottom);

  if (section === "writing") {
    let task = 0; const tasks = sec.tasks || [];
    const draw = () => {
      const t = tasks[task]; const text = row.texts[t.no] || "";
      partbar.replaceChildren(h("b", null, `Part ${t.no}`), h("span", null, `You should spend about ${t.minutes || (t.no === 1 ? 20 : 40)} minutes on this task. Write at least ${t.words || (t.no === 1 ? 150 : 250)} words.`));
      const ta = h("textarea", { class: "essay-in", spellcheck: false, autocorrect: "off", autocapitalize: "sentences", "aria-label": `Part ${t.no} answer`, value: text, placeholder: "" });
      const wc = h("span", { class: "wc num" }, `Word count: ${M.countWords(text)}`);
      ta.addEventListener("input", () => { row.texts[t.no] = ta.value; const n = M.countWords(ta.value); wc.textContent = `Word count: ${n}`; const tab = bottom.querySelector(`.ex-p[data-t="${t.no}"] span`); if (tab) tab.textContent = `${n} words`; save(); });
      body.replaceChildren(
        h("div", { class: "ex-left-pane" }, h("div", { class: "wtask" }, h("div", { class: "wbox" }, ...(String(t.prompt || "").split(/\n\s*\n/).map((p) => h("p", null, p)))), t.image ? h("img", { src: /^(https?:|data:)/.test(t.image) ? t.image : `${RAW}/${t.image}`, alt: "The task figure", class: "wimg" }) : null)),
        h("div", { class: "ex-split" }),
        h("div", { class: "ex-right-pane" }, ta, h("div", { class: "ex-under" }, wc)));
      splitDrag(body);
      bottom.replaceChildren(h("nav", { class: "ex-nav" }, h("div", { class: "ex-parts2" }, tasks.map((x, i) => h("button", { class: "ex-p" + (i === task ? " on" : ""), dataset: { t: x.no }, onclick: () => { task = i; draw(); } }, h("b", null, `Part ${x.no}`), h("span", { class: "num" }, `${M.countWords(row.texts[x.no] || "")} words`)))),
        h("div", { class: "ex-arrows" }, h("button", { class: "ex-submit", onclick: () => confirmFinish(finish, "Submit both parts?") }, icon("check", 20), h("span", null, "Submit")))));
      setTimeout(() => ta.focus({ preventScroll: true }), 50);
    };
    draw(); return root;
  }

  // listening and reading: the questions, the part bar, the bottom navigation
  const units = section === "reading" ? sec.passages : sec.parts, label = "Part";
  const nums = M.questionNumbers(sec);
  const state = { part: Math.max(0, Math.min(row.part || 0, units.length - 1)), cur: null, save };
  const unitOf = (n) => units.findIndex((u) => M.questionNumbers({ parts: [u] }).includes(n));
  state.cur = row.cur && nums.includes(row.cur) ? row.cur : M.questionNumbers({ parts: [units[state.part]] })[0];
  const qpane = h("div", { class: "ex-right-pane qpane" });
  const ppane = h("div", { class: "ex-left-pane ppane" });
  let nav = null;
  const at = (n) => { if (n == null || state.cur === n) return; state.cur = n; row.cur = n; nav?.draw(); markCur(); };
  const markCur = () => { qpane.querySelectorAll(".is-cur").forEach((x) => x.classList.remove("is-cur")); qpane.querySelector(`[data-q="${state.cur}"]`)?.closest(".qitem, .gapline, td, .drop")?.classList.add("is-cur"); };
  const go = (n) => {
    if (n == null) return;
    const u = unitOf(n); if (u >= 0 && u !== state.part) { state.part = u; drawPart(); }
    state.cur = n; row.cur = n; nav.draw(); markCur(); save();
    setTimeout(() => { const el = qpane.querySelector(`#q-${n}`); el?.scrollIntoView({ block: "center", behavior: "smooth" }); (el?.matches("input,select,.drop") ? el : el?.closest(".qitem")?.querySelector("input,select,.drop"))?.focus?.({ preventScroll: true }); }, 30);
  };
  const onChange = (n) => { save(); if (n != null) state.cur = n; nav?.draw(); };
  const submit = () => { const left = nums.filter((n) => !String(row.responses[n] || "").trim()).length; confirmFinish(finish, left ? `${left} ${left === 1 ? "question has" : "questions have"} no answer. Submit anyway?` : "Submit your answers?"); };
  nav = navBar(units, nums, row, state, go, submit, label);
  function drawPart() {
    const u = units[state.part]; row.part = state.part;
    const ns = M.questionNumbers({ parts: [u] });
    partbar.replaceChildren(h("b", null, `Part ${u.no || state.part + 1}`), h("span", null, section === "reading" ? `Read the text and answer questions ${ns[0]}–${ns[ns.length - 1]}.` : `Listen and answer questions ${ns[0]}–${ns[ns.length - 1]}.`));
    qpane.replaceChildren(...(u.groups || []).map((g) => renderGroup(g, row, onChange, at)));
    if (section === "reading") {
      const paras = Array.isArray(u.text) ? u.text : String(u.text || "").split(/\n\s*\n/);
      const passage = h("div", { class: "passage", lang: "en" }, u.title ? h("h2", null, u.title) : null, u.subtitle ? h("p", { class: "psub" }, u.subtitle) : null,
        ...paras.map((p) => { const s = String(p), m = s.match(/^([A-H])\s+(.*)$/s); if (/^\*/.test(s)) return h("div", { class: "pnotes" }, s.split("\n").map((x) => h("p", null, x))); return m && m[2].length > 40 ? h("p", null, h("b", { class: "plabel" }, m[1]), " ", m[2]) : h("p", null, s); }));
      row.hl ||= {};
      if (row.hl[state.part]) passage.innerHTML = row.hl[state.part];
      ppane.replaceChildren(passage);
      marker(passage, () => { row.hl[state.part] = passage.innerHTML; save(); });
      ppane.scrollTop = 0;
    }
    qpane.scrollTop = 0;
    markCur(); nav.draw();
  }
  qpane.addEventListener("focusin", (e) => { const q = e.target.closest("[data-q]")?.dataset.q || e.target.closest(".qitem")?.dataset.q; if (q) at(Number(q)); });
  qpane.addEventListener("click", (e) => { const q = e.target.closest("[data-q]")?.dataset.q; if (q) at(Number(q)); });
  marker(qpane, null);
  bottom.append(nav.bar);
  if (section === "reading") { body.append(ppane, h("div", { class: "ex-split" }), qpane); splitDrag(body); }
  else body.append(audioPane(ctx, mock, sec, row, save, () => finish({ auto: true }), vol?.querySelector("input")), qpane);
  drawPart();
  return root;
}
function confirmFinish(finish, text) {
  const sc = h("div", { class: "ex-confirm" }, h("div", { class: "ex-confirm-in" }, h("p", null, h("b", null, text)), h("p", { class: "small muted" }, "You cannot come back to this part afterwards."), h("div", { class: "row-actions" }, h("button", { class: "ex-btn dark", onclick: () => { sc.remove(); finish(); } }, "Submit"), h("button", { class: "ex-btn", onclick: () => sc.remove() }, "Keep working"))));
  document.body.append(sc);
}

// highlight and notes: select text, then Highlight or Notes (right-click works too); click a highlight to read, change or clear it
function marker(container, persist) {
  const bar = h("div", { class: "hl-bar", hidden: true });
  document.body.append(bar);
  const hide = () => { bar.hidden = true; };
  const place = (rect) => { bar.style.left = `${Math.max(8, Math.min(innerWidth - 220, rect.left + window.scrollX))}px`; bar.style.top = `${Math.max(8, rect.top + window.scrollY - 46)}px`; bar.hidden = false; };
  const wrap = (range, note) => {
    // wrap every text piece inside the selection, so a highlight can cross bold words or line ends
    const walker = document.createTreeWalker(range.commonAncestorContainer.nodeType === 3 ? range.commonAncestorContainer.parentNode : range.commonAncestorContainer, NodeFilter.SHOW_TEXT);
    const texts = []; let t; while ((t = walker.nextNode())) if (range.intersectsNode(t) && t.textContent.trim() && !t.parentElement.closest("input,select,textarea,button,.drop,.dchip")) texts.push(t);
    let first = null;
    for (const node of texts) {
      let s = 0, e = node.textContent.length;
      if (node === range.startContainer) s = range.startOffset; if (node === range.endContainer) e = range.endOffset;
      if (e <= s) continue;
      const mid = node.splitText(s); mid.splitText(e - s);
      const m = h("mark", { class: "hl" + (note ? " has-note" : "") }); if (note) m.dataset.note = note;
      mid.replaceWith(m); m.append(mid); first ||= m;
    }
    return first;
  };
  const noteBox = (m) => {
    const p = h("div", { class: "ex-pop note", role: "dialog" });
    const ta = h("textarea", { rows: 3, placeholder: "Your note", value: m.dataset.note || "" });
    const done = () => { const v = ta.value.trim(); document.querySelectorAll(`mark.hl[data-grp="${m.dataset.grp}"]`).forEach((x) => { if (v) { x.dataset.note = v; x.classList.add("has-note"); } else { delete x.dataset.note; x.classList.remove("has-note"); } }); p.remove(); persist?.(); };
    p.append(h("h3", null, "Notes"), ta, h("div", { class: "row-actions" }, h("button", { class: "ex-btn dark", onclick: done }, "Save"), h("button", { class: "ex-btn", onclick: () => { clear(m); p.remove(); } }, "Clear highlight")));
    const r = m.getBoundingClientRect(); p.style.left = `${Math.max(8, Math.min(innerWidth - 300, r.left))}px`; p.style.top = `${r.bottom + window.scrollY + 8}px`;
    document.querySelectorAll(".ex-pop").forEach((x) => x.remove()); document.body.append(p); ta.focus();
  };
  const clear = (m) => { document.querySelectorAll(`mark.hl[data-grp="${m.dataset.grp}"]`).forEach((x) => x.replaceWith(...x.childNodes)); container.normalize(); persist?.(); hide(); };
  const act = (kind) => {
    const s = document.getSelection(); if (!s || s.isCollapsed || !container.contains(s.anchorNode)) return hide();
    const grp = String(Date.now()), first = wrap(s.getRangeAt(0));
    container.querySelectorAll("mark.hl:not([data-grp])").forEach((x) => (x.dataset.grp = grp));
    s.removeAllRanges(); hide(); persist?.();
    if (kind === "note" && first) noteBox(first);
  };
  const offer = (e) => {
    const s = document.getSelection();
    if (s && !s.isCollapsed && container.contains(s.anchorNode) && !s.anchorNode.parentElement?.closest("input,textarea")) {
      if (e?.type === "contextmenu") e.preventDefault();
      bar.replaceChildren(h("button", { onmousedown: (x) => x.preventDefault(), onclick: () => act("hl") }, "Highlight"), h("button", { onmousedown: (x) => x.preventDefault(), onclick: () => act("note") }, "Notes"));
      place(s.getRangeAt(0).getBoundingClientRect());
    } else if (e?.type !== "contextmenu") hide();
  };
  container.addEventListener("mouseup", () => setTimeout(offer, 0));
  container.addEventListener("touchend", () => setTimeout(offer, 250));
  container.addEventListener("contextmenu", offer);
  container.addEventListener("click", (e) => {
    const m = e.target.closest("mark.hl"); if (!m || !document.getSelection().isCollapsed) return;
    bar.replaceChildren(h("button", { onclick: () => { hide(); noteBox(m); } }, m.dataset.note ? "Read note" : "Notes"), h("button", { onclick: () => clear(m) }, "Clear"));
    place(m.getBoundingClientRect());
  });
  const off = (e) => { if (!bar.contains(e.target) && !container.contains(e.target)) hide(); };
  document.addEventListener("pointerdown", off);
  let seen = false;   // the screen is built before it is shown: only a container that was on screen and is gone takes its bar with it
  const obs = new MutationObserver(() => { if (container.isConnected) { seen = true; return; } if (seen) { bar.remove(); document.removeEventListener("pointerdown", off); obs.disconnect(); } });
  obs.observe(document.body, { childList: true, subtree: true });
}
function splitDrag(body) {
  const bar = body.querySelector(".ex-split"); if (!bar) return;
  let dragging = false;
  bar.addEventListener("pointerdown", (e) => { dragging = true; bar.setPointerCapture(e.pointerId); });
  bar.addEventListener("pointermove", (e) => { if (!dragging) return; const r = body.getBoundingClientRect(); const f = Math.min(0.75, Math.max(0.25, (e.clientX - r.left) / r.width)); body.style.setProperty("--split", `${f * 100}%`); });
  bar.addEventListener("pointerup", () => { dragging = false; });
}

// the recording: loads, plays once, then two minutes to check
function audioPane(ctx, mock, sec, row, save, onDone, vol) {
  const files = sec.audio || [];
  const pane = h("div", { class: "ex-audio" });
  const status = h("div", { class: "ex-audio-s" }, "Loading the recording…");
  pane.append(h("div", { class: "ex-audio-row" }, icon("volume", 18), status));
  const audio = new Audio(); audio.preload = "auto"; audio.volume = Number(vol?.value ?? 0.9);
  vol?.addEventListener("input", () => { audio.volume = Number(vol.value); setPref("vol", Number(vol.value)); });
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
  M.sendReport(mock, section, row).catch(() => {});   // the full report to the teacher's Telegram
  M.submitPart(mock, section, row).catch(() => {});   // and the part itself, for marking
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
    M.sendReport(mock, "speaking", row).catch(() => {});
    M.submitPart(mock, "speaking", row).catch(() => {});
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
