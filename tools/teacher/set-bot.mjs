// Moves the 8.5 messages (her photos and recordings, and Claude's "published" notes) to a Telegram bot of your own.
//   1. In Telegram, open @BotFather, send /newbot, choose a name and a username, and copy the token it gives you.
//   2. Double-click set-bot.cmd (or: node tools/teacher/set-bot.mjs <token>) and paste the token.
//   3. When it asks, open the new bot in Telegram and press Start. The script finds your chat by itself,
//      saves the token and the chat in the relay on Vercel, redeploys the relay, and sends a test message.
//   Already know the chat id?  node tools/teacher/set-bot.mjs <token> <chat id>
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RELAY } from "../../app/js/feedkey.js";

const backend = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "backend");
const ask = (q) => new Promise((r) => { const rl = createInterface({ input: process.stdin, output: process.stdout }); rl.question(q, (a) => { rl.close(); r(a.trim()); }); });
const quit = (msg) => { console.error("\n" + msg); process.exit(1); };

let [token, chat] = process.argv.slice(2);
token ||= await ask("Paste the bot token from @BotFather: ");
if (!/^\d+:[\w-]{30,}$/.test(token || "")) quit("That does not look like a bot token (it looks like 1234567890:AAH...).");

async function tg(method, params = {}) {
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(params), signal: AbortSignal.timeout(40000) });
  const j = await r.json().catch(() => ({})); if (!j.ok) throw new Error(j.description || "Telegram " + r.status); return j.result;
}
const me = await tg("getMe").catch((e) => quit("Telegram does not accept that token: " + e.message));
console.log(`\nBot: @${me.username} (${me.first_name})`);

if (!chat) {
  await tg("deleteWebhook").catch(() => {});
  console.log(`\nNow open https://t.me/${me.username} in Telegram and press Start (or send it any message).\nWaiting up to three minutes…`);
  let offset = 0; const until = Date.now() + 180000;
  while (!chat && Date.now() < until) {
    const updates = await tg("getUpdates", { timeout: 25, offset }).catch(() => []);
    for (const u of updates) { offset = u.update_id + 1; const c = (u.message || u.my_chat_member)?.chat; if (!chat && c?.type === "private") { chat = String(c.id); console.log(`Found your chat: ${[c.first_name, c.last_name].filter(Boolean).join(" ")} (${chat})`); } }
  }
  if (!chat) quit("No message reached the bot. Run this again and press Start in the bot's chat.");
  await tg("getUpdates", { offset, timeout: 0 }).catch(() => {});
}
if (!/^-?\d+$/.test(chat)) quit("The chat id must be a number.");

function vercel(args) {
  const r = spawnSync("vercel", args, { cwd: backend, shell: true, encoding: "utf8" });
  if (r.status !== 0) quit("Vercel said:\n" + (r.stderr || r.stdout).trim().split("\n").slice(-6).join("\n"));
}
console.log("\nSaving the bot in the relay on Vercel…");
vercel(["env", "add", "TG_BOT_TOKEN", "production", "--value", token, "--force", "--yes"]);
vercel(["env", "add", "TG_CHAT_ID", "production", "--value", chat, "--force", "--yes"]);
console.log("Redeploying the relay (about a minute)…");
vercel(["--prod", "--yes"]);

const r = await fetch(RELAY, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "notify", text: "8.5: this bot is set up. Her photos and recordings, and Claude's messages when a day is published, arrive here now." }) }).then((x) => x.json()).catch((e) => ({ error: e.message }));
console.log(r.ok ? `\nDone. Look for the test message from @${me.username}.` : "\nSaved, but the test message failed: " + r.error);
