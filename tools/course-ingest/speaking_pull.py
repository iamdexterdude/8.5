"""Read-only pull of the speaking channels: every message with its formatting entities (bold, italic, ...),
and every document / photo downloaded. Nothing is sent, joined, marked read or deleted.
  python speaking_pull.py survey          -> course/speaking/<chat>/messages.jsonl
  python speaking_pull.py files           -> course/speaking/<chat>/files/<msg>_<name>   (documents, photos, images)
  python speaking_pull.py audio           -> voice and audio files
  python speaking_pull.py video [maxmin]  -> videos up to maxmin minutes (default 30)
"""
import asyncio, json, re, sys, time, glob
from pathlib import Path
from telethon.errors import FloodWaitError
from telethon.tl.types import DocumentAttributeFilename, DocumentAttributeVideo, DocumentAttributeAudio
from common import client, COURSE

CHATS = {-1003128376830: "USB", -1002008308821: "Diyorbek's Speaking", -1001961939608: "Keith's Speaking"}
OUT = COURSE / "speaking"

def safe(s): return re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", s)[:120]

def media_info(m):
    if not m.media: return None
    info = {"kind": type(m.media).__name__}
    if m.photo: info.update(kind="photo", size=None, fid=m.photo.id, name=f"photo_{m.id}.jpg", mkind="photo")
    elif m.document:
        d = m.document
        info.update(kind="document", size=d.size, mime=d.mime_type, fid=d.id)
        name = None; dur = None; kind = "file"
        for a in d.attributes:
            if isinstance(a, DocumentAttributeFilename): name = a.file_name
            if isinstance(a, DocumentAttributeVideo): dur = a.duration; kind = "video"
            if isinstance(a, DocumentAttributeAudio): dur = a.duration; kind = "voice" if a.voice else "audio"
        if d.mime_type and d.mime_type.startswith("image/"): kind = "image"
        info.update(name=name, duration=dur, mkind=kind)
    elif m.web_preview:
        w = m.web_preview
        info.update(kind="webpage", url=getattr(w, "url", None), title=getattr(w, "title", None))
    return info

def entities(m):
    out = []
    for e in (m.entities or []):
        t = type(e).__name__.replace("MessageEntity", "").lower()
        rec = {"type": t, "offset": e.offset, "length": e.length}
        if getattr(e, "url", None): rec["url"] = e.url
        if getattr(e, "language", None): rec["language"] = e.language
        out.append(rec)
    return out

async def survey(c):
    for cid, title in CHATS.items():
        d = OUT / str(cid); d.mkdir(parents=True, exist_ok=True)
        n = 0
        with (d / "messages.jsonl").open("w", encoding="utf-8") as f:
            async for m in c.iter_messages(cid, reverse=True, wait_time=1):
                rec = {"id": m.id, "date": m.date.isoformat(), "text": m.message or "", "entities": entities(m), "grouped": m.grouped_id,
                       "reply_to": (m.reply_to.reply_to_msg_id if m.reply_to else None), "pinned": bool(m.pinned), "media": media_info(m), "views": m.views}
                f.write(json.dumps(rec, ensure_ascii=False) + "\n"); n += 1
        (d / "title.txt").write_text(title, encoding="utf-8")
        print(title, cid, n, "messages", flush=True)

async def pull(c, kinds, maxdur=None):
    for cid, title in CHATS.items():
        d = OUT / str(cid); files = d / "files"; files.mkdir(parents=True, exist_ok=True)
        rows = [json.loads(l) for l in (d / "messages.jsonl").read_text(encoding="utf-8").splitlines()]
        jobs = [r for r in rows if r["media"] and r["media"].get("mkind") in kinds and (maxdur is None or (r["media"].get("duration") or 0) <= maxdur)]
        jobs.sort(key=lambda r: r["media"].get("size") or 0)
        print(title, len(jobs), "files to fetch", flush=True)
        got = 0; t0 = time.time()
        for r in jobs:
            m = r["media"]; name = safe(m.get("name") or f"{m.get('mkind','file')}_{r['id']}")
            path = files / f"{r['id']}_{name}"
            if path.exists() and (not m.get("size") or path.stat().st_size == m["size"]): continue
            if glob.glob(str(path) + ".*"): continue
            msg = await c.get_messages(cid, ids=r["id"])
            if not msg or not msg.media: continue
            for attempt in range(5):
                try:
                    res = await c.download_media(msg, file=str(path))
                    break
                except FloodWaitError as e:
                    print("FloodWait", e.seconds, flush=True); await asyncio.sleep(e.seconds + 5)
                except Exception as e:
                    print("retry", r["id"], type(e).__name__, str(e)[:80], flush=True); await asyncio.sleep(5 * (attempt + 1))
            got += 1
            if got % 10 == 0: print(f"  {got}/{len(jobs)} {time.time()-t0:.0f}s", flush=True)
        print(title, "done", got, "new", flush=True)

async def main():
    what = sys.argv[1] if len(sys.argv) > 1 else "survey"
    async with client() as c:
        c.flood_sleep_threshold = 3600
        if what == "survey": await survey(c)
        elif what == "files": await pull(c, ("file", "image", "photo"))
        elif what == "audio": await pull(c, ("voice", "audio"))
        elif what == "video": await pull(c, ("video",), maxdur=60 * int(sys.argv[2] if len(sys.argv) > 2 else 30))
asyncio.run(main())
