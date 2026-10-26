// Settings: name, theme, lesson time, her data, installing the app. Short on purpose.
import { h, icon, todayISO } from "../util.js";
import * as store from "../store.js";
import * as db from "../db.js";
import { head, toast, confirmSheet } from "../ui.js";
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
  root.append(h("section", { class: "section", style: { marginTop: 0 } }, h("div", { class: "shead" }, h("h2", null, "You")),
    text("name", "Your name", { autocomplete: "given-name", maxLength: 40, placeholder: "Your first name" }),
    h("div", { class: "field" }, h("div", { class: "lbl" }, "Theme"), h("div", { class: "seg", role: "group", "aria-label": "Theme" }, [["system", "System"], ["light", "Light"], ["dark", "Dark"]].map(([k, l]) => h("button", { "aria-pressed": String(store.setting("theme") === k), onclick: async (e) => { const me = e.currentTarget, group = me.parentElement; await store.setSetting("theme", k); group.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === me))); } }, l))))));

  const time = h("input", { type: "time", value: store.lessonTime(), "aria-label": "Lesson start time" }); time.addEventListener("change", () => store.setSetting("lessonTime", time.value || "19:00"));
  root.append(h("section", { class: "section" }, h("div", { class: "shead" }, h("h2", null, "Lessons")),
    h("p", { class: "small muted" }, `Lesson days: ${store.lessonDays().map((d) => ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][d]).join(", ")}. Your teacher sets these.`),
    h("div", { class: "field" }, h("label", null, "Lesson start time (Tashkent)"), time),
    text("meetingLink", "Lesson link", { type: "url", inputMode: "url", placeholder: "https://" })));

  root.append(installSection());

  const importIn = h("input", { type: "file", accept: "application/json,.json", "aria-label": "Choose a backup file", onchange: async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { const obj = JSON.parse(await f.text()); confirmSheet("Replace your data?", "This replaces what is on this device with the backup.", "Replace my data", async () => { await store.importAll(obj); toast("Backup loaded."); location.hash = "#/today"; }); }
    catch (err) { toast(err.message || "That file could not be read."); }
  } });
  const st = db.status();
  root.append(h("section", { class: "section" }, h("div", { class: "shead" }, h("h2", null, "Your data")),
    h("p", { class: "small muted" }, "Everything lives on this device: cards, mock results, recordings. Export a backup to move to a new phone."),
    st.persistent ? null : h("p", { class: "small", style: { color: "var(--warn)" } }, `Saving on this device is not working right now${st.problem ? " (" + st.problem + ")" : ""}. The app keeps trying.`),
    h("div", { class: "row-actions" }, h("button", { class: "btn primary", onclick: async () => { const data = await store.exportAll(); download(`8.5-backup-${todayISO()}.json`, JSON.stringify(data)); toast("Backup saved to your downloads."); } }, icon("download", 18), "Export my data")),
    h("div", { class: "field", style: { marginTop: "14px" } }, h("label", null, "Import a backup"), importIn),
    h("div", { style: { marginTop: "12px" } }, h("button", { class: "btn danger", onclick: () => confirmSheet("Start again?", "This deletes your cards, results and recordings on this device.", "Delete and start again", async () => { await store.resetAll(); toast("Reset."); location.hash = "#/today"; }, { danger: true }) }, "Delete my data"))));
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
  else if (ios) sec.append(h("p", null, "On iPhone: open this page in Safari, tap Share, then Add to Home Screen."));
  else sec.append(h("p", null, "On Chrome or Edge: open the browser menu and choose Install 8.5. On Android: menu, then Add to Home screen."));
  return sec;
}
