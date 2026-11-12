// Nudges: short notifications that come from what she actually does, never from a timetable.
//
// 1. A log of moments (opening, leaving, recording, sending, a question answered) kept on the phone.
// 2. Her rhythm, read from that log, the Anki reviews and the homework: when her day starts and ends, the hours she
//    usually comes, a recurring short weekday visit (the ride in?), how fast she goes through cards.
// 3. Now and then one small question, asked only when the pattern is already there and only in that moment
//    ("Around this time on weekdays, you're usually..."). The answer shapes what comes next. Nothing is asked twice.
// 4. From all that, a plan for the next two days: a few notes, each about something real (an answer not sent, the next
//    question, cards due, the lesson coming), placed in her own hours, never at night, never during the lesson,
//    fewer when she ignores them. The plan goes to the relay, which only sends each note when its time comes.
//    A new plan replaces the old one every time she comes or goes, so a note about something she already did never arrives.
import * as store from "./store.js";
import * as db from "./db.js";
import * as hw from "./homework.js";
import * as srs from "./srs.js";
import { h } from "./util.js";

const VAPID = "BCS3udzX4xdZmZnlNwFJ3-i5bM7zTi5OzcVd12vjCILhrttybXgpzWpajstzJ0S0VmSXO_ewq8XfCYDt2GmSvw0";
const MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;

// ---------- the log ----------
const kvSet = (key, value) => { store.S.kv[key] = value; db.put("kv", { key, value }).catch(() => {}); };   // quietly: no re-render
export function track(e, d = 0) {
  const l = store.S.kv.life || [];
  l.push([Math.round(Date.now() / 1000), e, d]);
  kvSet("life", l.slice(-300));
}
const me = () => store.S.kv.me || {};
const setMe = (patch) => kvSet("me", { ...me(), ...patch });

// ---------- rhythm ----------
const mins = (t) => { const d = new Date(t); return d.getHours() * 60 + d.getMinutes(); };
const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
const weekend = (t) => [0, 6].includes(new Date(t).getDay());
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
const hhmm = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

async function sessions(days = 28) {
  const since = Date.now() - days * DAY, out = [];
  let open = null;
  for (const [t, e] of store.S.kv.life || []) {
    const ms = t * 1000; if (ms < since) continue;
    if (e === "open") { if (open) out.push({ s: open, e: open + 3 * MIN }); open = ms; }
    else if (e === "hide" && open) { out.push({ s: open, e: ms }); open = null; }
  }
  if (open) out.push({ s: open, e: Date.now() });
  // older visits (before the log existed) still say when she comes
  for (const v of store.S.kv.visits || []) { const ms = Date.parse(v); if (ms >= since && !out.some((x) => Math.abs(x.s - ms) < 20 * MIN)) out.push({ s: ms, e: ms + 5 * MIN }); }
  try { for (const r of await db.all("reviewlog")) { const ms = Date.parse(r.at); if (ms >= since && !out.some((x) => ms >= x.s - MIN && ms <= x.e + MIN)) out.push({ s: ms, e: ms + MIN }); } } catch {}
  return out.sort((a, b) => a.s - b.s);
}

export async function rhythm() {
  const ss = await sessions(), now = Date.now(), byDay = {};
  for (const x of ss) (byDay[dayKey(x.s)] ||= []).push(x);
  const days = Object.values(byDay).filter((l) => now - l[0].s < 21 * DAY);
  // her day: when the first visit and the last one usually are (late visits after midnight count for the day before)
  const firsts = days.map((l) => mins(l[0].s)).filter((m) => m >= 300);
  const lasts = days.map((l) => { const m = mins(l[l.length - 1].e); return m < 300 ? m + 1440 : m; });
  const owl = me().owl;
  let wake = firsts.length >= 4 ? Math.max(360, median(firsts) - 30) : 480;
  let sleep = lasts.length >= 4 ? Math.min(owl ? 1530 : 1440, median(lasts) + 30) : 1380;
  if (owl === false) sleep = Math.min(sleep, 1380);
  // on lesson days she is up at least until the lesson is over
  { const lm = Number(store.setting("lessonMinutes")) || 90, [lh, lmin] = String(store.lessonTime() || "22:00").split(":").map(Number); if (Number.isFinite(lh)) sleep = Math.max(sleep, Math.min(1500, lh * 60 + (lmin || 0) + lm + 20)); }
  // hours she comes, weighted so the last ten days count most
  const hist = { wd: Array(24).fill(0), we: Array(24).fill(0) };
  for (const x of ss) hist[weekend(x.s) ? "we" : "wd"][new Date(x.s).getHours()] += 0.5 ** ((now - x.s) / (10 * DAY));
  const top = (a) => a.map((w, h) => [h, w]).filter(([, w]) => w >= Math.max(0.6, Math.max(...a) * 0.3)).sort((a, b) => b[1] - a[1]).map(([h]) => h);
  // a short visit on weekdays at about the same time, on three different days in two weeks: an in-between moment
  let between = null;
  const shortWd = ss.filter((x) => !weekend(x.s) && now - x.s < 14 * DAY && x.e - x.s <= 7 * MIN && mins(x.s) >= 360 && mins(x.s) <= 1200);
  for (const x of shortWd) {
    const m = mins(x.s), near = shortWd.filter((y) => Math.abs(mins(y.s) - m) <= 25), dset = new Set(near.map((y) => dayKey(y.s)));
    if (dset.size >= 3 && (!between || dset.size > between.days)) between = { min: Math.round(median(near.map((y) => mins(y.s)))), days: dset.size };
  }
  // her pace with cards: the usual gap between two reviews in one sitting
  let pace = 18;
  try { const log = (await db.all("reviewlog")).map((r) => Date.parse(r.at)).sort((a, b) => a - b), gaps = [];
    for (let i = 1; i < log.length; i++) { const g = (log[i] - log[i - 1]) / 1000; if (g > 2 && g < 120) gaps.push(g); }
    if (gaps.length >= 20) pace = Math.round(median(gaps.slice(-400))); } catch {}
  // days in a row with something done
  let run = 0; for (let i = 1; i < 30; i++) { if (byDay[dayKey(now - i * DAY)]) run++; else break; }
  const midnight = new Date().setHours(0, 0, 0, 0);
  const today = (byDay[dayKey(now)] || []).some((x) => x.e - x.s > 2 * MIN) || (store.S.kv.life || []).some(([t, e]) => (e === "sent" || e === "review") && t * 1000 > midnight);
  const lastSeen = ss.length ? ss[ss.length - 1].e : 0;
  return { wake, sleep, hours: { wd: top(hist.wd), we: top(hist.we) }, between, pace, run, today, lastSeen, days: days.length };
}

// ---------- the small questions ----------
// Each one waits for its pattern, shows only in its moment, and is asked once. One at a time, one every few days.
const QUESTIONS = [
  { id: "between", when: (r, now) => r.between && !weekend(now) && Math.abs(mins(now) - r.between.min) <= 35 && me().betweenAt !== r.between.min,
    text: () => "Around this time on weekdays, you're usually…", options: [["On the way", { between: "move" }], ["At home", { between: "home" }]],
    save: (r, a) => setMe({ ...a, betweenAt: r.between.min }) },
  { id: "owl", when: (r, now) => { const m = mins(now); const late = (store.S.kv.life || []).filter(([t, e]) => e === "open" && Date.now() - t * 1000 < 10 * DAY && (mins(t * 1000) >= 1410 || mins(t * 1000) < 180)); return (m >= 1400 || m < 180) && new Set(late.map(([t]) => dayKey(t * 1000 - 5 * HOUR))).size >= 3 && me().owl == null; },
    text: () => "Late again. Is night when you think best?", options: [["Yes, nights", { owl: true }], ["Not really", { owl: false }]] },
  { id: "voice", when: () => { const l = store.S.kv.life || [], quiet = l.filter(([t, e]) => e === "mute" && Date.now() - t * 1000 < 14 * DAY); return quiet.length >= 2 && Date.now() - quiet[quiet.length - 1][0] * 1000 < 2 * MIN && me().voiceAsked == null; },
    text: () => "Hard to speak out loud right now?", options: [["People around", { noisy: "people" }], ["Just busy", { noisy: "busy" }]],
    save: (r, a) => { const hrs = new Set(me().noisyHours || []); if (a.noisy === "people") hrs.add(new Date().getHours()); setMe({ voiceAsked: Date.now(), noisyHours: [...hrs] }); } },
];
// shows one question as a small glass card above the tab bar, if one is due. Called from Today and after the speaking room.
export async function maybeAsk() {
  const m = me(), now = Date.now(), asked = m.asked || {};
  if (now - (m.lastAsk || 0) < 3 * DAY || document.querySelector(".ask")) return;
  const r = await rhythm(), q = QUESTIONS.find((x) => !asked[x.id] && x.when(r, now));
  if (!q) return;
  setMe({ lastAsk: now, asked: { ...asked, [q.id]: now } });
  const card = h("div", { class: "ask", role: "group", "aria-label": q.text() },
    h("p", null, q.text()),
    h("div", { class: "row-actions" }, q.options.map(([label, ans]) => h("button", { class: "btn small", onclick: () => { (q.save || ((rr, a) => setMe(a)))(r, ans); track("answer", q.id); card.classList.add("out"); setTimeout(() => card.remove(), 300); sync(); } }, label))),
    h("button", { class: "ask-x", "aria-label": "Dismiss", onclick: () => { card.classList.add("out"); setTimeout(() => card.remove(), 300); } }, "×"));
  document.body.append(card);
  setTimeout(() => { if (card.isConnected) { card.classList.add("out"); setTimeout(() => card.remove(), 300); } }, 20000);
}

// ---------- what is waiting ----------
async function drafts() { try { return (await db.all("media")).filter((m) => String(m.key).startsWith("draft:") && m.blob); } catch { return []; } }
function openSpeaking() {   // the newest homework with a speaking step not finished: where she is in it
  for (const date of hw.homeworkDays()) {
    const day = hw.homeworkFor(date); if (!day) continue;
    for (const t of day.tasks || []) for (const s of t.steps || []) {
      if (s.type !== "speaking" || hw.stepDone(date, s.id)) continue;
      const sent = hw.stateOf(date).steps[s.id]?.sent || {};
      const all = (s.topics || []).flatMap((tp, ti) => tp.questions.map((q, qi) => ({ k: `t${ti}q${qi}`, q: q.q, topic: tp.name, n: qi + 1 })));
      const next = all.find((x) => !sent[x.k]);
      return { date, sent: Object.keys(sent).length, total: all.length, next, lastSent: Math.max(0, ...Object.values(sent).map((v) => Date.parse(v) || 0)) };
    }
  }
  return null;
}
function homeworkLine(date) {
  const day = hw.homeworkFor(date); if (!day) return "";
  return (day.tasks || []).map((t) => {
    const s = (t.steps || [])[0], st = hw.stateOf(date).steps[s?.id] || {};
    if (s?.type === "speaking") { const total = (s.topics || []).reduce((n, x) => n + x.questions.length, 0); return `${t.title.split(":")[0]} ${Object.keys(st.sent || {}).length} of ${total}`; }
    const tp = hw.taskProgress(date, t); return `${t.title.split(":")[0]} ${tp.complete ? "done" : tp.done ? `${tp.done} of ${tp.total}` : "not opened"}`;
  }).join(" · ");
}
function dueCard() {
  const due = srs.queue({ includeNew: false });
  const own = due.find((c) => c.tag === "speaking" || c.tag === "reading");
  return { n: srs.dueCount(), card: own || due[0] || null };
}

// ---------- the plan ----------
export async function plan(now = Date.now()) {
  const r = await rhythm(), m = me(), out = [];
  const at = (d, minute) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime() + minute * MIN; };
  const nextHour = (from, hours) => {   // the next time she usually comes, after `from`
    for (let i = 0; i < 3; i++) { const d = from + i * DAY, hs = hours[weekend(d) ? "we" : "wd"]; for (const hr of [...hs].sort((a, b) => a - b)) { const t = at(d, hr * 60 + 5); if (t > from + 20 * MIN) return t; } }
    return null;
  };

  // an answer recorded and not sent: the one note that is always allowed
  for (const d of await drafts()) out.push({ at: Math.max(now + 12 * MIN, Date.parse(d.at) + 12 * MIN), tag: `draft-${d.key.slice(-24)}`, title: "Not sent yet", body: `“${d.q}”`, url: "#/homework", urgent: true });

  // speaking left in the middle: the next question itself
  const sp = openSpeaking();
  if (sp?.next && sp.sent > 0 && now - sp.lastSent < 6 * HOUR && !(m.noisyHours || []).includes(new Date(now + 45 * MIN).getHours()))
    out.push({ at: now + 45 * MIN, tag: `next-${sp.date}-${sp.next.k}`, title: `${sp.next.topic}, question ${sp.next.n}`, body: `“${sp.next.q}”`, url: "#/homework" });

  // the lesson is coming and the homework isn't in
  const nl = store.nextLesson(new Date(now)), start = nl ? nl.start.getTime() : null;
  const hwDate = hw.homeworkDays().find((d) => { const day = hw.homeworkFor(d); return day && !hw.dayProgress(d, day).complete; });
  if (start && hwDate && start - now < 30 * HOUR && start > now) {
    const p = hw.dayProgress(hwDate, hw.homeworkFor(hwDate)), line = homeworkLine(hwDate), t = new Date(start), when = hhmm(t.getHours() * 60 + t.getMinutes());
    let first = start - 4 * HOUR; const usual = nextHour(start - 6 * HOUR, r.hours); if (usual && usual < start - 2 * HOUR) first = usual;
    out.push({ at: first, tag: `lesson-${hwDate}-a`, title: `Lesson at ${when}`, body: line, url: "#/homework" });
    if (p.stepsDone / Math.max(1, p.steps) < 0.6) out.push({ at: start - 80 * MIN, tag: `lesson-${hwDate}-b`, title: "The lesson is in an hour", body: line, url: "#/homework", urgent: true });
  }

  // cards: at the in-between moment if she said she's on the way, else at an hour she usually comes
  const dc = dueCard(), cardMins = Math.max(1, Math.round((dc.n * r.pace) / 60));
  if (dc.n >= 6) {
    let t = null, title = dc.card ? `“${dc.card.front}” is due` : `${dc.n} cards are due`, body = `${dc.n} cards · about ${cardMins} min`;
    if (m.between === "move" && r.between) { for (let i = 0; i < 3 && !t; i++) { const d = now + i * DAY; if (!weekend(d)) { const x = at(d, r.between.min - 4); if (x > now + 20 * MIN) t = x; } } title = `${dc.n} cards for the way`; body = `About ${cardMins} min.${dc.card ? ` First: “${dc.card.front}”` : ""}`; }
    t ||= nextHour(now, r.hours) || now + 5 * HOUR;
    out.push({ at: t, tag: `cards-${new Date(t).toDateString()}`, title, body, url: "#/anki" });
  }

  // she's been away a while: what is waiting, plainly
  if (r.lastSeen && now - r.lastSeen > 2.5 * DAY) {
    const day = new Intl.DateTimeFormat("en-GB", { weekday: "long" }).format(new Date(r.lastSeen));
    out.push({ at: nextHour(now, r.hours) || now + 3 * HOUR, tag: `away-${dayKey(r.lastSeen)}`, title: `Since ${day}`, body: [dc.n ? `${dc.n} cards waiting` : "", sp?.next ? `${sp.total - sp.sent} speaking answers to go` : ""].filter(Boolean).join(" · ") || "Your homework is waiting.", url: hwDate ? "#/homework" : "#/anki" });
  }

  // a run of days: tonight is still open
  if (r.run >= 3 && !r.today) out.push({ at: at(now, Math.min(r.sleep, 1439) - 100), tag: `run-${dayKey(now)}`, title: `Day ${r.run + 1}?`, body: `${r.run} days in a row so far. Today is still open.`, url: dc.n ? "#/anki" : "#/today" });

  return schedule(out, r, now);
}

// her hours, the lesson, the daily budget, and how much she has ignored lately
function schedule(items, r, now) {
  const sent = store.S.kv.nsent || [], opened = new Set((store.S.kv.life || []).filter(([, e]) => e === "nopen").map(([, , d]) => d));
  let ignored = 0; for (const s of [...sent].sort((a, b) => b.at - a.at)) { if (opened.has(s.tag)) break; if (now - s.at > 3 * HOUR) ignored++; }
  const cap = ignored >= 6 ? 0 : ignored >= 3 ? 1 : 2;
  const okTime = (t) => { const m = mins(t), wake = r.wake + 15, sleep = r.sleep - 15; const inDay = sleep > 1440 ? m >= wake || m < sleep - 1440 : m >= wake && m < sleep; return inDay; };
  const lessonClash = (t) => { const nl = store.nextLesson(new Date(t - 2 * HOUR)), s = nl ? nl.start.getTime() : NaN; return Number.isFinite(s) && t > s - 10 * MIN && t < s + 100 * MIN; };
  const shift = (t) => { if (okTime(t)) return t; const d = new Date(t); if (mins(t) >= r.sleep - 15 && r.sleep < 1440) d.setDate(d.getDate() + 1); d.setHours(0, 0, 0, 0); return d.getTime() + (r.wake + 20) * MIN; };
  const already = new Set(sent.map((s) => s.tag)), perDay = {}, chosen = [];
  for (const it of items.map((x) => ({ ...x, at: shift(x.at) })).sort((a, b) => (b.urgent - a.urgent) || a.at - b.at)) {
    if (already.has(it.tag) || it.at > now + 2 * DAY || lessonClash(it.at)) continue;
    const day = dayKey(it.at), n = perDay[day] || 0;
    if (!it.urgent && (n >= cap || chosen.some((c) => !c.urgent && Math.abs(c.at - it.at) < 150 * MIN))) continue;
    if (!it.urgent) perDay[day] = n + 1;
    chosen.push(it);
  }
  return { items: chosen.sort((a, b) => a.at - b.at).slice(0, 8), quiet: quietUtc(r) };
}
const quietUtc = (r) => { const off = new Date().getTimezoneOffset(); return { from: (((r.sleep + off) % 1440) + 1440) % 1440, to: (((r.wake + off) % 1440) + 1440) % 1440 }; };

// ---------- turning it on, and keeping the relay's copy fresh ----------
export const pushable = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
export const isOn = () => store.S.kv.push === "on" && pushable() && Notification.permission === "granted";
const deviceId = () => { let id = store.S.kv.deviceId; if (!id) { id = (crypto.randomUUID?.() || String(Math.random()).slice(2) + Date.now()).replace(/[^a-z0-9-]/gi, "").slice(0, 36); kvSet("deviceId", id); } return id; };
const b64 = (s) => { const p = "=".repeat((4 - (s.length % 4)) % 4), raw = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(raw, (c) => c.charCodeAt(0)); };

export async function enable() {
  if (!pushable()) return "unsupported";
  const perm = await Notification.requestPermission();
  if (perm !== "granted") { kvSet("push", "denied"); return perm; }
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(VAPID) }));
  await hw.relay({ op: "push-sub", id: deviceId(), sub: sub.toJSON() }, { timeout: 15000 });
  kvSet("push", "on"); track("push-on"); await sync(true);
  return "on";
}
export async function disable() {
  kvSet("push", "off");
  try { const reg = await navigator.serviceWorker.ready; await (await reg.pushManager.getSubscription())?.unsubscribe(); } catch {}
  try { await hw.relay({ op: "push-off", id: deviceId() }, { timeout: 10000 }); } catch {}
}

let syncing = null, lastSync = 0;
export function sync(force = false, { leaving = false } = {}) {
  if (!isOn() || (!force && !leaving && Date.now() - lastSync < 60000)) return Promise.resolve();
  lastSync = Date.now();
  return (syncing = (async () => {
    const p = await plan();
    const body = JSON.stringify({ op: "nudges", id: deviceId(), items: p.items, quiet: p.quiet });
    if (leaving) { try { fetch(hw.RELAY, { method: "POST", body, keepalive: true, headers: { "Content-Type": "text/plain" } }); } catch {} return; }
    try { const r = await hw.relay(JSON.parse(body), { timeout: 15000 }); if (r?.sent) kvSet("nsent", r.sent.slice(0, 40)); } catch {}
  })().finally(() => { syncing = null; }));
}

// the gentle ask: after something real is done, not on the first open; three times at most, days apart
export function offer() {
  if (!pushable() || Notification.permission !== "default" || store.S.kv.push === "off") return;
  const asks = store.S.kv.pushAsks || [];
  if (asks.length >= 3 || (asks.length && Date.now() - asks[asks.length - 1] < 4 * DAY) || document.querySelector(".ask")) return;
  kvSet("pushAsks", [...asks, Date.now()]);
  const card = h("div", { class: "ask wide", role: "group", "aria-label": "Notifications" },
    h("p", null, h("b", null, "When something's waiting"), h("br"), h("span", { class: "muted" }, "A short note when an answer isn't sent, cards are due, or the lesson is close. Only at your hours.")),
    h("div", { class: "row-actions" },
      h("button", { class: "btn small", onclick: () => { card.classList.add("out"); setTimeout(() => card.remove(), 300); } }, "Not now"),
      h("button", { class: "btn small primary", onclick: async () => { card.classList.add("out"); setTimeout(() => card.remove(), 300); await enable(); } }, "Turn on")));
  document.body.append(card);
}

// wiring: called once at start
export function start() {
  track("open");
  const q = new URLSearchParams(location.search);
  if (q.get("n")) { track("nopen", q.get("n")); history.replaceState(null, "", location.pathname + location.hash); }
  navigator.serviceWorker?.addEventListener("message", (e) => { if (e.data?.nudge) { track("nopen", e.data.nudge); if (e.data.url) location.hash = e.data.url; } });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { track("hide"); sync(false, { leaving: true }); }
    else { track("open"); sync(true); }
  });
  addEventListener("pagehide", () => { track("hide"); });
  setTimeout(() => { sync(true); }, 4000);
}
