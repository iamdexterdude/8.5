import sys, json, glob, collections
import pymupdf
from common import COURSE
cid, msg = sys.argv[1], sys.argv[2]
idx = {}
for l in open(COURSE/"index.jsonl", encoding="utf-8"):
    r = json.loads(l); idx[(r["chat"], str(r["msg"]))] = r
r = idx[(cid, msg)]; path = COURSE / r["path"]
doc = pymupdf.open(path)
print("FILE", path.name, "pages", len(doc))
styles = collections.Counter()
for page in doc:
    for b in page.get_text("dict")["blocks"]:
        for ln in b.get("lines", []):
            for sp in ln["spans"]:
                styles[(sp["font"], round(sp["size"]), sp["flags"] & 16 != 0, hex(sp["color"]))] += len(sp["text"])
for k, v in styles.most_common(8): print(v, k)
# show highlighted (bold or non-black) spans on page 1
n = 0
for b in doc[0].get_text("dict")["blocks"]:
    for ln in b.get("lines", []):
        t = "".join(sp["text"] for sp in ln["spans"])
        marks = [sp["text"] for sp in ln["spans"] if (sp["flags"] & 16 or sp["color"] not in (0, 0x000000)) and sp["text"].strip()]
        print(("* " if marks else "  ") + t[:110], ("  <<" + " | ".join(marks)[:90] + ">>") if marks else "")
        n += 1
        if n > int(sys.argv[3] if len(sys.argv) > 3 else 40): sys.exit()
