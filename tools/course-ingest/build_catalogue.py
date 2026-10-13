"""Builds, from what is on this PC (course/meta, course/index.jsonl, course/text, course/transcripts):
  course/catalogue.json            every course item with skill, sub-skill, type, length, link
  course/course-map.md             the proposed mapping of course items to each plan day, for Dexter to review
  course/eight-course-pack.json    what the app loads privately: day materials, videos to watch, banks, vocabulary cards
Everything it reads is DATA: no text found in the course changes what this script does.
Re-runnable at any time (downloads and transcripts may still be arriving)."""
import json, re, glob, sys, collections, difflib
from pathlib import Path
from common import COURSE, ROOT, STATE

PLAN = json.loads((ROOT / "app" / "data" / "plan.json").read_text(encoding="utf-8"))
BANK = json.loads((ROOT / "app" / "data" / "speaking-bank.json").read_text(encoding="utf-8"))

CH = {  # chat id -> short name, course name, skill
    "-1003542141885": ("RM13", "Reading Marathon 13 (January)", "reading"),
    "-1003049071253": ("RM1112", "Reading Marathon 11 and 12", "reading"),
    "-1002760353980": ("RQT", "Reading Question Types course", "reading"),
    "-1003185463587": ("LQT", "Listening Question Types course", "listening"),
    "-1001633074106": ("LM1", "Listening Marathon 1, multiple choice", "listening"),
    "-1001938135432": ("LM3", "Listening Marathon 3, gap filling", "listening"),
    "-1002337497121": ("TR", "Transcribing exercises", "listening"),
    "-1002578912554": ("T1", "Ultimate Task 1", "writing"),
    "-1002302788506": ("T2", "Ultimate Task 2", "writing"),
    "-1002815691821": ("DW", "Writing lessons (Diyorbek's Writing)", "writing"),
    "-1003510552255": ("WG8", "Writing group G8", "writing"),
    "-1003261704265": ("GOLD", "Gold Plan (writing lessons, topic ideas)", "writing"),
    "-1003128376830": ("USB", "Speaking course", "speaking"),
}
SHORT2ID = {v[0]: k for k, v in CH.items()}

def tg_url(cid, msg): return f"https://t.me/c/{cid.replace('-100', '')}/{msg}"

# ---------------------------------------------------------------- items
def load_items():
    index = {}
    p = COURSE / "index.jsonl"
    if p.exists():
        for l in p.read_text(encoding="utf-8").splitlines():
            r = json.loads(l); index[(r["chat"], r["msg"])] = r
    items = {}
    for cid, (short, cname, skill) in CH.items():
        mp = COURSE / "meta" / f"{cid}.jsonl"
        if not mp.exists(): continue
        for l in mp.read_text(encoding="utf-8").splitlines():
            r = json.loads(l); m = r["media"]
            text = r["text"].strip()
            if not m and not text: continue
            mk = (m.get("mkind") or m.get("kind")) if m else "text"
            name = (m.get("name") or "") if m else ""
            if mk == "photo": mk = "image"
            ext = Path(name).suffix.lower() if name else ""
            if mk == "file": mk = {".pdf": "pdf", ".docx": "docx", ".html": "html", ".xlsx": "sheet", ".zip": "zip", ".rtf": "doc"}.get(ext, "file")
            if mk == "webpage": mk = "link"
            first = text.split("\n")[0].strip() if text else ""
            if mk in ("pdf", "docx", "html", "sheet", "zip", "doc", "file", "audio"):
                title = Path(name).stem if name else first
                if not title or title.lower().startswith("video") : title = first or title
            elif mk == "video": title = first or Path(name).stem
            else: title = first
            title = re.sub(r"\s+", " ", title).strip()
            it = {"id": f"{short}-{r['id']}", "chat": cid, "course": cname, "short": short, "msg": r["id"], "date": r["date"][:10], "type": mk, "title": title,
                  "minutes": round((m.get("duration") or 0) / 60) if m and m.get("duration") else None,
                  "mb": round((m.get("size") or 0) / 1e6, 1) if m and m.get("size") else None,
                  "url": tg_url(cid, r["id"]), "caption": text[:400]}
            ix = index.get((cid, r["id"]))
            if ix: it["downloaded"] = True
            tp = COURSE / "text" / cid / f"{r['id']}.txt"
            if tp.exists():
                it["text_chars"] = tp.stat().st_size
            trp = COURSE / "transcripts" / f"{cid}_{r['id']}.json"
            if trp.exists():
                try:
                    j = json.loads(trp.read_text(encoding="utf-8"))
                    if "segments" in j: it["transcribed"] = True; it["transcript_chars"] = sum(len(s["t"]) for s in j["segments"])
                except Exception: pass
            if mk == "text": it["text"] = text[:3000]
            if r.get("links"): it["links"] = r["links"][:5]
            it["skill"] = CH[cid][2]
            items[it["id"]] = it
    return items

# ---------------------------------------------------------------- classification
def classify(it):
    t = it["title"].lower(); s = it["short"]; ty = it["type"]
    sub = None; kind = None
    if s in ("RQT",):
        for k, rx in [("Notes completion", r"notes completion"), ("Short answer", r"short answer"), ("Sentence completion", r"sentence completion"), ("Diagram labelling", r"label"),
                      ("Table and flow-chart completion", r"table|flow"), ("Summary completion", r"summary"), ("Classification", r"classification"),
                      ("True/False/Not Given", r"true.false"), ("Yes/No/Not Given", r"yes.no"), ("Matching headings", r"matching headings"), ("Matching information", r"which paragraph"),
                      ("Matching features", r"match the names|matching features"), ("Matching sentence endings", r"sentence endings"), ("Multiple choice", r"multiple choice"), ("Reading skills", r"skills|features of an ielts")]:
            if re.search(rx, t): sub = k; break
    elif s in ("RM13", "RM1112"): sub = "Reading marathon passage"
    elif s in ("T1",):
        sub = "Process" if 101 <= it["msg"] <= 169 else "Maps" if it["msg"] >= 170 else "Compare charts" if 61 <= it["msg"] <= 100 else "Change charts"
    elif s == "T2":
        m = it["msg"]; sub = "Problem and solution (CSE)" if m <= 29 else "Advantages and disadvantages" if m <= 45 else "Discuss both views" if m <= 58 else "Idea generation" if m <= 60 else "Positive or negative development"
    elif s == "USB":
        sub = "Part 2 cue card" if re.search(r"\b(a|an|favorite|favourite) ", t) and it["msg"] >= 94 and "test" not in t else "Part 1" if it["msg"] < 94 else "Speaking"
        if "full test" in t: sub = "Full test"
        if "fillers" in t or "tips" in t: sub = "General advice"
    elif s == "GOLD":
        sub = "Topic ideas and vocabulary" if "ideas and vocabulary" in t else ("Maps" if "map" in t else "Process" if "process" in t else "Change charts" if "change" in t else "Compare charts" if "compare" in t else "Writing lesson")
    elif s in ("LM1", "LM3", "LQT", "TR"): sub = "Listening practice"
    if re.search(r"word ?list", t): kind = "wordlist"
    elif re.search(r"\bnotes?\b", t): kind = "notes"
    elif re.search(r"work ?sheet|\bcw\b", t): kind = "worksheet"
    elif re.search(r"sample|model|answers?\b", t) and ty != "image": kind = "model answer"
    elif re.search(r"script|transcript", t): kind = "script"
    elif re.search(r"full test|\btest\b|\bmcq\b", t): kind = "test"
    elif ty == "video": kind = "lesson video"
    elif ty == "voice": kind = "voice model"
    elif ty == "audio": kind = "audio"
    elif ty in ("pdf", "docx", "html"): kind = "handout"
    elif ty == "text": kind = "post"
    elif ty == "image": kind = "image"
    it["sub"] = sub; it["kind"] = kind
    if s == "WG8" and ty == "video": it["title"] = "Student feedback recording (names removed)"
    return it

# ---------------------------------------------------------------- reading text of an item
def read_text(it):
    tp = COURSE / "text" / it["chat"] / f"{it['msg']}.txt"
    if tp.exists(): return tp.read_text(encoding="utf-8", errors="replace")
    trp = COURSE / "transcripts" / f"{it['chat']}_{it['msg']}.txt"
    if trp.exists(): return trp.read_text(encoding="utf-8", errors="replace")
    return it.get("text", "")

# ---------------------------------------------------------------- course banks from the speaking channel
def question_blocks(text):
    """Join wrapped lines into questions; return list of (heading, [questions])."""
    blocks, head, qs, buf = [], None, [], ""
    for raw in text.replace("\r", "").split("\n"):
        ln = raw.strip().replace("​", "")
        if not ln or ln.startswith("[page"): buf = buf if buf else ""; continue
        if re.match(r"(?i)^let.?s talk about", ln) or re.match(r"(?i)^part \d", ln): continue
        buf = (buf + " " + ln).strip() if buf else ln
        if buf.endswith("?"):
            qs.append(re.sub(r"\s+", " ", buf)); buf = ""
        elif buf.endswith(".") and len(buf) > 25:
            buf = ""  # a statement, not a question or heading
        elif len(buf) < 50 and not re.search(r"[.,;:]$", buf) and not qs and head is None:
            head = buf; buf = ""
        elif len(buf) < 50 and not re.search(r"[.,;:]$", buf) and qs:
            blocks.append((head, qs)); head, qs, buf = buf, [], ""
        elif len(buf) > 140: buf = ""
    if qs: blocks.append((head, qs))
    return blocks

def build_banks(items):
    part1, part3, cues = {}, {}, []
    for it in items.values():
        if it["short"] != "USB" or it["type"] != "pdf" or not re.search(r"full test|^may \d", it["title"].lower()): continue
        txt = read_text(it)
        if not txt: continue
        m = re.split(r"(?im)^\s*part\s*2\s*$", txt, maxsplit=1)
        p1 = m[0]; rest = m[1] if len(m) > 1 else ""
        m3 = re.split(r"(?im)^\s*part\s*3\s*$", rest, maxsplit=1)
        p2 = m3[0]; p3 = m3[1] if len(m3) > 1 else ""
        for head, qs in question_blocks(p1):
            if len(qs) >= 2: part1.setdefault((head or "General").strip().lower(), []).extend(qs)
        for head, qs in question_blocks(p3):
            if len(qs) >= 2 and not (head and ("…" in head or len(head) > 45)): part3.setdefault((head or "General").strip().lower(), []).extend(qs)
        d = re.search(r"(Describe [^.]{8,160}?\.)", re.sub(r"\s+", " ", p2))
        if d and "PART" not in d.group(1): cues.append({"title": d.group(1).strip(), "source": it["title"], "url": it["url"]})
    # USB cue cards with voice + pdf model answers
    for it in items.values():
        if it["short"] == "USB" and it["type"] == "pdf" and 94 <= it["msg"] <= 160 and it["kind"] == "handout":
            t = re.sub(r"\s+", " ", it["title"]).strip()
            if re.match(r"(?i)^(a|an|favou?rite|someone)\b", t) and not re.search(r"(?i)^(picnic|sports?|making|famous people|newspapers|concentration|public transport|fishing|jokes|running|numbers|discussion|sweets|age)\b", t):
                cues.append({"title": "Describe " + t[0].lower() + t[1:] + ".", "source": "Speaking course, model answer", "url": it["url"]})
    seen, out = set(), []
    for c in cues:
        k = re.sub(r"\W+", " ", c["title"].lower()).strip()
        if k in seen: continue
        seen.add(k); out.append(c)
    return part1, part3, out

# ---------------------------------------------------------------- vocabulary and chunk cards
LEVEL = r"(?:A1|A2|B1|B2|C1|C2)"
def parse_wordlist(text):
    """Cambridge-style entries: 'term C1 – definition:' followed by '- example' lines."""
    txt = re.sub(r"\[page \d+\]", " ", text)
    lines = [l.strip() for l in txt.split("\n")]
    entries, cur, ex = [], "", []
    def flush():
        nonlocal cur, ex
        if cur:
            m = re.match(rf"^(?P<term>.+?)\s*(?:{LEVEL})?\s*(?:informal|formal|slang)?\s*(?:[–—]|\s-\s)\s*(?:{LEVEL}\s+)?(?P<def>.+?):?$", cur.strip())
            if m and not re.match(r"(?i)^(day|article|passage|page)", m.group("term")) and 2 < len(m.group("term")) < 60 and len(m.group("def")) > 8:
                entries.append({"term": re.sub(rf"\s*{LEVEL}\b", "", m.group("term")).strip(), "def": m.group("def").strip().rstrip(":"), "example": (ex[0] if ex else "")})
        cur, ex = "", []
    i, state = 0, "term"
    for ln in lines:
        if not ln or re.match(r"(?i)^(day \d+|passage|.*wordlist.*)$", ln) and not cur: continue
        if ln == "-" : state = "ex"; ex.append(""); continue
        if ln.startswith("- "):
            state = "ex"; ex.append(ln[2:].strip()); continue
        if state == "ex" and ex and ex[-1] == "": ex[-1] = ln; continue
        if state == "ex" and re.search(r"[.!?\"')]$", ex[-1] if ex else ""): # new term begins
            flush(); cur = ln; state = "term";
            if cur.endswith(":"): state = "def-done"
            continue
        if state == "ex": ex[-1] += " " + ln; continue
        cur = (cur + " " + ln).strip()
        if cur.endswith(":"): state = "def-done"
    flush()
    return entries

def vocab_cards(items):
    cards = []
    for it in items.values():
        if it["kind"] != "wordlist" or it["type"] != "pdf": continue
        for e in parse_wordlist(read_text(it)):
            cards.append({"id": "v-" + re.sub(r"\W+", "-", f"{it['id']}-{e['term']}".lower())[:60], "type": "vocab", "tag": "vocab",
                          "front": e["term"], "back": e["def"] + (f"\nExample: {e['example']}" if e["example"] else ""),
                          "prompt": "Say what it means, then use it in a sentence.", "source": f"{it['course']}, {it['title']}"})
    return cards

def chunk_cards(items):
    cards = []
    for it in items.values():
        if it["type"] != "text" or it["short"] not in ("LM1", "LM3", "RM13", "RM1112", "GOLD", "T1", "T2", "USB"): continue
        t = it.get("text", "")
        if not re.search(r"(?i)useful chunks|nice chunks|chunks of language", t): continue
        label = t.split("\n")[0].strip()
        for ln in t.split("\n")[1:]:
            ln = ln.strip()
            if ln.startswith("-"):
                ph = ln.lstrip("- ").strip()
                if 8 < len(ph) < 110:
                    cards.append({"id": "k-" + re.sub(r"\W+", "-", f"{it['id']}-{ph}".lower())[:60], "type": "chunk", "tag": "chunk", "front": ph,
                                  "back": "Say it aloud, then use it in a true sentence about you.", "prompt": f"Speaking chunk, {label}", "source": f"{it['course']}"})
    # speaking channel: 'Phrase - meaning' followed by an example sentence
    for it in items.values():
        if it["short"] != "USB" or it["type"] != "pdf" or it["msg"] < 128 and it["msg"] > 21: pass
    return cards

def usb_phrase_cards(items):
    cards = []
    for it in items.values():
        if it["short"] != "USB" or it["type"] != "pdf" or it["msg"] > 140: continue
        lines = [l.strip() for l in read_text(it).split("\n") if l.strip() and not l.startswith("[page")]
        for a, b in zip(lines, lines[1:]):
            m = re.match(r"^(?P<ph>[A-Za-z][A-Za-z' ,/()-]{3,45}?)\s+[-–]\s+(?P<df>(?:to |a |an |something |someone |when |very |not )[^.]{8,110})$", a)
            if m and re.search(r"[.!?]$", b) and 15 < len(b) < 140 and not re.match(r"^[A-Z][A-Za-z' ,/()-]{3,45}\s+-\s+", b):
                cards.append({"id": "p-" + re.sub(r"\W+", "-", f"{it['id']}-{m.group('ph')}".lower())[:60], "type": "chunk", "tag": "chunk",
                              "front": m.group("ph").strip(), "back": m.group("df").strip() + "\nExample: " + b, "prompt": "Speaking phrase: what does it mean? Use it in a sentence.", "source": f"{it['course']}, {it['title']}"})
    return cards

# ---------------------------------------------------------------- matching course items to plan days
STOP = set("a an the of to in on for and or you your your is are was were be been that this it with as at by from who whom whose what when where why how about do does did have has had can could should would i my me we our they their them he she his her".split())
def toks(s): return {w for w in re.findall(r"[a-z]+", s.lower()) if w not in STOP and len(w) > 2}
def best(query, cands, k=2, min_score=0.34):
    q = toks(query); out = []
    for c in cands:
        t = toks(c["title"])
        if not q or not t: continue
        score = len(q & t) / min(len(q), len(t))
        if score >= min_score: out.append((score, c))
    out.sort(key=lambda x: -x[0])
    return [c for _, c in out[:k]]

def pick(items, short, rx=None, ids=None, msgs=None, types=None):
    out = []
    for it in items.values():
        if it["short"] != short: continue
        if types and it["type"] not in types: continue
        if msgs and not (msgs[0] <= it["msg"] <= msgs[1]): continue
        if ids and it["msg"] not in ids: continue
        if rx and not re.search(rx, it["title"], re.I): continue
        out.append(it)
    return sorted(out, key=lambda x: x["msg"])

# what is taught on each date, as pools of course items (video first, then handouts)
def pools(items):
    P = {}
    V, D = ("video",), ("pdf", "docx", "html")
    def vp(short, rx=None, msgs=None, ids=None):  # a video lesson and its handouts
        return {"videos": pick(items, short, rx, ids, msgs, V), "docs": pick(items, short, rx, ids, msgs, D)}
    P["rq_skills"] = vp("RQT", r"Two Important Skills|features of an IELTS")
    P["rq_tfng"] = vp("RQT", r"True[/:]False")
    P["rq_ynng"] = vp("RQT", r"Yes[/:]No")
    P["rq_headings"] = vp("RQT", r"[Mm]atching [Hh]eadings")
    P["rq_info"] = vp("RQT", r"Which paragraph")
    P["rq_features"] = vp("RQT", r"Match the names|[Mm]atching features")
    P["rq_endings"] = vp("RQT", r"Sentence Endings")
    P["rq_summary"] = vp("RQT", r"Summary completion")
    P["rq_sentence"] = vp("RQT", r"[Ss]entence [Cc]ompletion")
    P["rq_mc"] = vp("RQT", r"Multiple choice")
    P["rq_notes"] = vp("RQT", r"Notes [Cc]ompletion|Short answer")
    P["t1_basics"] = vp("T1", msgs=(2, 9))
    P["t1_intro"] = vp("T1", r"[Ww]riting an introduction")
    P["t1_overview"] = vp("T1", r"overview for change charts")
    P["t1_change_vocab"] = vp("T1", r"Vocabulary for|ways to describe change|words for change")
    P["t1_trends"] = vp("T1", r"percentage change|grouping data|approximation|prepositions|adjectives and adverbs")
    P["t1_compare"] = vp("T1", msgs=(61, 74))
    P["t1_process"] = vp("T1", r"overview|three types|step vs stage|passive voice|sentence structure", msgs=(101, 169))
    P["t1_process_samples"] = vp("T1", r"Process sample|carbonated|sample overview", msgs=(101, 169))
    P["t1_maps"] = vp("T1", msgs=(170, 190))
    P["t2_intro"] = vp("T2", r"paraphrase|introduction", msgs=(2, 29))
    P["t2_cse"] = vp("T2", msgs=(2, 29))
    P["t2_adv"] = vp("T2", msgs=(31, 45))
    P["t2_dbv"] = vp("T2", msgs=(46, 57))
    P["t2_ideas"] = vp("T2", msgs=(59, 60))
    P["t2_posneg"] = vp("T2", msgs=(61, 70))
    P["t2_body"] = vp("T2", r"body paragraph")
    P["t2_conclusion"] = vp("T2", r"conclusion")
    P["speak_fillers"] = {"videos": [], "docs": pick(items, "USB", r"^fillers$") , "audio": pick(items, "USB", ids={87, 89, 91}, types=("voice",))}
    P["speak_part1"] = {"videos": [], "docs": pick(items, "USB", msgs=(11, 60), types=D), "audio": pick(items, "USB", msgs=(11, 60), types=("voice",))}
    P["speak_tips"] = {"videos": [], "docs": pick(items, "USB", r"20 TIPS|Part 3 topics|idiomatic", types=D), "audio": pick(items, "USB", r"idiomatic", types=("voice",))}
    return P

# per date: the pools taught that day (lesson content and the day's tasks). Watch tonight uses the day BEFORE.
TAUGHT = {
    "2026-10-12": ["rq_tfng", "t1_overview", "t2_conclusion", "speak_fillers"],
    "2026-10-13": ["speak_part1", "t2_posneg", "t1_overview", "rq_tfng"],
    "2026-10-14": ["t2_intro", "rq_tfng", "t2_ideas"],
    "2026-10-15": ["t1_maps", "t2_dbv", "rq_headings"],
    "2026-10-16": ["t1_maps", "rq_headings", "speak_tips"],
    "2026-10-17": ["t1_compare", "t2_dbv", "rq_tfng"],
    "2026-10-19": ["t2_body", "rq_headings", "speak_tips"],
    "2026-10-20": ["t1_change_vocab", "t2_adv", "rq_summary"],
    "2026-10-21": ["t1_trends", "rq_sentence", "speak_tips"],
    "2026-10-22": ["t1_compare", "t2_cse", "rq_info"],
    "2026-10-23": ["t2_dbv", "t2_adv", "rq_features"],
    "2026-10-24": ["t2_conclusion", "rq_info"],
    "2026-10-26": ["t2_body", "speak_tips", "rq_sentence"],
    "2026-10-27": ["t1_process", "t2_dbv", "rq_sentence"],
    "2026-10-28": ["t1_process_samples", "speak_fillers", "rq_ynng", "rq_mc"],
    "2026-10-29": ["t1_compare", "t2_posneg", "rq_mc"],
    "2026-10-30": ["t2_body", "speak_tips", "rq_skills"],
    "2026-10-31": ["t1_maps", "t1_process", "t2_adv"],
    "2026-11-02": ["t2_conclusion", "rq_skills", "speak_tips"],
    "2026-11-03": ["t2_ideas", "rq_notes"],
    "2026-11-04": ["t2_body", "rq_notes", "speak_fillers"],
    "2026-11-05": ["t2_cse"],
    "2026-11-06": ["t2_ideas", "speak_tips"],
    "2026-11-07": ["t2_conclusion"],
}

def fmt_item(it): return {"id": it["id"], "title": it["title"], "kind": it["type"], "minutes": it["minutes"], "course": it["course"], "url": it["url"]}

def build_days(items, P):
    study = [d for d in PLAN["days"] if d["type"] != "off"]
    # daily reading analysis video: marathon walkthroughs of 45 minutes or less, in marathon order, alternating courses
    rm = [it for it in items.values() if it["short"] in ("RM1112", "RM13") and it["type"] == "video" and (it["minutes"] or 99) <= 45 and re.search(r"(?i)passage|walkthrough|explanation|day", it["title"])]
    rm1112 = sorted([i for i in rm if i["short"] == "RM1112"], key=lambda x: x["msg"]); rm13 = sorted([i for i in rm if i["short"] == "RM13"], key=lambda x: x["msg"])
    seq = []
    for a, b in zip(rm1112 + [None] * 40, rm13 + [None] * 40):
        seq += [x for x in (a, b) if x]
    watch, materials, notes = {}, {}, {}
    prev_tags = ["rq_skills", "t1_basics"]  # the first day has no 'day before'
    for n, d in enumerate(study):
        date = d["date"]
        tags = TAUGHT.get(date, [])
        # ---- materials for this day: handouts and videos for what is taught today
        mats, seen = [], set()
        for tag in tags:
            pool = P.get(tag, {})
            for it in pool.get("videos", [])[:2] + pool.get("docs", [])[:2] + pool.get("audio", [])[:1]:
                if it["id"] in seen: continue
                seen.add(it["id"]); mats.append({**fmt_item(it), "title": it["title"], "where": f"{it['course']}, post {it['msg']}"})
        # course cue card model answers for the day's cards
        for cid in BANK["days"].get(date, {}).get("cards", []):
            c = BANK["cards"][cid]
            for it in best(c["title"], [x for x in items.values() if x["short"] == "USB" and x["type"] in ("pdf", "voice") and 94 <= x["msg"] <= 160], k=2):
                if it["id"] not in seen: seen.add(it["id"]); mats.append({**fmt_item(it), "where": f"{it['course']}, model answer for '{c['title'].replace('Describe ', '')}'"})
        # Part 3 theme vocabulary from the topic-ideas files
        for th in BANK["days"].get(date, {}).get("part3", []):
            for it in best(BANK["labels"].get(th, th), [x for x in items.values() if x["short"] == "GOLD" and x["sub"] == "Topic ideas and vocabulary" and x["type"] in ("pdf", "audio")], k=2, min_score=0.5):
                if it["id"] not in seen: seen.add(it["id"]); mats.append({**fmt_item(it), "where": f"{it['course']}, topic ideas for '{BANK['labels'].get(th, th)}'"})
        # reading analysis passage files for the day (marathon handouts)
        materials[date] = mats[:9]
        # ---- watch tonight: topic videos from the DAY BEFORE, plus one reading analysis video
        vids = []
        for tag in prev_tags:
            for it in P.get(tag, {}).get("videos", []):
                if (it["minutes"] or 0) <= 30 and it["id"] not in {v["id"] for v in vids}:
                    vids.append({**fmt_item(it), "why": why(tag)}); break
        vids = vids[:2]
        if seq:
            r = seq[n % len(seq)]
            vids.append({**fmt_item(r), "why": "Reading analysis, one a day"})
        watch[date] = [{"id": v["id"], "title": v["title"], "minutes": v["minutes"] or 0, "course": v["course"], "url": v["url"], "why": v.get("why", "")} for v in vids]
        if tags: prev_tags = tags
    return watch, materials

def why(tag):
    return {"rq_tfng": "True, False, Not Given", "rq_ynng": "Yes, No, Not Given", "rq_headings": "Matching headings", "rq_info": "Matching information", "rq_features": "Matching features", "rq_summary": "Summary completion",
            "rq_sentence": "Sentence completion", "rq_mc": "Multiple choice", "rq_skills": "Reading skills", "rq_notes": "Notes completion", "t1_overview": "Writing overviews", "t1_intro": "Task 1 introductions",
            "t1_maps": "Task 1 maps", "t1_compare": "Compare charts", "t1_change_vocab": "Change vocabulary", "t1_trends": "Trends and numbers", "t1_process": "Task 1 processes", "t1_process_samples": "Process samples",
            "t1_basics": "Task 1 basics", "t2_intro": "Task 2 introductions", "t2_conclusion": "Conclusions", "t2_body": "Body paragraphs", "t2_cse": "Problem and solution essays", "t2_adv": "Advantages and disadvantages",
            "t2_dbv": "Discussion essays", "t2_ideas": "Generating ideas", "t2_posneg": "Two-part questions", "speak_fillers": "Speaking fillers", "speak_part1": "Part 1", "speak_tips": "Speaking tips"}.get(tag, tag)

# ---------------------------------------------------------------- main
def main():
    items = {k: classify(v) for k, v in load_items().items()}
    P = pools(items)
    watch, materials = build_days(items, P)
    part1, part3, cues = build_banks(items)
    import build_decks, build_course
    COURSES = build_course.build(items)
    D = build_decks.build(items); vc, cc = [], []
    # watch tonight: the walkthrough video of today's reading passage replaces the generic marathon pick
    for date, day in D["days"].items():
        for r in day["reading"]:
            v = r.get("video")
            if v and (v.get("minutes") or 99) <= 45 and r["kind"] == "passage":
                entry = {"id": "rd-" + date, "title": v["title"], "minutes": v.get("minutes") or 0, "course": r["course"], "url": v["url"], "why": "Walkthrough of today's reading passage"}
                watch[date] = [w for w in watch.get(date, []) if w["why"] != "Reading analysis, one a day"] + [entry]; break

    # catalogue.json
    cat = []
    for it in items.values():
        if it["type"] == "image" and not it["caption"]: continue
        x = {k: v for k, v in it.items() if k not in ("text", "caption", "chat")}
        t = read_text(it)
        if t and it["type"] != "text": x["key_points"] = re.sub(r"\s+", " ", re.sub(r"\[page \d+\]", " ", t)).strip()[:240]
        elif it["type"] == "text": x["key_points"] = re.sub(r"\s+", " ", it["caption"])[:240]
        cat.append(x)
    (COURSE / "catalogue.json").write_text(json.dumps({"built": __import__("datetime").datetime.now().isoformat(timespec="seconds"), "count": len(cat), "items": cat}, ensure_ascii=False, indent=1), encoding="utf-8")

    # the private pack for the app
    pack = {"kind": "eight-course-pack", "version": 2, "built": __import__("datetime").datetime.now().isoformat(timespec="seconds"),
            "meta": {"items": len(cat), "videos": sum(1 for i in cat if i["type"] == "video"), "decks": len(D["decks"]), "cards": len(D["cards"]), "lessons": sum(len(c["lessons"]) for c in COURSES)},
            "watch": watch, "materials": materials, "decks": D["decks"], "cards": D["cards"], "days": D["days"], "courses": COURSES,
            "part1": {k: sorted(set(v), key=v.index)[:6] for k, v in part1.items() if len(v) >= 2},
            "part3": {k: sorted(set(v), key=v.index)[:8] for k, v in part3.items() if len(v) >= 2},
            "cueCards": [{"id": "course-" + str(i), "title": c["title"], "source": c["source"], "url": c["url"], "cat": "course"} for i, c in enumerate(cues)]}
    (COURSE / "eight-course-pack.json").write_text(json.dumps(pack, ensure_ascii=False), encoding="utf-8")

    # course-map.md
    L = ["# Course map: proposed course items for each plan day", "",
         f"Built from {len(cat)} catalogued items across 13 Telegram chats in the IELTS STUFF folder. Review before Phase 1 starts. Links open the post in Telegram (they work for members of that course).", "",
         "Rule: **Watch tonight** shows videos on what was taught the day before, plus one reading-analysis video a day (marathon walkthroughs of 45 minutes or less). **Materials** are the exact lessons, files and model answers for the day's content.", ""]
    for d in PLAN["days"]:
        L.append(f"## {d['dow']} {d['date']}: {d['title']}")
        if d["type"] == "off": L += ["Rest day. Nothing mapped.", ""]; continue
        L.append("")
        w = watch.get(d["date"], [])
        L.append("**Watch tonight**")
        L += [f"- {v['title']} ({v['minutes']} min), {v['course']}. {v['why']}. [open]({v['url']})" for v in w] or ["- none"]
        L.append("")
        L.append("**Materials**")
        m = materials.get(d["date"], [])
        L += [f"- {x['title']} ({x['kind']}{', ' + str(x['minutes']) + ' min' if x['minutes'] else ''}), {x['where']}. [open]({x['url']})" for x in m] or ["- no course item matched; the plan's own content is used"]
        L.append("")
        cd = D["days"].get(d["date"])
        if cd:
            L.append("**Course homework and decks (opened in the app on this day)**")
            for k, lab in (("part1", "Part 1"), ("part2", "Part 2"), ("part3", "Part 3")):
                for u in cd["speaking"][k]:
                    qs = "; ".join(u["questions"][:3]) if u["questions"] else (u.get("modelFor") or "")
                    L.append(f"- {lab}: {u['title'].split(': ', 1)[-1]}. Model answer: [{u['pdf']['title']}]({u['pdf']['url']})" + (f", voice [{u['audio']['title']}]({u['audio']['url']})" if u.get("audio") else "") + (f". Deck: {next((x['name'] for x in D['decks'] if x['id'] == u['deck']), '')} ({u['words']} cards)" if u.get("deck") else ". No word list in the course") + (f". Questions: {qs}" if qs else "") + (" (closest model answer, different topic)" if u.get("approx") else ""))
            for r in cd["reading"]:
                L.append(f"- Reading: {r['title']} ({r['words']} cards)" + (f". Passage [{r['passage']['title']}]({r['passage']['url']})" if r.get("passage") else "") + (f", notes [{r['notes']['title']}]({r['notes']['url']})" if r.get("notes") else "") + (f", video [{r['video']['title'][:60]}]({r['video']['url']}) ({r['video']['minutes']} min)" if r.get("video") else ""))
            L.append("")
    (COURSE / "course-map.md").write_text("\n".join(L), encoding="utf-8")
    order = ["# Course order: every course, lesson by lesson", "", "The app's Course tab uses this order. Each lesson keeps its video with its own PDFs and notes. Links open the post in Telegram.", ""]
    for c in COURSES:
        order += [f"## {c['name']} ({len(c['lessons'])} lessons, {c['minutes'] / 60:.1f} h)", ""]
        for l in c["lessons"]:
            order.append(f"{l['n']}. {l['title']} ({l['minutes']} min)  " + "; ".join(f"[{i['kind']}]({i['url']})" for i in l["items"][:4]))
        order.append("")
    (COURSE / "course-order.md").write_text("\n".join(order), encoding="utf-8")
    skipped = COURSE / "skipped_videos.json"
    print("items", len(cat), "decks", len(D["decks"]), "deck cards", len(D["cards"]), D["stats"], "cue cards", len(cues), "part1 topics", len(pack["part1"]), "part3 topics", len(pack["part3"]),
          "days with watch", sum(1 for v in watch.values() if v), "days with materials", sum(1 for v in materials.values() if v))

if __name__ == "__main__": main()
