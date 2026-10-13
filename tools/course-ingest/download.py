"""Read-only, resumable, FloodWait-safe download of every media file listed in course/meta/*.jsonl.
Order: documents/photos/images, audio+voice, then videos shortest first.
De-duplicated by Telegram file id. Writes course/index.jsonl (one line per downloaded file)."""
import asyncio, json, re, glob, os, sys, time
from pathlib import Path
from telethon.errors import FloodWaitError
from common import client, STATE, COURSE

MEDIA = COURSE / "media"; MEDIA.mkdir(parents=True, exist_ok=True)
INDEX = COURSE / "index.jsonl"

def safe(s): return re.sub(r'[<>:"/\|?*\x00-\x1f]', "_", s)[:120]

def load_index():
    d = {}
    if INDEX.exists():
        for l in INDEX.read_text(encoding="utf-8").splitlines():
            r = json.loads(l); d[(r["chat"], r["msg"])] = r
    return d

async def main():
    chats = {str(c["id"]): c["title"] for c in json.loads((STATE/"folder_chats.json").read_text(encoding="utf-8"))}
    jobs = []
    for p in glob.glob(str(COURSE/"meta"/"*.jsonl")):
        cid = Path(p).stem
        for l in open(p, encoding="utf-8"):
            r = json.loads(l); m = r["media"]
            if m and m.get("kind") in ("photo", "document"):
                k = m.get("mkind") or "photo"
                size = m.get("size") or 0; dur = m.get("duration") or 0
                # tier 0: documents/photos under 100 MB; tier 1: voice and audio under 40 MB; tier 2: videos up to 40 min; tier 3: everything else
                if k in ("photo", "image", "file") and size < 100e6: prio = 0
                elif k in ("audio", "voice") and size < 40e6: prio = 1
                elif k == "video" and dur <= 2400: prio = 2
                else: prio = 3
                jobs.append((prio, size, cid, r))
    jobs.sort(key=lambda j: (j[0], j[1]))
    done = load_index(); by_fid = {r["fid"]: r for r in done.values() if r.get("fid")}
    print("jobs", len(jobs), "already", len(done), flush=True)
    sem = asyncio.Semaphore(4)
    idx = INDEX.open("a", encoding="utf-8")
    t0 = time.time(); got = 0
    async with client() as c:
        c.flood_sleep_threshold = 3600
        async def one(prio, dur, cid, r):
            nonlocal got
            key = (cid, r["id"])
            if key in done: return
            m = r["media"]; fid = m.get("fid")
            if fid in by_fid:   # same file already downloaded from another message
                rec = dict(by_fid[fid]); rec.update(chat=cid, msg=r["id"], dup=True)
                idx.write(json.dumps(rec) + "\n"); idx.flush(); return
            async with sem:
                msg = await c.get_messages(int(cid), ids=r["id"])
                if not msg or not msg.media: return
                name = safe(m.get("name") or f"{m.get('mkind','file')}_{r['id']}")
                dest = MEDIA / cid; dest.mkdir(exist_ok=True)
                path = dest / f"{r['id']}_{name}"
                for attempt in range(6):
                    try:
                        if not path.exists() or (m.get("size") and path.stat().st_size != m["size"]):
                            part = Path(str(path) + ".part")
                            await c.download_media(msg, file=str(part))
                            if not part.exists():  # telethon may have appended an extension
                                cand = glob.glob(str(part) + "*"); part = Path(cand[0]) if cand else part
                            if path.exists(): path.unlink()
                            part.rename(path)
                        break
                    except FloodWaitError as e:
                        print("FloodWait", e.seconds, flush=True); await asyncio.sleep(e.seconds + 5)
                    except Exception as e:
                        print("retry", key, type(e).__name__, str(e)[:80], flush=True); await asyncio.sleep(10 * (attempt + 1))
                else:
                    print("FAILED", key, flush=True); return
                rec = {"chat": cid, "msg": r["id"], "fid": fid, "path": str(path.relative_to(COURSE)), "size": path.stat().st_size,
                       "mkind": m.get("mkind") or "photo", "duration": m.get("duration"), "name": m.get("name")}
                idx.write(json.dumps(rec) + "\n"); idx.flush(); by_fid[fid] = rec; got += 1
                if got % 20 == 0: print(f"{got}/{len(jobs)} {time.time()-t0:.0f}s", flush=True)
        # a fixed pool of workers pulling from the sorted queue: small things first, big things last
        q = asyncio.Queue()
        for j in jobs: q.put_nowait(j)
        async def worker():
            while True:
                try: j = q.get_nowait()
                except asyncio.QueueEmpty: return
                await one(*j)
        await asyncio.gather(*(worker() for _ in range(4)))
    print("DOWNLOAD COMPLETE", got, flush=True)
asyncio.run(main())
