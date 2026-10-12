// Calendar export (.ics) of lessons, test days and checkpoints, with reminders 60 and 15 minutes before lessons.
import * as store from "./store.js";
import { lessonMoment, addDays } from "./util.js";

const utc = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const day = (iso) => iso.replace(/-/g, "");
const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

export function buildIcs() {
  const S = store.S, link = store.setting("meetingLink"), mins = Number(store.setting("lessonMinutes")) || 90;
  const out = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Eight//IELTS Month 1//EN", "CALSCALE:GREGORIAN", "X-WR-CALNAME:Eight, IELTS Month 1"];
  const stamp = utc(new Date());
  for (const d of S.plan.days) {
    if (d.lessonNo) {
      const start = store.lessonStart(d), end = new Date(start.getTime() + mins * 60000);
      out.push("BEGIN:VEVENT", `UID:eight-lesson-${d.lessonNo}@eight`, `DTSTAMP:${stamp}`, `DTSTART:${utc(start)}`, `DTEND:${utc(end)}`,
        `SUMMARY:${esc(`IELTS Lesson ${d.lessonNo}: ${d.lessonTitle}`)}`, link ? `URL:${link}` : null, link ? `LOCATION:${esc(link)}` : null);
      for (const m of [60, 15]) out.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:Lesson ${d.lessonNo} in ${m} minutes`, `TRIGGER:-PT${m}M`, "END:VALARM");
      out.push("END:VEVENT");
    } else if (["test", "fullmock", "light"].includes(d.type)) {
      out.push("BEGIN:VEVENT", `UID:eight-day-${d.date}@eight`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${day(d.date)}`, `DTEND;VALUE=DATE:${day(addDays(d.date, 1))}`,
        `SUMMARY:${esc(d.checkpoint ? `IELTS ${d.title}` : `IELTS ${d.title}`)}`, "END:VEVENT");
    }
  }
  out.push("END:VCALENDAR");
  return out.filter(Boolean).join("\r\n");
}
export function downloadIcs() {
  const blob = new Blob([buildIcs()], { type: "text/calendar" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "eight-month-1.ics" });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
