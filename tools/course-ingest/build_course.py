"""Turns the 13 course chats into ordered courses -> lessons -> items (video, PDF, voice, notes), with Telegram links.
Used by build_catalogue.py to put `courses` into the private course pack. Read-only on the course data."""
import re, json
from pathlib import Path
from common import COURSE

# course order (Dexter's default): writing first, then reading types, speaking, listening types, marathons, the rest
ORDER = ["T2", "T1", "RQT", "USB", "LQT", "RM1112", "RM13", "LM1", "LM3", "TR", "DW", "GOLD", "WG8"]
NAMES = {"T2": "Ultimate Task 2", "T1": "Ultimate Task 1", "RQT": "Reading Question Types", "USB": "Speaking course", "LQT": "Listening Question Types",
         "RM1112": "Reading Marathon 11 and 12", "RM13": "Reading Marathon 13", "LM1": "Listening Marathon 1: multiple choice", "LM3": "Listening Marathon 3: gap filling",
         "TR": "Transcribing exercises", "DW": "Diyorbek's Writing lessons", "GOLD": "Gold Plan writing lessons", "WG8": "Writing group G8"}
SKILL = {"T2": "writing", "T1": "writing", "RQT": "reading", "USB": "speaking", "LQT": "listening", "RM1112": "reading", "RM13": "reading", "LM1": "listening", "LM3": "listening",
         "TR": "listening", "DW": "writing", "GOLD": "writing", "WG8": "writing"}
DAY_MODE = {"RM1112", "RM13", "LM1", "LM3"}            # one lesson per marathon day
DAYPFX = re.compile(r"(?i)^day\s*\d+\s*[,:-]?\s*")
PRIMARY = {"video", "audio", "voice"}
DOCS = {"pdf", "docx", "html", "sheet", "doc", "file", "zip"}

def lead_num(t):
    m = re.match(r"^\s*(?:lesson\s*)?(\d{1,2})\b[\s._-]", t or "", re.I); return int(m.group(1)) if m else None
def day_num(t):
    m = re.search(r"(?i)\bday[\s_,-]*(\d{1,2})\b", t or ""); return int(m.group(1)) if m else None
def words(t): return {w for w in re.findall(r"[a-z]{4,}", (t or "").lower())} - {"video", "worksheet", "notes", "pdf", "lesson", "explanation", "with", "your", "about", "that", "this", "speakingpart"}

def clean_title(it):
    t = (it["caption"].split("\n")[0].strip() if it["caption"] else "") or it["title"] or ""
    t = re.sub(r"https?://\S+|#\w+", "", t); t = re.sub(r"\s+", " ", t).strip(" |-–—")
    if it["short"] == "WG8" and it["type"] == "video": t = "Feedback recording"
    return t[:110] or {"video": "Video", "voice": "Voice note", "audio": "Audio"}.get(it["type"], "File")

def item_of(it, alt):
    k = {"pdf": "PDF", "docx": "Word file", "html": "Web page", "sheet": "Sheet", "zip": "Zip", "doc": "File", "file": "File", "video": "Video", "audio": "Audio", "voice": "Voice note", "text": "Post", "link": "Link"}.get(it["type"], it["type"])
    d = {"title": clean_title(it), "kind": k, "url": it["url"], "minutes": it["minutes"]}
    if alt: d["library"] = alt
    return d

def lessons_for(short, items, alt_map):
    its = sorted([i for i in items if i["short"] == short], key=lambda x: x["msg"])
    generic = lambda i: i["type"] in DOCS and (i["title"] or "").strip().lower() in ("file", "") and not i["caption"]
    keep = [i for i in its if not generic(i) and (i["type"] in PRIMARY | DOCS or (i["type"] == "text" and re.search(r"(?i)useful chunks|summary|answer key", i.get("text", ""))))]
    lessons = []
    alt = lambda i: alt_map.get(f"{i['chat']}:{i['msg']}")
    if short in DAY_MODE:
        cur = None; by = {}
        for i in keep:
            d = day_num(i["title"]) or day_num(i["caption"])
            if d is None: d = cur
            if d is None: d = 0
            cur = d
            by.setdefault(d, []).append(i)
        for d in sorted(by):
            g = by[d]; vids = [x for x in g if x["type"] in PRIMARY]
            title = f"Day {d}" if d else "Introduction"
            nm = next((clean_title(x) for x in g if x["type"] == "video"), None) or next((clean_title(x) for x in g if x["type"] in DOCS and "word" not in x["title"].lower()), "")
            short_nm = DAYPFX.sub("", nm) if nm else ""
            lessons.append({"title": (f"{title}: {short_nm}" if short_nm else title), "items": [item_of(x, alt(x)) for x in g]})
        return lessons
    prim = [i for i in keep if i["type"] in PRIMARY]
    groups = {p["msg"]: [p] for p in prim}; loose = []
    def key(i):
        n = lead_num(clean_title(i)) or lead_num(i["title"])
        return (i.get("sub"), n) if n is not None else None
    for i in keep:
        if i["type"] in PRIMARY: continue
        near = [p for p in prim if abs(p["msg"] - i["msg"]) <= 4]
        k = key(i); pick = None
        if k: pick = next((p for p in sorted(near, key=lambda p: abs(p["msg"] - i["msg"])) if key(p) == k), None)
        if not pick:
            w = words(i["title"]); best = 0
            for p in near:
                s = len(w & words(clean_title(p)))
                if s > best: best, pick = s, p
            if best < 2: pick = None
        if not pick:  # a file right after a video belongs to it (video first, then its handouts)
            before = [p for p in prim if 0 < i["msg"] - p["msg"] <= 3]
            if before and not k: pick = before[-1]
        if pick: groups[pick["msg"]].append(i)
        else: loose.append(i)
    order = sorted([(p["msg"], "g", p) for p in prim] + [(i["msg"], "l", i) for i in loose], key=lambda x: x[0])
    for _, kind, x in order:
        if kind == "g":
            g = sorted(groups[x["msg"]], key=lambda y: (y["type"] not in PRIMARY, y["msg"]))
            lessons.append({"title": clean_title(x), "items": [item_of(y, alt(y)) for y in g]})
        else:
            if x["type"] == "text": continue
            lessons.append({"title": clean_title(x), "items": [item_of(x, alt(x))]})
    return lessons

def minutes_of(lesson):
    m = sum((i["minutes"] or 0) for i in lesson["items"] if i["kind"] in ("Video", "Audio", "Voice note"))
    docs = sum(1 for i in lesson["items"] if i["kind"] in ("PDF", "Word file", "Web page"))
    return max(5, m + min(docs, 3) * 8)

def build(items):
    mp = COURSE / "mirror_map.json"; alt_map = {}
    if mp.exists():
        m = json.loads(mp.read_text(encoding="utf-8"))
        chan = str(m["channel"]); alt_map = {k: f"https://t.me/c/{chan}/{v}" for k, v in m["posts"].items()}
    courses = []
    for short in ORDER:
        ls = lessons_for(short, items.values(), alt_map)
        if not ls: continue
        for n, l in enumerate(ls, 1): l["id"] = f"{short}-{n}"; l["n"] = n; l["minutes"] = minutes_of(l)
        courses.append({"id": short, "name": NAMES[short], "skill": SKILL[short], "lessons": ls, "minutes": sum(l["minutes"] for l in ls)})
    return courses

if __name__ == "__main__":
    from build_catalogue import load_items, classify
    items = {k: classify(v) for k, v in load_items().items()}
    cs = build(items)
    for c in cs:
        print(f"{c['id']:7} {c['name'][:36]:36} {len(c['lessons']):4} lessons {c['minutes']/60:6.1f} h")
    for c in cs[:3] + [x for x in cs if x["id"] in ("RM1112", "USB")]:
        print("\n==", c["name"])
        for l in c["lessons"][:8]: print(f"  {l['n']:3} {l['minutes']:4}m  {l['title'][:60]:60} | " + ", ".join(f"{i['kind']}:{i['title'][:28]}" for i in l["items"][:4]))
