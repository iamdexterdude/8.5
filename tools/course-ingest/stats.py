import json, glob, collections
from pathlib import Path
from common import COURSE, STATE
names = {str(c["id"]): c["title"] for c in json.loads((STATE/"folder_chats.json").read_text(encoding="utf-8"))}
tot = collections.Counter(); totsz = collections.Counter(); durs = collections.Counter()
for p in sorted(glob.glob(str(COURSE/"meta"/"*.jsonl"))):
    cid = Path(p).stem; c = collections.Counter(); sz = collections.Counter(); du = collections.Counter()
    for l in open(p, encoding="utf-8"):
        r = json.loads(l); m = r["media"]
        if not m: c["text-only" if r["text"] else "empty"] += 1; continue
        k = m.get("mkind") or m["kind"]; c[k] += 1; sz[k] += (m.get("size") or 0); du[k] += (m.get("duration") or 0)
    print(f"\n{names[cid]} ({cid})")
    for k in c: print(f"   {k:10} n={c[k]:4} {sz[k]/1e9:6.2f} GB  {du[k]/3600:6.1f} h")
    tot.update(c); totsz.update(sz); durs.update(du)
print("\nTOTAL")
for k in tot: print(f"   {k:10} n={tot[k]:4} {totsz[k]/1e9:6.2f} GB  {durs[k]/3600:6.1f} h")
print("ALL GB", sum(totsz.values())/1e9)
