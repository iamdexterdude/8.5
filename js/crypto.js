// AES-GCM encryption with a key made from the class code (PBKDF2). Used for the homework feed:
// the public GitHub branch only ever holds scrambled text, and only people with the class code can read it.
// The same file is used by the teacher's command-line tool in Node.
const te = new TextEncoder(), td = new TextDecoder();
const ITER = 150000;

function toB64(buf) {
  const b = new Uint8Array(buf); let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(s);
}
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriveKey(code, salt, iter = ITER) {
  const base = await crypto.subtle.importKey("raw", te.encode(code), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function encryptJson(obj, code, iter = ITER) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(code, salt, iter);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, te.encode(JSON.stringify(obj)));
  return { v: 1, ...(iter !== ITER ? { it: iter } : {}), salt: toB64(salt), iv: toB64(iv), ct: toB64(ct) };
}

export async function decryptJson(file, code) {
  const key = await deriveKey(code, fromB64(file.salt), file.it || ITER);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(file.iv) }, key, fromB64(file.ct));
  return JSON.parse(td.decode(pt));
}

export function newClassCode() {
  const a = crypto.getRandomValues(new Uint8Array(12)); const abc = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from(a, (x) => abc[x % abc.length]).join("").replace(/(.{4})(?=.)/g, "$1-");
}
