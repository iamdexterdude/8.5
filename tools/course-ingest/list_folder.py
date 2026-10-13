"""Read-only: list the chats inside the Telegram folder named in argv[1]."""
import asyncio, json, sys
from telethon.tl.functions.messages import GetDialogFiltersRequest
from telethon import utils
from common import client, STATE

async def main():
    want = sys.argv[1].lower()
    async with client() as c:
        res = await c(GetDialogFiltersRequest())
        filters = getattr(res, "filters", res)
        print("FOLDERS:", [getattr(f, "title", None) and (f.title.text if hasattr(f.title, "text") else f.title) for f in filters])
        target = None
        for f in filters:
            t = getattr(f, "title", None)
            t = t.text if hasattr(t, "text") else t
            if t and want in t.lower():
                target = f
        if not target:
            print("NO FOLDER MATCH"); return
        peers = [utils.get_peer_id(p) for p in (target.include_peers or [])]
        out = []
        async for d in c.iter_dialogs():
            if d.id in peers or (target.include_peers == [] and False):
                kind = "channel" if d.is_channel and not d.is_group else "group" if d.is_group else "user"
                out.append({"id": d.id, "title": d.name, "kind": kind, "forum": bool(getattr(d.entity, "forum", False))})
        print("PINNED/INCLUDED PEERS:", len(peers), "resolved:", len(out))
        (STATE / "folder_chats.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
        for o in out: print(o["id"], o["kind"], o["forum"], o["title"])
asyncio.run(main())
