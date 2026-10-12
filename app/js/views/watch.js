// "Watch tonight": course videos picked for the day (needs the private course pack).
import { h, icon } from "../util.js";
import * as store from "../store.js";

export function watchRow(v, date) {
  const key = `${date}|watch|${v.id}`; const done = store.isDone(key);
  return h("li", null, h("div", { class: "row video-row" + (done ? " done" : "") },
    h("div", { class: "vthumb" }, icon("video")),
    h("div", { class: "grow" }, h("div", { class: "title" }, v.title), h("div", { class: "sub" }, `${v.minutes} min, ${v.course}`, v.why ? ` — ${v.why}` : "")),
    h("a", { class: "btn small", href: v.url, target: "_blank", rel: "noopener" }, "Open in Telegram"),
    h("button", { class: "btn small quiet", "aria-pressed": String(done), onclick: () => (done ? store.unmarkDone(key) : store.markDone(key)) }, done ? "Watched" : "Mark watched")));
}

export default async function () { return h("div"); }
