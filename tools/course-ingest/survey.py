"""Read-only: save every message's metadata (text, captions, links, file info) per chat to course/meta/<chat>.jsonl. No downloads."""
import asyncio, json, re
from telethon.tl.types import DocumentAttributeFilename, DocumentAttributeVideo, DocumentAttributeAudio
from common import client, STATE, COURSE

def media_info(m):
    if not m.media: return None
    info = {"kind": type(m.media).__name__}
    if m.photo: info.update(kind="photo", size=None, fid=m.photo.id, name=f"photo_{m.id}.jpg")
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

async def main():
    chats = json.loads((STATE / "folder_chats.json").read_text(encoding="utf-8"))
    (COURSE / "meta").mkdir(parents=True, exist_ok=True)
    async with client() as c:
        for ch in chats:
            out = COURSE / "meta" / f"{ch['id']}.jsonl"
            n = 0
            with out.open("w", encoding="utf-8") as f:
                async for m in c.iter_messages(ch["id"], reverse=True, wait_time=1):
                    rec = {"id": m.id, "date": m.date.isoformat(), "text": m.message or "", "grouped": m.grouped_id,
                           "topic": (m.reply_to.reply_to_top_id or m.reply_to.reply_to_msg_id) if (m.reply_to and m.reply_to.forum_topic) else None,
                           "media": media_info(m)}
                    ents = [e.url for e in (m.entities or []) if hasattr(e, "url") and e.url]
                    if ents: rec["links"] = ents
                    f.write(json.dumps(rec, ensure_ascii=False) + "\n"); n += 1
            print(ch["title"], n, flush=True)
asyncio.run(main())
