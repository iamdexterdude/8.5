import json, sys
from common import COURSE
cid = sys.argv[1]; kinds = sys.argv[2].split(",") if len(sys.argv) > 2 else None
for l in open(COURSE/"meta"/f"{cid}.jsonl", encoding="utf-8"):
    r = json.loads(l); m = r["media"] or {}
    k = m.get("mkind") or m.get("kind") or "text"
    if kinds and k not in kinds: continue
    t = (m.get("name") or "") if k in ("file","audio","image") else ""
    cap = r["text"].replace("\n"," | ")[:90]
    if k in ("photo","text") and not cap: continue
    d = f"{round((m.get('duration') or 0)/60)}m" if m.get("duration") else ""
    print(r["id"], k, d, t[:55], "::", cap)
