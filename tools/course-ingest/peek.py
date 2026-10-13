import json, sys
from common import COURSE
cid, n = sys.argv[1], int(sys.argv[2])
k = 0
for l in open(COURSE/"meta"/f"{cid}.jsonl", encoding="utf-8"):
    r = json.loads(l); m = r["media"] or {}
    t = r["text"].replace("\n", " | ")[:150]
    if not t and not m: continue
    print(r["id"], r["date"][:10], (m.get("mkind") or m.get("kind") or "-"), (m.get("name") or "")[:60], f"{(m.get('duration') or 0)//60}m" if m.get("duration") else "", "::", t)
    k += 1
    if k >= n: break
