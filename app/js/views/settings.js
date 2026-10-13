// Settings: name, theme, lessons, review limits, exam date, calendar, her data, the course pack, installing the app.
import { h, icon, todayISO } from "../util.js";
import * as store from "../store.js";
import * as db from "../db.js";
import { head, toast, confirmSheet } from "../ui.js";
import { downloadIcs } from "../ics.js";
import { reportCard } from "../report.js";
import * as hw from "../homework.js";

export const live = false;

export default async function (ctx) {
  const root = h("div");
  root.append(head("Settings", { back: "#/today" }));

  const text = (key, label, props = {}) => {
    const el = h("input", { type: "text", value: store.setting(key) ?? "", "aria-label": label, ...props });
    el.addEventListener("change", () => store.setSetting(key, el.value.trim()));
    return h("div", { class: "field" }, h("label", null, label), el);
  };
  const num = (key, label, min, max) => {
    const el = h("input", { type: "number", min, max, inputMode: "numeric", value: store.setting(key), "aria-label": label });
    el.addEventListener("change", () => { const v = Math.min(max, Math.max(min, Number(el.value) || min)); el.value = v; store.setSetting(key, v); });
    return h("div", { class: "field" }, h("label", null, label), el);
  };

  // you
  root.append(h("section", { class: "section", style: { marginTop: 0 } }, h("div", { class: "shead" }, h("h2", null, "You")),
    text("name", "Your name", { autocomplete: "given-name", maxLength: 40, placeholder: hw.F.config?.student || "" }),
    h("div", { class: "field" }, h("div", { class: "lbl" }, "Theme"), h("div", { class: "seg", role: "group", "aria-label": "Theme" }, [["system", "System"], ["light", "Light"], ["dark", "Dark"]].map(([k, l]) => h("button", { "aria-pressed": String(store.setting("theme") === k), onclick: async (e) => { const me = e.currentTarget, group = me.parentElement; await store.setSetting("theme", k); group.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === me))); } }, l))))));

  // lessons
  const time = h("input", { type: "time", value: store.setting("lessonTime"), "aria-label": "Lesson start time" }); time.addEventListener("change", () => store.setSetting("lessonTime", time.value || "19:00"));
  root.append(h("section", { class: "section" }, h("div", { class: "shead" }, h("h2", null, "Lessons")),
    h("div", { class: "field" }, h("label", null, "Lesson start time (Tashkent time)"), time),
    text("meetingLink", "Lesson link (Zoom, Meet or Telegram call)", { type: "url", inputMode: "url", placeholder: "https://" }),
    h("p", { class: "small muted" }, "The Join lesson button appears on Today 15 minutes before a lesson. Your teacher can also set these for you."),
    h("button", { class: "btn", onclick: downloadIcs }, icon("download", 18), "Add lessons to your calendar (.ics)")));

  // exam
  const exam = h("input", { type: "date", value: store.setting("examDate") || "", "aria-label": "Exam date" }); exam.addEventListener("change", () => store.setSetting("examDate", exam.value));
  const fmt = h("select", { "aria-label": "Exam format", onchange: (e) => store.setSetting("examFormat", e.target.value) }, [["", "Not sure yet"], ["computer", "Computer-delivered"], ["paper", "Paper-based"]].map(([v, l]) => h("option", { value: v, selected: (store.setting("examFormat") || "") === v }, l)));
  root.append(h("section", { class: "section" }, h("div", { class: "shead" }, h("h2", null, "Exam")),
    h("div", { class: "field" }, h("label", null, "Exam date"), exam), h("div", { class: "field" }, h("label", null, "Exam format"), fmt)));

  // review
  root.append(h("section", { class: "section" }, h("div", { class: "shead" }, h("h2", null, "Review")), num("newCardsPerDay", "New cards per day (0 means no limit)", 0, 500), num("quickReviewMinutes", "Quick review length, minutes", 1, 20),
    h("p", { class: "small muted" }, "Cards are scheduled with FSRS for 90% retention.")));

  // install
  root.append(installSection());

  // data
  const importIn = h("input", { type: "file", accept: "application/json,.json", "aria-label": "Choose a backup file", onchange: async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { const obj = JSON.parse(await f.text()); confirmSheet("Replace your data?", "This replaces what is on this device with the backup. Export first if you are not sure.", "Replace my data", async () => { await store.importAll(obj); toast("Backup loaded."); location.hash = "#/today"; }); }
    catch (err) { toast(err.message || "That file could not be read."); }
  } });
  const st = db.status();
  root.append(h("section", { class: "section" }, h("div", { class: "shead" }, h("h2", null, "Your data")),
    h("p", { class: "small muted" }, "Everything you do lives on this device only: tasks, essays, recordings and scores. Export a backup now and then, and to move to a new phone."),
    st.persistent ? null : h("p", { class: "small", style: { color: "var(--warn)" } }, `Saving on this device is not working right now${st.problem ? " (" + st.problem + ")" : ""}. Your settings are kept, and the app keeps trying.`),
    h("div", { class: "row-actions" }, h("button", { class: "btn primary", onclick: async () => { const data = await store.exportAll(); download(`eight-backup-${todayISO()}.json`, JSON.stringify(data)); toast("Backup saved to your downloads."); } }, icon("download", 18), "Export my data")),
    h("div", { class: "field", style: { marginTop: "14px" } }, h("label", null, "Import a backup"), importIn),
    h("div", { style: { marginTop: "12px" } }, h("button", { class: "btn danger", onclick: () => confirmSheet("Start again?", "This deletes your progress, essays and recordings on this device and restores the plan's starting state.", "Delete and start again", async () => { await store.resetAll(); toast("Reset."); location.hash = "#/today"; }, { danger: true }) }, "Delete my data"))));

  root.append(reportCard());

  // course pack
  root.append(packSection(ctx));
  root.append(h("p", { class: "footer-note" }, "8.5 is private. No accounts, no tracking, and nothing leaves your device unless you send it. ", h("a", { href: "#/admin", class: "faint" }, "Teacher")));
  return root;
}

function download(name, content, type = "application/json") {
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([content], { type })), download: name });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}

function installSection() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent), standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  const sec = h("section", { class: "section" }, h("div", { class: "shead" }, h("h2", null, "Install the app")));
  if (standalone) { sec.append(h("p", { class: "muted" }, "8.5 is installed on this device.")); return sec; }
  if (window.__installPrompt) sec.append(h("button", { class: "btn primary", onclick: async () => { window.__installPrompt.prompt(); await window.__installPrompt.userChoice; window.__installPrompt = null; } }, "Install 8.5"));
  else if (ios) sec.append(h("p", null, "On iPhone: open this page in Safari, tap the Share button, then Add to Home Screen. Offline use works after that."));
  else sec.append(h("p", null, "On Chrome or Edge: open the browser menu and choose Install 8.5 (or Apps, then Install this site as an app). On Android: menu, then Add to Home screen."));
  return sec;
}

// The course pack: course-derived content that stays off the public site. It is loaded from a file and kept on this device.
function packSection(ctx) {
  const S = store.S, pack = S.pack, sec = h("section", { class: "section" }, h("div", { class: "shead" }, h("h2", null, "Course pack")));
  if (pack) {
    sec.append(h("p", null, `Loaded: ${pack.meta?.items || 0} course items, ${pack.cards?.length || 0} suggested cards, ${Object.keys(pack.watch || {}).length} days with videos.`),
      h("p", { class: "small muted" }, "The pack is private course material for you only. Please don't share it."),
      h("button", { class: "btn", onclick: () => confirmSheet("Remove the course pack?", "Today and Plan go back to the plan's own content.", "Remove", async () => { await store.removePack(); ctx.rerender(); }) }, "Remove the pack"));
  } else {
    const inp = h("input", { type: "file", accept: "application/json,.json", "aria-label": "Choose the course pack file", onchange: async (e) => { const f = e.target.files[0]; if (!f) return;
      try { const obj = JSON.parse(await f.text()); if (obj.kind !== "eight-course-pack") throw new Error("That is not a course pack file."); await store.savePack(obj); toast("Course pack loaded."); ctx.rerender(); } catch (err) { toast(err.message || "That file could not be read."); } } });
    sec.append(h("p", { class: "muted" }, "Your teacher can send you a course pack file. It adds the exact course lessons, videos to watch each evening, and vocabulary cards for each day."), h("div", { class: "field" }, h("label", null, "Load the course pack file"), inp));
  }
  return sec;
}
