// A full copy of everything she does, kept off the phone: cards and every review, decks, task progress, mocks with her
// answers and essays, check-ins, settings. Sealed on the phone with the teacher's public key (RSA-OAEP + AES-GCM), so the
// copy in the feed repo is unreadable without the private key on the teacher's PC. Recordings and photos are left out
// (they already reach the teacher's Telegram); their size and type are kept.
import * as db from "./db.js";
import * as hw from "./homework.js";

const PUB = "MIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEAl1NFpdJQvWV0YaVH0eYrD56e8CIx2sU38N7JuXBhVq4PfR67msAEoCLC7bSgPiU9AZ1XoBmkr3OQN6NMeVXLIcF6xj4YyuugLFWiMZgmT3rD7cmVoxE0hRD/f/6XjMqFtMqdYBOpiVEYaj4wpyZIJJqu/fqyKipgMyEEqzRBp8Y817Je6vTozcHwS8yy2qGKVGpPf/xByjM1xorgcsk89/Kav5xz6kU9+f91KutlUTV7frkS30pWTG50EGH4Jlm9/X8o00s7Rb8ZRDbwby27M417gx9YC3RcUXRHMfQnxvsq65yyxHeHbHf9QtJABicnRAtzR3BEB5Rt6lIPv+0PWXK/A9oyYGdZuxR+rNRWu0o/4XTomGeD7tcTHuchQdE8eghjPlLGsr+52NO2bjjA39TQUHrYV5PMOnePKnIZas4BdZfd6swltrx15LncjcvYw0UDggqi9lQ2x0YGanpXJEx61pL33rPiEF0fwnJBOG9artoWXHhYO2aMal7lt+DNAgMBAAE=";
const STORES = ["kv", "tasks", "errors", "cards", "reviewlog", "essays", "recordings", "scores", "reading", "study", "hw", "decks", "mocks", "checkins"];
const LS = "eight-backup";
const MIN_GAP = 10 * 60000;
const b64 = (u8) => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const strip = (k, v) => (typeof Blob !== "undefined" && v instanceof Blob ? { blob: true, type: v.type, size: v.size } : v);

async function snapshot() {
  const data = {};
  for (const s of STORES) { try { data[s] = await db.all(s); } catch { data[s] = null; } }
  return { app: "8.5", student: hw.studentName(), id: hw.studentId(), data };
}
async function seal(text) {
  let bytes = new TextEncoder().encode(text), zip = false;
  if (typeof CompressionStream === "function") { try { bytes = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer()); zip = true; } catch {} }
  const aes = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aes, bytes));
  const pub = await crypto.subtle.importKey("spki", unb64(PUB), { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]);
  const key = new Uint8Array(await crypto.subtle.encrypt({ name: "RSA-OAEP" }, pub, new Uint8Array(await crypto.subtle.exportKey("raw", aes))));
  return { v: 1, alg: "rsa-oaep-256+aes-256-gcm", zip, key: b64(key), iv: b64(iv), ct: b64(ct) };
}
const state = () => { try { return JSON.parse(localStorage.getItem(LS) || "{}"); } catch { return {}; } };
const setState = (x) => { try { localStorage.setItem(LS, JSON.stringify(x)); } catch {} };

let running = false, timer = null;
export async function run({ force = false } = {}) {
  if (running || hw.viewingAs() || !hw.studentName() || !hw.enrolled() || !crypto?.subtle) return;
  const st = state(), now = Date.now();
  if (!force && now - (st.at || 0) < MIN_GAP) { clearTimeout(timer); timer = setTimeout(() => run(), MIN_GAP - (now - (st.at || 0)) + 1000); return; }
  running = true;
  try {
    const snap = await snapshot(), text = JSON.stringify(snap, strip);
    const hash = b64(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))).slice(0, 24);
    if (hash === st.hash && now - (st.at || 0) < 24 * 3600000) return;
    const sealed = await seal(JSON.stringify({ ...snap, at: new Date().toISOString() }, strip));
    await hw.relay({ op: "backup", id: snap.id, data: sealed }, { timeout: 60000 });
    setState({ at: now, hash });
  } catch {} finally { running = false; }
}
// a copy soon after she does something, then every so often while the app is open
export const soon = () => { clearTimeout(timer); timer = setTimeout(() => run(), 20000); };
export function start() {
  setTimeout(() => run(), 30000);
  setInterval(() => run(), 30 * 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) soon(); });
}
