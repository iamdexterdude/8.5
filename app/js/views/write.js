// Writing studio: a plain editor for timed writing. No spellcheck, no autocorrect, no suggestions: the exam has none.
import { h, icon, uid, todayISO, wordCount, fmtShort, mmss } from "../util.js";
import * as store from "../store.js";
import * as db from "../db.js";
import { head, ring, makeTimer, chime, toast, sheet } from "../ui.js";
import { patternMark } from "../util.js";

export const live = false;
// replaceChildren that ignores null, so optional pieces can be left out
const put = (el, ...kids) => el.replaceChildren(...kids.flat().filter((x) => x != null && x !== false));

const T1_PROMPT = "Summarise the information by selecting and reporting the main features, and make comparisons where relevant.";
const CHECKS = {
  1: ["The overview names the two or three biggest changes or trends, with no numbers", "The paragraphs follow what changed and what stayed, not compass points", "Key numbers are quoted and grouped sensibly", "Articles and agreement checked in the last three minutes"],
  2: ["My position is stated in the introduction and restated in the conclusion", "There is a conclusion", "Every paragraph is tested against the key words of the question", "Each body paragraph has one specific example", "Articles, collocations and memorised templates checked"],
};

export default async function (ctx) {
  const q = ctx.query;
  if (q.view === "history") return history(ctx);
  if (q.essay) return essayDetail(ctx, q.essay);

  const S = store.S;
  let part = Number(q.part) || 2, minutes = Number(q.min) || (part === 1 ? 20 : 40);
  const rewrite = !!q.rewrite, full = !!q.full, taskKey = q.task || "";
  let promptId = q.p || "";
  let state = { stage: taskKey || promptId || q.part ? "setup" : "choose" };
  const root = h("div");
  const stage = h("div"); root.append(stage);
  const back = q.session ? "#/session" : taskKey ? "#/today" : "#/practice";

  const prompts = S.plan.prompts;
  const draftKey = () => `draft:${taskKey || "free"}:${part}`;
  const goal = () => (part === 1 ? 150 : 250);
  const promptObj = () => prompts.find((p) => p.id === promptId);

  function choose() {
    put(stage, head("Writing", { back, sub: "Timed, plain editor" }),
      h("section", { class: "section" }, h("h2", null, "Task 2"), h("p", { class: "muted small" }, "Choose a prompt from the bank."),
        h("ul", { class: "rows" }, prompts.map((p) => h("li", null, h("a", { class: "row", href: `#/write?part=2&p=${p.id}&min=40` }, h("div", { style: { width: "40px", fontWeight: 600 }, class: "num" }, p.id), h("div", { class: "grow" }, h("div", { class: "small" }, p.text), h("div", { class: "sub" }, p.type)), icon("chevron", 18)))))),
      h("section", { class: "section" }, h("h2", null, "Task 1"), h("p", { class: "muted small" }, "Pick a visual from the course or a Cambridge book, then attach a photo of it."),
        h("a", { class: "btn", href: "#/write?part=1&min=20" }, "Start Task 1, 20 minutes")),
      historyLink());
  }

  // ----- setup: prompt, visual and the five-minute plan -----
  async function setup() {
    const p = promptObj();
    const visual = h("div", { class: "visual" });
    let imageBlob = null;
    const fileIn = h("input", { type: "file", accept: "image/*", "aria-label": "Attach the visual", onchange: (e) => { const f = e.target.files[0]; if (!f) return; imageBlob = f; visual.replaceChildren(h("img", { src: URL.createObjectURL(f), alt: "The Task 1 visual" })); } });
    const planBox = h("textarea", { rows: 6, placeholder: "Key words of the question. My position. Point 1 and its example. Point 2 and its example.", spellcheck: false, autocomplete: "off", "aria-label": "Five-minute plan", value: S.kv["plan:" + draftKey()] || "" });
    const skipReason = h("input", { type: "text", placeholder: "Reason for skipping the plan (for example: a timed test)", "aria-label": "Reason for skipping the plan" });
    const prevEssay = rewrite ? (await db.all("essays")).filter((e) => e.part === part && (!promptId || e.promptId === promptId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] : null;
    const lengths = h("div", { class: "seg", role: "group", "aria-label": "Time" }, [20, 40, 60, 0].map((m) => h("button", { "aria-pressed": String(m === (rewrite ? 0 : minutes)), onclick: (e) => { minutes = m; lengths.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === e.currentTarget))); } }, m ? `${m} min` : "Untimed")));
    const go = (withPlan) => { if (part === 2 && !withPlan && !skipReason.value.trim() && !rewrite) { toast("Add a short reason to skip the plan."); skipReason.focus(); return; } state.plan = planBox.value; state.skipReason = skipReason.value.trim(); state.imageBlob = imageBlob; store.setSetting("plan:" + draftKey(), planBox.value); write(); };

    put(stage, head(part === 1 ? "Task 1" : "Task 2", { back, sub: rewrite ? "Rewrite" : full ? "Full writing test, part 1 of 2" : "Timed writing" }),
      part === 2
        ? h("div", { class: "quiet-box", style: { borderStyle: "solid", fontSize: "17px" } }, p ? [h("div", { class: "pill", style: { marginBottom: "8px" } }, `${p.id}, ${p.type}`), h("div", null, p.text)] : h("div", null, "Choose a prompt first."), !p ? h("a", { href: "#/write", class: "btn small", style: { marginTop: "8px" } }, "Choose a prompt") : null)
        : h("div", { class: "split with-visual" }, h("div", null, h("p", { class: "lead" }, T1_PROMPT), h("div", { class: "field" }, h("label", null, "Attach the visual (photo or screenshot)"), fileIn)), visual),
      prevEssay ? h("details", { class: "quiet-box" }, h("summary", { style: { cursor: "pointer", fontWeight: 600 } }, `Your earlier version, ${fmtShort(prevEssay.createdAt.slice(0, 10))}, ${prevEssay.words} words`), h("p", { style: { whiteSpace: "pre-wrap", marginTop: "8px" } }, prevEssay.text)) : null,
      h("div", { class: "field", style: { marginTop: "12px" } }, h("div", { class: "lbl" }, "Time"), lengths),
      part === 2 && !rewrite ? h("section", { class: "section" }, h("h2", null, "Plan for five minutes"), h("p", { class: "small muted" }, "Underline the key words, state your position, and give each body paragraph a point and an example. Write it here, on paper, or both."), planBox,
        h("div", { class: "row-actions", style: { marginTop: "10px" } }, h("button", { class: "btn primary", onclick: () => go(true) }, "Start writing"),),
        h("div", { class: "field", style: { marginTop: "14px" } }, skipReason, h("div", null, h("button", { class: "btn quiet", onclick: () => go(false) }, "Skip the plan"))))
        : h("div", { class: "row-actions", style: { marginTop: "16px" } }, h("button", { class: "btn primary", onclick: () => go(true), disabled: part === 2 && !promptObj() }, "Start writing")));
  }

  // ----- writing -----
  function write() {
    const p = promptObj();
    const ta = h("textarea", { class: "editor", "aria-label": "Your answer", spellcheck: false, autocomplete: "off", autocapitalize: "off", autocorrect: "off", rows: 16, value: S.kv[draftKey()] || "" });
    ta.setAttribute("autocorrect", "off"); ta.setAttribute("spellcheck", "false"); ta.setAttribute("autocomplete", "off"); ta.setAttribute("autocapitalize", "off"); ta.setAttribute("data-gramm", "false"); ta.setAttribute("data-gramm_editor", "false"); ta.setAttribute("data-enable-grammarly", "false"); ta.setAttribute("writingsuggestions", "false");
    const wc = h("span", { class: "wc" }), clock = h("b", { class: "num", style: { fontSize: "22px", minWidth: "64px" }, "aria-hidden": "true" }, mmss(minutes * 60));
    let startedAt = Date.now(), timeUp = false;
    const upd = () => { const n = wordCount(ta.value); wc.className = "wc" + (n >= goal() ? " met" : ""); wc.replaceChildren(String(n), h("span", { class: "goal" }, ` words, aim for ${goal()}+`)); };
    let saveT; ta.addEventListener("input", () => { upd(); clearTimeout(saveT); saveT = setTimeout(() => store.setSetting(draftKey(), ta.value), 700); });
    // block paste so the timed piece is her own work typed in the time
    ta.addEventListener("paste", (e) => { e.preventDefault(); toast("Paste is off while you write. Type your answer."); });
    upd();
    const t = minutes ? makeTimer(minutes * 60, { onTick: (s) => { clock.textContent = mmss(s); clock.style.color = s <= 60 ? "var(--danger)" : ""; }, onEnd: () => { timeUp = true; chime(); ta.readOnly = true; toast("Time is up. Submit what you have."); } }) : null;
    if (t) t.start();
    ctx.onLeave(() => { t?.destroy(); store.setSetting(draftKey(), ta.value); });

    const submit = async () => {
      const text = ta.value.trim(); if (wordCount(text) < 20) { toast("Write a little more before you submit."); return; }
      t?.pause();
      const seconds = Math.round((Date.now() - startedAt) / 1000);
      const essay = { id: uid(), createdAt: new Date().toISOString(), taskKey, part, promptId: promptId || "", promptText: part === 2 ? p?.text || "" : T1_PROMPT, text, words: wordCount(text), seconds, minutes, rewrite, plan: state.plan || "", skipReason: state.skipReason || "", imageBlob: state.imageBlob || null, bands: {}, checks: [] };
      await db.put("essays", essay);
      await store.setSetting(draftKey(), "");
      await store.addStudy(Math.max(1, Math.round(seconds / 60)), "writing");
      if (taskKey && (!full || part === 2)) await store.markDone(taskKey, { essayId: essay.id });
      toast("Essay submitted.");
      submitted(essay);
    };

    put(stage, head(part === 1 ? "Task 1" : "Task 2", { back, sub: p?.type || (rewrite ? "Rewrite" : "") }),
      p ? h("details", { class: "quiet-box", open: true }, h("summary", { style: { cursor: "pointer", fontWeight: 600 } }, p.id), h("div", null, p.text)) : h("div", { class: "quiet-box" }, T1_PROMPT),
      h("div", { class: "editor-bar" }, wc, minutes ? h("div", { role: "timer", "aria-label": "Time left" }, clock) : h("span", { class: "faint" }, "Untimed"),
        h("button", { class: "btn primary small", onclick: submit }, "Submit essay")),
      state.imageBlob ? h("div", { class: "visual", style: { marginBottom: "8px" } }, h("img", { src: URL.createObjectURL(state.imageBlob), alt: "The Task 1 visual" })) : null,
      ta);
    ta.focus();
  }

  // ----- after submitting: self-check, log errors -----
  function submitted(essay) {
    const checks = CHECKS[part].map((c) => h("label", null, h("input", { type: "checkbox", onchange: async (e) => { essay.checks = [...document.querySelectorAll(".checklist input")].map((x) => x.checked); await db.put("essays", essay); } }), h("span", null, c)));
    const next = full && part === 1
      ? h("a", { class: "btn primary block", href: `#/write?task=${encodeURIComponent(taskKey)}&part=2&min=40&full=1${promptId ? "&p=" + promptId : ""}${q.session ? "&session=1" : ""}` }, "Continue to Task 2, 40 minutes")
      : h("a", { class: "btn primary block", href: q.session ? "#/session" : "#/today" }, q.session ? "Back to the session" : "Back to Today");
    put(stage, head("Essay submitted", { back: "#/today", sub: `${essay.words} words, ${mmss(essay.seconds)}` }),
      h("div", { class: "notice" }, taskKey ? "Your task is marked done. Marking comes from your teacher within 24 hours." : "Saved in Your essays."),
      h("section", { class: "section" }, h("div", { class: "shead" }, h("h2", null, "Check it yourself")), h("div", { class: "checklist" }, checks)),
      h("section", { class: "section" }, h("div", { class: "shead" }, h("h2", null, "Add a mistake to the error log")), errorForm(essay)),
      h("div", { style: { marginTop: "24px" } }, next));
  }

  const choosers = { choose, setup };
  if (state.stage === "choose") choose();
  else await setup();
  return root;
}

// quick form: wrong sentence -> corrected, pattern. Repeats raise "times seen" instead of duplicating.
export function errorForm(essay) {
  const wrote = h("input", { type: "text", placeholder: "What I wrote", "aria-label": "What I wrote" });
  const correct = h("input", { type: "text", placeholder: "The correct version", "aria-label": "The correct version" });
  const pat = h("select", { "aria-label": "Pattern" }, Object.keys(store.S.config.patterns).map((k) => h("option", null, k)));
  const list = h("div", { class: "small muted", "aria-live": "polite" });
  return h("div", null, h("div", { class: "field" }, wrote, correct, pat),
    h("button", { class: "btn", onclick: async () => {
      if (!wrote.value.trim() || !correct.value.trim()) { toast("Fill in both lines."); return; }
      const r = await store.logError({ source: essay ? "Essay" : "Practice", wrote: wrote.value.trim(), correct: correct.value.trim(), pattern: pat.value });
      toast(r.repeat ? `Seen again. Times seen: ${r.row.seen}.` : "Added to the error log.");
      list.append(h("div", null, "Added: " + wrote.value.trim())); wrote.value = ""; correct.value = "";
    } }, "Add to error log"), list);
}

function historyLink() { return h("p", { style: { marginTop: "24px" } }, h("a", { href: "#/write?view=history" }, "Your essays")); }

async function history(ctx) {
  const rows = (await db.all("essays")).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const root = h("div");
  root.append(head("Your essays", { back: "#/practice", sub: `${rows.length} saved` }));
  if (!rows.length) { root.append(h("div", { class: "empty" }, "No essays yet. Your first one will appear here after you submit it."), h("a", { class: "btn primary", href: "#/write" }, "Start writing")); return root; }
  root.append(h("ul", { class: "rows" }, rows.map((e) => h("li", null, h("a", { class: "row", href: `#/write?essay=${e.id}` },
    h("div", { class: "grow" }, h("div", { class: "title" }, e.part === 1 ? "Task 1" : `Task 2${e.promptId ? ", " + e.promptId : ""}`), h("div", { class: "sub" }, `${fmtShort(e.createdAt.slice(0, 10))}, ${e.words} words`)),
    e.bands?.overall ? h("span", { class: "pill accent num" }, e.bands.overall.toFixed(1)) : h("span", { class: "pill" }, "Not scored"), icon("chevron", 18))))));
  return root;
}

async function essayDetail(ctx, id) {
  const e = (await db.all("essays")).find((x) => x.id === id);
  const root = h("div");
  if (!e) { root.append(head("Essay", { back: "#/write?view=history" }), h("div", { class: "empty" }, "That essay was not found.")); return root; }
  root.append(head(e.part === 1 ? "Task 1" : `Task 2${e.promptId ? ", " + e.promptId : ""}`, { back: "#/write?view=history", sub: `${fmtShort(e.createdAt.slice(0, 10))}, ${e.words} words, ${mmss(e.seconds)}` }));
  root.append(h("div", { class: "quiet-box", style: { borderStyle: "solid" } }, e.promptText));
  if (e.imageBlob) root.append(h("div", { class: "visual" }, h("img", { src: URL.createObjectURL(e.imageBlob), alt: "The Task 1 visual" })));
  root.append(h("div", { style: { whiteSpace: "pre-wrap", fontSize: "17px", lineHeight: 1.6, maxWidth: "70ch", margin: "16px 0" } }, e.text));
  // the teacher's band goes here, after marking
  const sel = h("select", { "aria-label": "Band from your teacher" }, [h("option", { value: "" }, "Not scored"), ...Array.from({ length: 15 }, (_, i) => 3 + i * 0.5).reverse().map((b) => h("option", { value: b, selected: e.bands?.overall === b }, b.toFixed(1)))]);
  root.append(h("section", { class: "section" }, h("div", { class: "shead" }, h("h2", null, "Band from your teacher")),
    h("div", { class: "row-actions" }, sel, h("button", { class: "btn", onclick: async () => {
      e.bands = { ...(e.bands || {}), overall: sel.value ? Number(sel.value) : null }; await db.put("essays", e);
      const skill = e.part === 1 ? "writing1" : "writing2";
      const old = store.S.scores.find((s) => s.essayId === e.id); if (old) await store.removeScore(old.id);
      if (sel.value) await store.addScore({ skill, band: Number(sel.value), essayId: e.id, note: e.promptId || "Essay" });
      toast("Saved. Your writing estimate has updated.");
    } }, "Save band"))));
  root.append(h("section", { class: "section" }, h("div", { class: "shead" }, h("h2", null, "Add a mistake to the error log")), errorForm(e)));
  root.append(h("div", { class: "row-actions", style: { marginTop: "20px" } },
    h("a", { class: "btn", href: `#/write?part=${e.part}&min=${e.part === 1 ? 20 : 40}&rewrite=1${e.promptId ? "&p=" + e.promptId : ""}` }, "Rewrite this"),
    h("button", { class: "btn danger", onclick: async () => { await db.del("essays", e.id); location.hash = "#/write?view=history"; } }, "Delete")));
  return root;
}
