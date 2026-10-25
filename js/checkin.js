// Today's check-in: one short, human line and one small question, chosen for the moment of the day and the lesson.
// Nothing repeats for weeks; what she answers is kept on the device and reaches the teacher as one line.
import * as store from "./store.js";
import { todayISO, dowOf } from "./util.js";

// time of day in Tashkent
export function hourNow() { return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tashkent", hour: "2-digit", hour12: false }).format(new Date())) % 24; }
export function slotOf(hr = hourNow()) { return hr < 5 ? "night" : hr < 11 ? "morning" : hr < 15 ? "midday" : hr < 18 ? "afternoon" : hr < 22 ? "evening" : "late"; }

// ---------- the greeting: the first line she sees ----------
const GREET = {
  morning: ["Morning, {name}.", "Early light, {name}.", "A new page, {name}.", "Up and about, {name}.", "Good morning, {name}.", "Hello, {name}. Slow start or sharp start?"],
  midday: ["Midday, {name}.", "Hello, {name}.", "Halfway through the day, {name}.", "Afternoon is close, {name}."],
  afternoon: ["Afternoon, {name}.", "Hello again, {name}.", "The quiet part of the day, {name}.", "Still here, {name}. Good."],
  evening: ["Evening, {name}.", "Good evening, {name}.", "Lamps on, {name}.", "The day is settling, {name}."],
  late: ["Late one, {name}.", "Still awake, {name}.", "Night owl hours, {name}.", "Past ten, {name}. Keep it short."],
  night: ["Very late, {name}.", "It is the middle of the night, {name}.", "Small hours, {name}. Be kind to tomorrow."],
};
// a second line that depends on what the day holds
const SUB = {
  lessonDay: ["Lesson tonight at {time}.", "We meet at {time}.", "Class at {time}. Nothing to prepare but yourself.", "At {time} we talk."],
  lessonSoon: ["Lesson in {in}. Water, notebook, a good chair.", "We start in {in}.", "{in} to go. Warm your voice up."],
  during: ["We are in the lesson now.", "The lesson is on. See you on the other side."],
  after: ["Lesson done. How did it land?", "That was the lesson. One minute for a thought?", "Lesson over. Let it settle for a moment."],
  rest: ["No lesson today.", "A day without a lesson. Use it however you like.", "A free day. Even a little counts."],
  streak: ["{streak} days in a row. Quietly impressive.", "Day {streak} of showing up.", "{streak} active days without a gap."],
  hwDone: ["Homework is in. The evening is yours.", "Everything sent. Nothing hanging.", "All submitted. Good."],
  sunday: ["Sunday. Rest is part of the plan.", "Sunday. Nothing is required of you today."],
};

// ---------- the one small question ----------
// kind: text (a line), chips (one tap), scale (three taps). Keys are stable so nothing repeats too soon.
export const PROMPTS = [
  // after the lesson
  { key: "keep", when: ["after"], kind: "text", q: "One thing from tonight's lesson you want to keep.", ph: "A phrase, a method, a moment" },
  { key: "unclear", when: ["after"], kind: "text", q: "Was anything still blurry when we finished?", ph: "Say it plainly, it helps the next lesson" },
  { key: "pace", when: ["after"], kind: "chips", q: "The pace tonight was", opts: ["Too fast", "Just right", "Could go faster"] },
  { key: "wish", when: ["after"], kind: "text", q: "If we had ten more minutes, what should we have done with them?", ph: "More Part 3? Fewer examples? Something else?" },
  { key: "change", when: ["after"], kind: "text", q: "What would you change about how we did it tonight?", ph: "Be honest. Nothing is taken personally." },
  { key: "useful", when: ["after"], kind: "chips", q: "The most useful part was", opts: ["Speaking", "Writing", "Reading", "Listening", "The talk around it"] },
  { key: "energy", when: ["after"], kind: "chips", q: "After the lesson you feel", opts: ["Lighter", "Tired", "Fired up", "The same"] },
  // before the lesson
  { key: "want", when: ["day", "soon"], kind: "text", q: "What do you want out of tonight's lesson?", ph: "One sentence is enough" },
  { key: "shaky", when: ["day", "soon", "none"], kind: "chips", q: "Which part feels shakiest right now?", opts: ["Listening", "Reading", "Writing", "Speaking"] },
  { key: "ask", when: ["day", "soon"], kind: "text", q: "A question you want answered tonight.", ph: "Write it now, so it is not forgotten" },
  { key: "ready", when: ["soon"], kind: "chips", q: "How ready do you feel?", opts: ["Very", "Mostly", "Not really"] },
  // mornings and free days
  { key: "start", when: ["none", "day"], slots: ["morning"], kind: "chips", q: "One word for how you are starting today.", opts: ["Fresh", "Tired", "Focused", "Scattered"] },
  { key: "first", when: ["none", "day"], slots: ["morning", "midday"], kind: "chips", q: "First thing today", opts: ["Homework", "Anki", "A mock", "Not yet"] },
  { key: "minutes", when: ["none", "day"], slots: ["morning", "midday", "afternoon"], kind: "chips", q: "Minutes you can give English today, honestly.", opts: ["15", "30", "60", "More"] },
  { key: "english", when: ["none", "day"], kind: "text", q: "Where did English show up for you today, outside study?", ph: "A song, a video, a sign, a conversation" },
  { key: "word", when: ["none", "day", "after"], kind: "text", q: "A word or phrase you met this week that you like.", ph: "It goes nowhere unless you write it down" },
  // evenings
  { key: "day-went", when: ["none"], slots: ["evening", "late"], kind: "chips", q: "Did the day go the way you wanted?", opts: ["Yes", "Mostly", "Not really"] },
  { key: "proud", when: ["none", "after"], slots: ["evening", "late"], kind: "text", q: "One small thing you did well today.", ph: "Small counts" },
  { key: "tomorrow", when: ["none", "after"], slots: ["evening", "late"], kind: "text", q: "One thing you want tomorrow-you to remember.", ph: "A note to yourself" },
  // the app
  { key: "app", when: ["none", "day", "after"], kind: "text", q: "Anything in this app you would change?", ph: "A button, a word, a screen. Say it." },
  { key: "missing", when: ["none", "after"], kind: "text", q: "What is missing from the course so far?", ph: "A topic, a skill, a kind of practice" },
];

const RECENT_KEY = "checkin-recent";
function recent() { return store.S.kv[RECENT_KEY] || []; }
async function remember(key) { const r = [key, ...recent().filter((k) => k !== key)].slice(0, 14); await store.setSetting(RECENT_KEY, r); }

// a small deterministic random so a screen does not change under her hand within the same hour
export function seedRandom(seed) { let x = 0; for (const c of seed) x = (x * 31 + c.charCodeAt(0)) >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; }
export const pick = (list, rnd) => list[Math.floor(rnd() * list.length)];

export function greeting({ name, lesson, streak, hwDone }) {
  const t = todayISO(), slot = slotOf(), rnd = seedRandom(t + slot);
  const line = pick(GREET[slot], rnd).replace("{name}", name || "there").replace(", there", "");
  let subs = [];
  if (dowOf(t) === 0) subs = SUB.sunday;
  else if (lesson.phase === "soon") subs = SUB.lessonSoon;
  else if (lesson.phase === "during") subs = SUB.during;
  else if (lesson.phase === "after") subs = SUB.after;
  else if (lesson.phase === "day") subs = SUB.lessonDay;
  else subs = SUB.rest;
  if (hwDone && rnd() < 0.5) subs = SUB.hwDone;
  else if (streak >= 3 && rnd() < 0.35) subs = SUB.streak;
  const time = store.lessonTime();
  const inText = lesson.ms > 0 ? (lesson.ms > 3600000 ? `${Math.floor(lesson.ms / 3600000)} h ${Math.round((lesson.ms % 3600000) / 60000)} min` : `${Math.max(1, Math.round(lesson.ms / 60000))} min`) : "";
  const sub = pick(subs, rnd).replace("{time}", time).replace("{in}", inText).replace("{streak}", String(streak));
  return { line, sub };
}

// which question to ask now: fits the lesson phase and the hour, was not asked lately, and at most two a day
export function promptFor({ lesson }) {
  const t = todayISO(), slot = slotOf();
  const todays = store.S.checkins.filter((c) => c.date === t);
  if (todays.length >= 2) return null;
  const askedToday = new Set(todays.map((c) => c.key));
  const phase = lesson.phase === "during" ? null : lesson.phase;
  if (!phase) return null;
  const lately = new Set(recent());
  const fits = PROMPTS.filter((p) => p.when.includes(phase) && (!p.slots || p.slots.includes(slot)) && !askedToday.has(p.key));
  let pool = fits.filter((p) => !lately.has(p.key)); if (!pool.length) pool = fits;
  if (!pool.length) return null;
  // after a lesson the lesson questions come first
  if (phase === "after") { const l = pool.filter((p) => p.when.length === 1 && p.when[0] === "after"); if (l.length) pool = l; }
  const rnd = seedRandom(t + slot + String(todays.length));
  return pick(pool, rnd);
}

export async function answer(prompt, text) {
  const row = { id: "ci-" + Date.now().toString(36), date: todayISO(), at: new Date().toISOString(), key: prompt.key, prompt: prompt.q, answer: String(text).trim().slice(0, 400), slot: slotOf() };
  await store.saveCheckin(row); await remember(prompt.key);
  return row;
}

// a short closing line after she answers
export function thanks(prompt) {
  const rnd = seedRandom(prompt.key + todayISO());
  return pick(["Noted.", "Got it.", "Thank you. That goes to your teacher.", "Kept.", "Good to know.", "Written down."], rnd);
}
