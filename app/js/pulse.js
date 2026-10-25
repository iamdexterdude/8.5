// The pulse of her days: when she comes, how late she works, what is waiting. From that, one observation and one
// next small thing for Today, and a few habit numbers for the teacher. Everything is computed from what is already on
// the device; the only new record is the list of visits.
import * as store from "./store.js";
import * as db from "./db.js";
import * as hw from "./homework.js";
import * as M from "./mocks.js";
import { todayISO, addDays, diffDays, dowOf, fmtShort } from "./util.js";
import { hourNow, slotOf, seedRandom, pick } from "./checkin.js";

const TZ = "Asia/Tashkent";
const dayOf = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(iso));
const hourOf = (iso) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }).format(new Date(iso))) % 24;
const isLate = (iso) => { const h = hourOf(iso); return h >= 23 || h < 5; };
const hh = (h) => `${String(h).padStart(2, "0")}:00`;

// ---------- visits: when she opens the app (one every 20 minutes at most, the last 100 kept) ----------
export async function noteVisit() {
  const v = store.S.kv.visits || [], last = v[v.length - 1];
  if (last && Date.now() - Date.parse(last) < 20 * 60000) return;
  await store.setSetting("visits", [...v, new Date().toISOString()].slice(-100));
}

// every moment she did something, in the last N days
async function moments(days = 14) {
  const since = Date.now() - days * 86400000, out = [];
  for (const t of store.S.kv.visits || []) if (Date.parse(t) >= since) out.push({ at: t, kind: "visit" });
  for (const r of Object.values(store.S.hw)) if (r.completedAt && Date.parse(r.completedAt) >= since) out.push({ at: r.completedAt, kind: "homework", date: r.date });
  for (const m of store.S.mocks) if (m.finishedAt && Date.parse(m.finishedAt) >= since) out.push({ at: m.finishedAt, kind: "mock" });
  for (const c of store.S.checkins) if (Date.parse(c.at) >= since) out.push({ at: c.at, kind: "checkin" });
  try { for (const l of await db.all("reviewlog")) if (Date.parse(l.at) >= since) out.push({ at: l.at, kind: "review" }); } catch {}
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

// ---------- habits: the numbers behind the observations (also sent to the teacher) ----------
export async function habits(days = 14) {
  const ms = await moments(days), today = todayISO(), week = addDays(today, -6);
  const byDay = {}; for (const m of ms) (byDay[dayOf(m.at)] ||= []).push(m);
  const lateDays = Object.entries(byDay).filter(([, l]) => l.some((m) => isLate(m.at))).map(([d]) => d);
  const starts = Object.values(byDay).map((l) => hourOf(l[0].at));
  let usualHour = null;   // the hour she most often starts, once there are enough days to say
  if (starts.length >= 5) { const c = {}; for (const h of starts) c[h] = (c[h] || 0) + 1; usualHour = Number(Object.entries(c).sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0]); }
  const hwDone = Object.values(store.S.hw).filter((r) => r.completedAt && r.date >= addDays(today, -days));
  return {
    days: Object.keys(byDay).length, activeDays7: Object.keys(byDay).filter((d) => d >= week).length,
    lateDays7: lateDays.filter((d) => d >= week).length, lateDays14: lateDays.length, usualHour,
    reviews7: ms.filter((m) => m.kind === "review" && dayOf(m.at) >= week).length,
    hwDone: hwDone.length, hwLate: hwDone.filter((r) => dayOf(r.completedAt) > addDays(r.date, 1)), hwNight: hwDone.filter((r) => isLate(r.completedAt)).length,
    lastActive: ms.length ? dayOf(ms[ms.length - 1].at) : null, todayActive: !!byDay[today],
  };
}

// ---------- the last seven days in numbers ----------
export async function weekStats() {
  const today = todayISO(), from = addDays(today, -6), act = store.activeDates();
  const days = Array.from({ length: 7 }, (_, i) => { const iso = addDays(today, -(6 - i)); return { iso, on: act.has(iso), today: iso === today }; });
  const srs = await import("./srs.js");
  const by = await srs.reviewsByDay(7);
  const reviews = Object.entries(by).filter(([d]) => d >= from).reduce((a, [, n]) => a + n, 0);
  const homework = Object.values(store.S.hw).filter((r) => r.completedAt && dayOf(r.completedAt) >= from).length;
  const mocks = store.S.mocks.filter((m) => m.finishedAt && dayOf(m.finishedAt) >= from).length;
  return { days, reviews, homework, mocks, active: days.filter((d) => d.on).length };
}

// ---------- the next small thing: what is waiting, or something small when nothing is ----------
const MOCK_MIN = { listening: "About 30 minutes, then two to check.", reading: "60 minutes. Keep the clock in view.", writing: "60 minutes for both tasks.", speaking: "About 14 minutes, recorded." };
export async function nextStep() {
  const today = todayISO(), y = addDays(today, -1), sunday = dowOf(today) === 0;
  const homework = hw.homeworkFor(today), hy = hw.homeworkFor(y);
  if (homework && !hw.dayProgress(today, homework).complete) {
    const p = hw.dayProgress(today, homework);
    return { kind: "homework", k: "Today's homework", title: p.stepsDone ? `${p.steps - p.stepsDone} of ${p.steps} steps left` : `${p.steps} steps, ${p.tasks} ${p.tasks === 1 ? "task" : "tasks"}`, why: "Done today it settles. Done on the lesson day it is only rushed.", href: "#/homework", btn: p.stepsDone ? "Continue" : "Open" };
  }
  if (hy && !hw.dayProgress(y, hy).complete) return { kind: "homework", k: "Yesterday's homework", title: "Still open", why: "Twenty minutes now beats an hour on the lesson day.", href: `#/homework/${y}`, btn: "Finish it" };
  const mocks = [...(hw.F.mocks || [])].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  for (const m of mocks) {
    const next = M.SECTIONS.find((s) => M.attempt(m.id, s)?.status !== "done");
    if (!next) continue;
    const started = M.SECTIONS.some((s) => M.attempt(m.id, s)?.status === "done");
    return { kind: "mock", k: started ? "Your mock, unfinished" : "A mock is waiting", title: `${m.title || m.id}: ${M.LABEL[next]}`, why: MOCK_MIN[next], href: `#/exam/${encodeURIComponent(m.id)}/${next}`, btn: M.attempt(m.id, next) ? "Continue" : "Start" };
  }
  const srs = await import("./srs.js");
  const due = srs.dueCount();
  if (due) return { kind: "anki", k: sunday ? "Sunday. A little, anyway" : "Cards due", title: `${due} ${due === 1 ? "card" : "cards"} to review`, why: `About ${Math.max(1, Math.round(due / 6))} ${due < 9 ? "minute" : "minutes"}. ${sunday ? "Not work, maintenance." : "Then the day is clear."}`, href: "#/anki/study", btn: "Review" };
  // nothing is waiting: one small thing, chosen for the day
  const rnd = seedRandom(today + "step"), k = sunday ? "Sunday. Nothing required" : "Nothing is waiting", ideas = [];
  if (store.S.decks.length) ideas.push({ k, title: "Three new cards from this week", why: "A phrase you heard, a word you looked up, a collocation from the lesson.", href: "#/anki", btn: "Add cards" });
  else ideas.push({ k, title: "Your first deck", why: "Five cards make a deck. Name it after this week's lesson.", href: "#/anki", btn: "New deck" });
  const known = store.S.decks.filter((d) => srs.deckStats(d.id).started >= 8);
  if (known.length) { const d = pick(known, rnd); ideas.push({ k, title: `Run through “${d.name}” once`, why: "Cards you know well still like a visit. No grades, just reading.", href: `#/anki/study/${encodeURIComponent(d.id)}?all=1`, btn: "Practise" }); }
  const past = hw.homeworkDays().filter((d) => d < today);
  if (past.length) ideas.push({ k, title: "Read the last sample answer again", why: "The second reading is where the phrases move in.", href: `#/homework/${past[0]}`, btn: "Open" });
  if (store.S.mocks.some((m) => m.section === "speaking" && m.recordings?.length)) ideas.push({ k, title: "Listen to your own Part 2", why: "Hear one thing to fix. Just one.", href: "#/progress", btn: "Listen" });
  return { kind: "idea", ...pick(ideas, rnd) };
}

// ---------- one observation: something true about her days, said once, kindly ----------
const SEEN = "pulse-seen";   // key -> the day she answered or dismissed it
export async function noticed({ lesson, step }) {
  const today = todayISO(), slot = slotOf(), hour = hourNow(), hb = await habits(14), seen = store.S.kv[SEEN] || {};
  const fresh = (key) => !seen[key] || diffDays(seen[key], today) >= 3;
  const streak = store.streak(today), time = store.lessonTime(), rnd = seedRandom(today + slot + "pulse");
  const list = [];
  const add = (key, pr, texts, extra = {}) => { if (fresh(key)) list.push({ key, pr, text: pick(texts, rnd), ...extra }); };

  if (slot === "late") add("now-late", 5, [
    "It is past ten. One short thing, then sleep. Tomorrow-you studies better rested.",
    "Late. Whatever you do now, keep it to ten minutes; the rest keeps until morning.",
    "Past ten. Night brains lose spelling first; keep it short and kind."], { reply: ["Ten minutes, then bed", "Just looking in"] });
  if (slot === "night") add("now-late", 5, [
    "The small hours are kind to nobody's spelling. Something short, then bed.",
    "It is the middle of the night. Close this and sleep; the cards will be here at breakfast."], { reply: ["Going to sleep", "Cannot sleep anyway"] });
  if (hb.lastActive && !hb.todayActive && diffDays(hb.lastActive, today) >= 3) add("away", 5, [
    `${diffDays(hb.lastActive, today)} days away. No lecture; the cards waited. Start with five.`,
    `Back after ${diffDays(hb.lastActive, today)} days. The first ten minutes are the hard ones; the rest come by themselves.`], { href: "#/anki", btn: "Five cards" });
  if (!hb.todayActive && streak >= 3 && (slot === "evening" || slot === "late")) add("chain", 4, [
    `${streak} days in a row, and today is still empty. Five cards keep the chain.`,
    `The chain is at ${streak}. Tonight it needs five minutes, not fifty.`], { href: "#/anki", btn: "Keep it" });
  if (hb.lateDays7 >= 3) add("late-pattern", 4, [
    `${hb.lateDays7} of the last seven evenings you were here after eleven. Late brains lose spelling first. Try the same work at nine and compare.`,
    `After eleven on ${hb.lateDays7} of the last seven days. Nothing wrong with night owls, but the exam is in the morning.`], { reply: ["Fair", "Night is my only quiet time"] });
  if (hb.hwNight >= 2) add("hw-night", 4, [
    `Homework keeps getting finished around midnight. The lesson is at ${time}; the afternoon before it is wide open.`,
    `Two homeworks handed in after eleven. The work is the same at six; the sleep is not.`], { reply: ["Noted", "Afternoons are full"] });
  if (hb.hwLate.length && step?.kind !== "homework") { const r = hb.hwLate[hb.hwLate.length - 1]; add("hw-late", 3, [
    `The homework for ${fmtShort(r.date)} came in ${diffDays(r.date, dayOf(r.completedAt))} days after its day. Memory holds less of what is rushed.`,
    `${fmtShort(r.date)}'s homework arrived late. One late day is nothing; a habit is something.`], { reply: ["Noted", "That week was heavy"] }); }
  if (step?.kind === "anki" && /^\d+/.test(step.title) && Number(step.title.match(/^\d+/)[0]) >= 25) add("piling", 2, [
    `${step.title.match(/^\d+/)[0]} cards are waiting, which means some are slipping. Ten now, ten tonight.`], { href: "#/anki/study", btn: "Ten now" });
  if (hb.usualHour != null && hour <= hb.usualHour - 3 && slot !== "night") add("early", 2, [
    `You usually come by around ${hh(hb.usualHour)}. Today you are early. The quiet hours are the good ones.`], { reply: ["Trying something", "Just passing"] });
  if (hb.activeDays7 >= 6 && hb.todayActive) add("steady", 2, [
    `${hb.activeDays7} of the last seven days. This is what 8.5 is made of.`,
    `Every day this week but one, or none. Steady beats brilliant.`], { reply: ["Keeping it", "Thank you"] });
  if (dowOf(today) === 1 && (slot === "morning" || slot === "midday") && hb.reviews7 + hb.hwDone) add("week", 2, [
    `Last week: ${hb.reviews7} reviews, ${hb.hwDone} ${hb.hwDone === 1 ? "homework" : "homeworks"}, ${hb.activeDays7} active days. New week, same chair.`], {});
  if (lesson.phase === "soon" && !hb.todayActive) add("warm", 3, [
    "Lesson soon and nothing warmed up. Five cards before we start, so the English is already running."], { href: "#/anki/study", btn: "Warm up" });
  if (!list.length) return null;
  list.sort((a, b) => b.pr - a.pr || rnd() - 0.5);
  return list[0];
}
export async function answerNoticed(obs, text) {
  const today = todayISO();
  await store.setSetting(SEEN, { ...(store.S.kv[SEEN] || {}), [obs.key]: today });
  if (!text) return null;
  const row = { id: "ci-" + Date.now().toString(36), date: today, at: new Date().toISOString(), key: "pulse-" + obs.key, prompt: obs.text, answer: String(text).trim().slice(0, 400), slot: slotOf() };
  await store.saveCheckin(row);
  return row;
}
