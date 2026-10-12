// Practice: the studios. One question: "Which skill do I want to work on?"
import { h, icon, todayISO } from "../util.js";
import * as store from "../store.js";
import { head } from "../ui.js";

export default async function () {
  const S = store.S, today = todayISO();
  const date = store.dayByDate(today) ? today : S.plan.start;
  const info = S.bank.days[date] || {};
  const root = h("div");
  root.append(head("Practice", { sub: "Pick a skill" }));
  const tile = (title, sub, href, ic, cls) => h("li", null, h("a", { class: "row", href, style: { minHeight: "68px" } },
    h("div", { class: "vthumb", style: { width: "44px", height: "44px", borderRadius: "12px", display: "grid", placeItems: "center", flex: "none", background: `var(--${cls}-soft, var(--surface-2))`, color: `var(--${cls}, var(--accent))` } }, icon(ic, 22)),
    h("div", { class: "grow" }, h("div", { class: "title" }, title), h("div", { class: "sub" }, sub)), icon("chevron", 18)));
  root.append(h("ul", { class: "rows" },
    tile("Speaking studio", "Part 1, Part 2 cue cards, Part 3 and a full mock. Record and listen back.", "#/speak", "mic", "turq"),
    tile("Writing studio", "Task 1 and Task 2 in a plain, timed editor", "#/write", "pen", "accent"),
    tile("Reading", "A 20-minute passage or a 60-minute test, then log it", "#/read?min=20", "book", "warn"),
    tile("Timers", "Listening tests and anything else that is timed", "#/timer?m=40&label=Listening", "clock", "accent")));

  root.append(h("section", { class: "section" }, h("div", { class: "shead" }, h("h2", null, "Quick starts")),
    h("div", { class: "row-actions" },
      info.cards?.length ? h("a", { class: "btn", href: `#/speak?mode=part2&card=${info.cards[0]}&from=${date}` }, icon("mic", 18), "Today's Part 2 card") : null,
      h("a", { class: "btn", href: `#/speak?mode=part1&from=${date}` }, "Part 1 round"),
      h("a", { class: "btn", href: "#/write?part=2&p=P12&min=40" }, "Spare Task 2 prompt"),
      h("a", { class: "btn", href: "#/write?view=history" }, "Your essays"))));
  return root;
}
