"""Copies the 13 course chats into ONE private channel, "8.5 Course Library", owned by Dexter's account.
  python mirror.py check     -> read-only: which chats allow forwarding, how many posts each
  python mirror.py run       -> create the channel (once) and copy everything, in the original order
Fast path: Telegram forwards on its own servers (nothing passes through this PC).
Chats whose owner turned on "Restrict saving content" are SKIPPED: their protection is respected, nothing is re-uploaded.
Resumable: course/mirror_map.json records every copied post (source chat + message id -> library message id).
The channel is private (no public username); only people Dexter invites can see it."""
import asyncio, json, os, sys, time
from pathlib import Path
from telethon import functions, types, errors
from common import client, STATE, COURSE

TITLE = "8.5 Course Library"
ABOUT = "Private course library for the 8.5 app. Members only."
MAP = COURSE / "mirror_map.json"
ORDER = ["READING QUESTION TYPES", "RM 11&12", "RM 13 (January)", "LISTENING QUESTION TYPES COURSE", "LM 1.0 - MULTIPLE CHOICE MARATHON", "LM 3.0 - GAP FILLING",
         "Transcribing channel", "ULTIMATE TASK 1", "ULTIMATE TASK 2", "Diyorbek's Writing", "WRITING G8", "GOLD PLAN", "USB"]

def chats():
    cs = json.loads((STATE / "folder_chats.json").read_text(encoding="utf-8"))
    rank = {t: i for i, t in enumerate(ORDER)}
    return sorted(cs, key=lambda c: rank.get(c["title"], 99))

def posts_of(cid):
    """Message ids worth copying: anything with text or media (service messages like 'joined the group' are skipped)."""
    out = []
    for l in (COURSE / "meta" / f"{cid}.jsonl").read_text(encoding="utf-8").splitlines():
        r = json.loads(l)
        if r["text"].strip() or r["media"]: out.append(r)
    return out

def load_map():
    return json.loads(MAP.read_text(encoding="utf-8")) if MAP.exists() else {"channel": None, "posts": {}, "headers": {}}
def save_map(m): MAP.write_text(json.dumps(m), encoding="utf-8")

async def check():
    async with client() as c:
        for ch in chats():
            ent = await c.get_entity(ch["id"])
            print(f"{ch['title'][:34]:34}  posts {len(posts_of(str(ch['id']))):4}  forwarding {'BLOCKED' if getattr(ent, 'noforwards', False) else 'allowed'}")

async def ensure_channel(c, m):
    if m["channel"]:
        return await c.get_entity(types.PeerChannel(m["channel"]))
    res = await c(functions.channels.CreateChannelRequest(title=TITLE, about=ABOUT, broadcast=True))
    ch = res.chats[0]; m["channel"] = ch.id; save_map(m)
    print("created channel", TITLE, ch.id, flush=True)
    return ch

async def run():
    m = load_map()
    async with client() as c:
        c.flood_sleep_threshold = 3600
        target = await ensure_channel(c, m)
        for ch in chats():
            cid = str(ch["id"]); posts = posts_of(cid)
            todo = [p for p in posts if f"{cid}:{p['id']}" not in m["posts"]]
            if not todo: print("done already:", ch["title"], flush=True); continue
            src = await c.get_entity(ch["id"])
            if getattr(src, "noforwards", False):
                m.setdefault("skipped", {})[cid] = ch["title"]; save_map(m)
                print(f"skipped (protected by its owner): {ch['title']}", flush=True); continue
            if cid not in m["headers"]:
                hdr = await c.send_message(target, f"{ch['title']}\n\nCourse materials from \"{ch['title']}\" ({len(posts)} posts), in their original order.")
                m["headers"][cid] = hdr.id; save_map(m)
            print(f"{ch['title']}: {len(todo)} posts to forward", flush=True)
            i = 0
            while i < len(todo):
                batch = todo[i:i + 100]; ids = [p["id"] for p in batch]
                try:
                    res = await c(functions.messages.ForwardMessagesRequest(from_peer=src, id=ids, to_peer=target, drop_author=True,
                                                                            random_id=[int.from_bytes(os.urandom(8), "big", signed=True) for _ in ids]))
                except errors.FloodWaitError as e:
                    print("  FloodWait", e.seconds, flush=True); await asyncio.sleep(e.seconds + 5); continue
                except errors.ChatForwardsRestrictedError:
                    m.setdefault("skipped", {})[cid] = ch["title"]; save_map(m); print("  forwarding is restricted here; skipped", flush=True); break
                # Telegram tells us which new message came from which random id, in the order sent
                new = sorted((u.message for u in res.updates if isinstance(u, (types.UpdateNewChannelMessage, types.UpdateNewMessage))), key=lambda x: x.id)
                for p, nm in zip(sorted(batch, key=lambda x: x["id"]), new): m["posts"][f"{cid}:{p['id']}"] = nm.id
                if len(new) < len(ids): print(f"  {len(ids) - len(new)} posts in this batch could not be forwarded (deleted or individually protected)", flush=True)
                save_map(m); i += len(batch)
                print(f"  {ch['title']}: {i}/{len(todo)}", flush=True)
                await asyncio.sleep(2)
        print("MIRROR COMPLETE", len(m["posts"]), "posts in", TITLE, flush=True)

if __name__ == "__main__":
    asyncio.run(check() if sys.argv[1:] == ["check"] else run())
