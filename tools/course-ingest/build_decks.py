"""Builds the named decks and the day-by-day course homework for the app (pack v2).
Reads the same course data as build_catalogue.py. Output is merged into course/eight-course-pack.json by build_catalogue.py."""
import re, json, math
from pathlib import Path
from common import COURSE, ROOT
import units as U

PLAN = json.loads((ROOT / "app" / "data" / "plan.json").read_text(encoding="utf-8"))
BANK = json.loads((ROOT / "app" / "data" / "speaking-bank.json").read_text(encoding="utf-8"))
USB = "-1003128376830"

def slug(s): return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:48]
def title_case(s):
    s = re.sub(r"\s+", " ", s).strip(" .-_")
    small = {"a", "an", "the", "of", "to", "in", "on", "or", "and", "for"}
    return " ".join(w if (i and w.lower() in small) else (w[:1].upper() + w[1:].lower() if w.isupper() or w.islower() else w) for i, w in enumerate(s.split(" ")))
def tg(cid, msg): return f"https://t.me/c/{cid.replace('-100', '')}/{msg}"
def trim_heading(q):  # "PUBLIC PLACES (parks, cafes, etc) Do you enjoy...?" -> "Do you enjoy...?"
    return re.sub(r"^[A-Z][A-Z ,/&()'.-]{5,}\s+(?=[A-Z][a-z])", "", q).strip()

# ---------------------------------------------------------------- Part 1 units
def p1_units(items):
    out = []
    usb = {i["msg"]: i for i in items.values() if i["short"] == "USB"}
    voices = [i for i in usb.values() if i["type"] == "voice"]
    def voice_for(msg, topic):
        cands = [v for v in voices if abs(v["msg"] - msg) <= 3]
        toks = {w for w in re.findall(r"[a-z]+", topic.lower()) if len(w) > 3}
        best = [v for v in cands if toks & set(re.findall(r"[a-z]+", (v["caption"] or v["title"]).lower()))]
        v = (best or [None])[0]
        return {"title": v["title"] or topic, "url": v["url"]} if v else None
    # A: one PDF per topic with questions, model answers and a phrase list
    A_MSGS = [m for m, i in usb.items() if i["type"] == "pdf" and not re.match(r"(?i)^p1\b", i["title"]) and (m <= 47 or re.search(r"(?i)day.off|learning languages|small businesses", i["title"])) and m not in (55, 57)]
    for msg in sorted(A_MSGS):
        it = usb[msg]; txt = U.read_item_text(USB, msg)
        if len(txt) < 400: continue
        pairs = U.phrase_pairs(txt); qs = [trim_heading(q) for q in U.questions(txt)]
        if len(pairs) < 3 and len(qs) < 2: continue
        topic = title_case(re.sub(r"^\d+\s*", "", it["title"]).replace("-", " "))
        out.append({"id": f"p1-{msg}", "kind": "p1", "src": "A", "topic": topic, "questions": qs[:8], "text": U.paragraphs(txt)[:60], "pairs": pairs,
                    "pdf": {"title": it["title"], "url": it["url"]}, "audio": voice_for(msg, topic)})
    # B: the 51-topic booklet: questions, model answers and quoted phrases
    big = usb.get(183)
    if big:
        L = [re.sub(r"\s+", " ", l).strip() for l in U.clean(U.read_item_text(USB, 183)).split("\n")]
        L = [l for l in L if l and not l.startswith("[page")]
        heads = [i for i, l in enumerate(L[:-1]) if re.match(r"^\d{1,2}[.)]?\s+[A-Z][A-Za-z/&' ,-]{2,40}$", l) and not l.endswith("?") and re.match(r"^1[.)]?\s", L[i + 1])]
        for n, h in enumerate(heads):
            end = heads[n + 1] if n + 1 < len(heads) else len(L)
            sect = L[h + 1:end]; name = title_case(re.sub(r"^\d+[.)]?\s+", "", L[h]))
            body = "\n".join(sect)
            qs = [re.sub(r"^\d+[.)]\s*", "", q) for q in U.questions(body)]
            qs = [q for q in qs if not re.search(r"(?i)which one|what do you do .the odd|means", q)][:6]
            pairs = []
            for m in re.finditer(r"[‘'“\"]([^’'”\"\n]{3,50})[’'”\"]\s+(?:means|is a|is an|=)\s+([^.\n]{6,110})[.\n]", body):
                pairs.append({"term": m.group(1).strip(), "meaning": m.group(2).strip(), "example": ""})
            for m in re.finditer(r"([A-Za-z][A-Za-z' -]{2,35})\s+=\s+([^.\n]{6,100})", body):
                pairs.append({"term": m.group(1).strip(), "meaning": m.group(2).strip(), "example": ""})
            if len(qs) >= 2:
                out.append({"id": f"p1b-{n + 1}", "kind": "p1", "src": "B", "topic": name, "questions": qs, "text": U.paragraphs(body)[:40], "pairs": pairs[:14],
                            "pdf": {"title": "Part 1 topics (51 topics)", "url": big["url"]}, "audio": None})
    # C: the question booklet: topic, then four or five questions
    c = usb.get(181)
    if c:
        L = [re.sub(r"\s+", " ", l).strip() for l in U.clean(U.read_item_text(USB, 181)).split("\n")]
        L = [l for l in L if l and not l.startswith("[page")]
        i = 0
        while i < len(L) - 2:
            if re.match(r"^\d{1,2}$", L[i]) and not L[i + 1].endswith("?") and L[i + 2].endswith("?"):
                name = title_case(L[i + 1]); j = i + 2; qs = []
                while j < len(L) and L[j].endswith("?"): qs.append(L[j]); j += 1
                if len(qs) >= 2: out.append({"id": f"p1c-{L[i]}", "kind": "p1", "src": "C", "topic": name, "questions": qs, "text": [], "pairs": [], "pdf": {"title": c["title"], "url": c["url"]}, "audio": None})
                i = j
            else: i += 1
    return out

# ---------------------------------------------------------------- Part 2 cue card model answers
def p2_units(items):
    out = []
    usb = {i["msg"]: i for i in items.values() if i["short"] == "USB"}
    voices = [i for i in usb.values() if i["type"] == "voice"]
    for msg, it in sorted(usb.items()):
        if it["type"] != "pdf" or not (94 <= msg <= 160): continue
        t = it["title"]
        if re.match(r"(?i)^(picnic|sports?|making|famous people|newspapers|concentration|public transport|fishing|jokes|running|numbers|discussion|sweets|age|\d+\s)", t): continue
        txt = U.read_item_text(USB, msg)
        if len(txt) < 600: continue
        pairs = U.phrase_pairs(txt)
        if len(pairs) < 3: continue
        first = next((l for l in U.lines_of(txt)[:8] if l.lower().startswith("describe")), "")
        title = (re.sub(r"\s+", " ", first).rstrip(". ") if first else "Describe " + t[:1].lower() + t[1:]).strip()
        if len(title) > 120: title = title[:117].rsplit(" ", 1)[0] + "..."
        near = [v for v in voices if abs(v["msg"] - msg) <= 2]
        toks = {w for w in re.findall(r"[a-z]+", t.lower()) if len(w) > 3}
        vv = next((v for v in near if toks & set(re.findall(r"[a-z]+", (v["caption"] or v["title"]).lower()))), None)
        paras = U.paragraphs(txt)
        story = []
        for p in paras:
            if PAIR_LINE.match(p) or story and len(story) > 0 and False: break
            story.append(p)
        out.append({"id": f"p2-{msg}", "kind": "p2", "src": "A", "topic": title, "title": title, "questions": [], "text": paras[:40], "pairs": pairs,
                    "pdf": {"title": t, "url": it["url"]}, "audio": ({"title": vv["title"] or t, "url": vv["url"]} if vv else None)})
    return out
def unit_cat(u):
    t = u["title"].lower()
    if re.search(r"\b(person|friend|someone|people|teacher|relative|neighbou?r|family member)\b", t): return "person"
    if re.search(r"\b(item|book|toy|object|animal|gift|thing|film|website|app|device|phone)\b", t): return "object"
    if re.search(r"\b(place|city|town|park|building|restaurant|house|room)\b", t): return "place"
    if re.search(r"\b(time|event|occasion|journey|trip|party|celebration|experience)\b", t): return "event"
    return "other"
PAIR_LINE = re.compile(r"^[^–—]{2,64}\s[–—-]\s\S")

# ---------------------------------------------------------------- Part 3 topics (12 topics with highlighted phrases)
P3_TOPICS = ["Art", "Clothes", "Education", "Family", "Food", "Health", "Internet", "Media & News", "Nature", "Society", "Travel", "Work"]
def p3_units(items):
    out = []; it = next((i for i in items.values() if i["short"] == "USB" and i["msg"] == 184), None)
    if not it: return out
    raw = U.read_item_text(USB, 184)
    marks = [(m.start(), m.group(1).strip()) for m in re.finditer(r"Common questions about (?:the )?([^+\n]+?)\s*\+", raw)]
    for n, (pos, name) in enumerate(marks):
        end = marks[n + 1][0] if n + 1 < len(marks) else len(raw)
        sect = raw[pos:end]
        hl = []
        for seg in sect.split("​")[1::2]:
            t = re.sub(r"\s+", " ", seg).strip(" ,.;:…-")
            if 3 <= len(t) <= 40 and len(t.split()) <= 5 and "\n" not in seg and not re.match(r"(?i)^(i|and|the|a|but|so|it|my)$", t): hl.append(t)
        flat = re.sub(r"\s+", " ", U.clean(sect))
        pairs, seen = [], set()
        for t in hl:
            k = t.lower()
            if k in seen: continue
            seen.add(k)
            sm = re.search(r"([^.!?]*\b" + re.escape(t) + r"\b[^.!?]*[.!?]?)", flat, re.I)
            pairs.append({"term": t, "meaning": "", "example": (sm.group(1).strip() if sm else "")[:220]})
        for m in re.finditer(r"([A-Z][A-Za-z\- ']{2,30}):\s*\n?\s*([a-z][^\n]{8,140})", U.clean(sect)):  # glossary: "Thought-provoking: challenging or ..."
            pairs.append({"term": m.group(1).strip(), "meaning": m.group(2).strip(), "example": ""})
        qs = [q for q in U.questions(sect) if len(q) < 150][:8]
        out.append({"id": f"p3-{slug(name)}", "kind": "p3", "src": "A", "topic": name, "questions": qs, "text": U.paragraphs(sect)[:70], "pairs": pairs[:30],
                    "pdf": {"title": it["title"], "url": it["url"]}, "audio": None})
    return out

THEME2P3 = {"skills": ["Education", "Work"], "work": ["Work"], "cities": ["Society", "Travel"], "technology": ["Internet"], "environment": ["Nature"], "media": ["Media & News"], "decisions": ["Society"],
            "family": ["Family"], "travel": ["Travel"], "shopping": ["Clothes", "Food"], "consumerism": ["Clothes"], "education": ["Education"], "government": ["Society"], "society": ["Society"],
            "advice": ["Family"], "health": ["Health"], "ambition": ["Work"]}

# ---------------------------------------------------------------- reading units
def reading_units(items):
    out = []
    for it in items.values():
        if it["short"] not in ("RM1112", "RM13") or it["type"] != "pdf": continue
        if not re.search(r"(?i)word ?list|article words", it["title"]): continue
        txt = U.read_item_text(it["chat"], it["msg"])
        entries = U.wordlist_entries(txt)
        pp = [{"term": p["term"], "meaning": p["meaning"], "example": p["example"]} for p in U.phrase_pairs(txt)]
        if len(pp) > len(entries): entries = pp
        if len(entries) < 5: continue
        t = it["title"]; m = re.search(r"(?i)day[ _-]*(\d+)", t); day = int(m.group(1)) if m else None
        pm = re.search(r"(?i)passage[ _-]*(\d)|\bP(\d)\b", t); passage = int(next(g for g in pm.groups() if g)) if pm else None
        art = re.search(r"(?i)article[ _-]*(\d+)", t); article = int(art.group(1)) if art else None
        kind = "article" if (article or re.search(r"(?i)article", t)) else "passage"
        out.append({"item": it, "entries": entries, "day": day, "passage": passage, "article": article, "kind": kind})
    merged = {}
    for r in out:
        key = (r["item"]["short"], r["day"], r["kind"], r["passage"] if r["kind"] == "passage" else r["article"])
        if r["day"] is not None and key in merged:
            m = merged[key]; seen = {e["term"].lower() for e in m["entries"]}
            m["entries"] += [e for e in r["entries"] if e["term"].lower() not in seen]
        else: merged[key if r["day"] is not None else id(r)] = r
    return list(merged.values())

def passage_info(items, ru):
    it = ru["item"]; sib = [i for i in items.values() if i["chat"] == it["chat"]]
    day = ru["day"]; name = None; passage = notes = video = None
    if day:
        rx = re.compile(rf"(?i)\bday[ _-]*{day}\b")
        pdfs = [i for i in sib if i["type"] == "pdf" and rx.search(i["title"]) and not re.search(r"(?i)word ?list|article", i["title"])]
        notes_l = [i for i in pdfs if re.search(r"(?i)notes?", i["title"])]
        pas_l = [i for i in pdfs if i not in notes_l and (ru["passage"] is None or re.search(rf"(?i)(passage|p)[ _-]*{ru['passage']}", i["title"]))]
        videos = [i for i in sib if i["type"] == "video" and (rx.search(i["title"]) or rx.search(i["caption"]))]
        passage = pas_l[0] if pas_l else None; notes = notes_l[0] if notes_l else None; video = videos[0] if videos else None
        own = (passage["title"] if passage else "")
        cap = (video["caption"].split("\n")[0] if video and video["caption"] else "")
        if not own and cap and (ru["passage"] is None or re.search(rf"(?i)passage[ _-]*{ru['passage']}\b|\bP{ru['passage']}\b", cap)): own = cap
        cand = re.sub(r"(?i)\bday[ _-]*\d+\b|\bpassage[ _-]*\d\b|\bP\d\b|video|explanation|walkthrough|explained|youtube link|notes|\.pdf|[–—-]+$|^[–—\s:-]+", " ", own)
        cand = re.sub(r"https?://\S+|[↘️]", "", cand); name = re.sub(r"\s+", " ", cand).strip(" -–—:._")
        if len(name) < 3 or len(name) > 70: name = None
    return {"name": name, "passage": passage, "notes": notes, "video": video}

def good_name(nm): return len(re.sub(r"[^A-Za-z]", "", nm)) >= 3

def clean_name(t):
    t = re.sub(r"(?i)\bday[ _,-]*\d+\b|\bpassage[ _,-]*\d*\b|\barticles?[ _,-]*\d*\b|word ?list|aritlce|arrticle|\.pdf|[_,]|\(\d\)", " ", t)
    return re.sub(r"\s+", " ", t).strip(" -–—:")

def deck_name_reading(ru, info):
    it = ru["item"]; nm = clean_name(it["title"]); nm = nm if good_name(nm) else (info["name"] or "")
    course = "Marathon 11 and 12" if it["short"] == "RM1112" else "Marathon 13"
    if ru["kind"] == "article":
        n = ru["article"] or ru["day"]
        return (f"Reading: Article {n}" + (f", {title_case(nm)}" if good_name(nm) else "")) if n else f"Reading: {course} article words"
    if ru["day"]:
        base = f"Reading: Day {ru['day']}" + (f", Passage {ru['passage']}" if ru["passage"] else "")
        return base + (f", {title_case(nm)}" if good_name(nm) else "")
    num = re.search(r"(\d+)", it["title"]); return f"Reading: {course}, word list" + (f" {num.group(1)}" if num else "")

# ---------------------------------------------------------------- assigning to plan days
P1_SYN = {"work": ["work"], "home": ["home"], "hometown": ["hometown"], "free time": ["taking a break", "taking breaks", "having a day off", "playing"], "reading": ["books", "newspapers"], "music": ["voice", "laughing"],
          "transport": ["public transport"], "shopping": ["buying", "jeans", "shoes"], "sport": ["sports", "running"], "neighbours": ["relatives", "stranger", "friends"], "holidays": ["public holidays", "picnics"],
          "cooking": ["baking", "sweets", "coffee"], "clothes": ["jeans", "shoes", "perfume"], "internet": ["social media", "emails"], "friends": ["friends"], "photographs": ["art", "scenery", "cinema"],
          "sleep": ["staying up late", "keeping healthy"], "weekends": ["having a day off", "taking a break", "taking breaks"], "mornings": ["staying up late", "tidiness"], "weather": ["seasons", "scenery"],
          "studies": ["studies", "teachers"], "work/study": ["work", "studies"], "crowded": ["crowded places", "public places"], "public places": ["public places", "crowded places"]}

def part1_topics_for(day):
    if day.get("questions") and day["questions"].get("part1"):
        return [g.split(":")[0].strip().lower() for g in day["questions"]["part1"].split(" · ") if ":" in g]
    w = next((a["text"] for a in day.get("agenda", []) if re.search(r"(?i)warm-up", a["title"])), "")
    m = re.search(r"(?i)part 1:\s*([^.]+)", w)
    return [x.strip().lower() for x in re.split(r",| and ", m.group(1)) if x.strip()] if m else []

def build(items):
    P1 = p1_units(items); P2 = p2_units(items); P3 = p3_units(items); RU = reading_units(items)
    for r in RU: r["info"] = passage_info(items, r)
    study = [d for d in PLAN["days"] if d["type"] != "off"]
    rank = {"A": 0, "B": 1, "C": 2}
    P1_sorted = sorted(P1, key=lambda u: (rank[u["src"]], u["id"]))
    used1, used2 = set(), set(); p3_done, p3_deck = set(), {}

    def find_p1(topic):
        keys = P1_SYN.get(topic, [topic])
        for key in keys:
            for u in P1_sorted:
                if u["id"] in used1: continue
                if key in u["topic"].lower() or u["topic"].lower() in key: return u
        return None
    def next_p1():
        for u in P1_sorted:
            if u["id"] not in used1 and (u["src"] in ("A", "B")): return u
        return None

    # reading: the marathon's own day order. Study day n gets the units of marathon Day n; leftovers go to later days.
    RU.sort(key=lambda r: (0 if r["item"]["short"] == "RM1112" else 1, r["day"] or 999, 0 if r["kind"] == "passage" else 1, r["article"] or 0))
    by_day = {}
    for r in RU:
        if r["item"]["short"] == "RM1112" and r["day"]: by_day.setdefault(r["day"], []).append(r)
    spill = [r for r in RU if not (r["item"]["short"] == "RM1112" and r["day"])]
    days, decks, cards = {}, [], []

    def add_deck(date, name, kind, source_title, url, pairs, ctype, prompt, src_label, minimum=3):
        did = "d-" + slug(name) + "-" + str(len(decks))
        n = 0
        for p in pairs:
            front = p["term"].strip()
            if not front: continue
            meaning = re.sub(r"^(?:A1|A2|B1|B2|C1|C2)\s+", "", (p.get("meaning") or "").strip())
            if re.fullmatch(r"(?i)(phrasal verb|idiom|noun|verb|adjective|adverb|expression|informal|formal)\.?", meaning): meaning = ""
            ex = (p.get("example") or "").strip()
            if meaning:
                back = meaning + (("\nExample: " + ex) if ex else "")
            elif ex and kind == "speaking3":
                if len(front) < 5 or front.lower() in ("even", "also", "really", "very", "much", "just", "maybe", "actually"): continue
                back = "In the model answer: " + ex
            else: continue
            if len(back) < 12: continue
            cards.append({"id": f"{did}-{n}", "deck": did, "type": ctype, "tag": kind, "front": front, "back": back, "prompt": prompt, "source": src_label}); n += 1
        if n < minimum:
            while cards and cards[-1]["deck"] == did: cards.pop()
            return None
        decks.append({"id": did, "name": name, "kind": kind, "date": date, "count": n, "source": {"title": source_title, "url": url}})
        return did

    ri = 0
    for d in study:
        date = d["date"]; info = BANK["days"].get(date, {}); day = {"speaking": {"part1": [], "part2": [], "part3": []}, "reading": [], "tasks": []}
        # ---- Part 1: the plan's topics first, then the next unused course topic
        want = part1_topics_for(d); picks = []
        for t in want:
            u = find_p1(t)
            if u and u not in picks: picks.append(u); used1.add(u["id"])
        limit = 2 if d["type"] in ("lesson", "self") else 1
        while len(picks) < limit:
            u = next_p1()
            if not u: break
            picks.append(u); used1.add(u["id"])
        for u in picks[:2]:
            name = f"Speaking Part 1: {u['topic']}"
            did = add_deck(date, name, "speaking1", u["pdf"]["title"], u["pdf"]["url"], u["pairs"], "chunk", "Say it aloud, then use it in an answer about you.", "Part 1 model answer")
            day["speaking"]["part1"].append({**{k: u[k] for k in ("id", "kind", "topic", "questions", "text", "pdf", "audio")}, "title": f"Part 1: {u['topic']}", "deck": did, "words": len(u["pairs"])})
        # ---- Part 2: the course's model answer for the day's cue card (closest match; otherwise the next unused one)
        for cid in info.get("cards", [])[:2]:
            c = BANK["cards"][cid]; toks = lambda x: {w for w in re.findall(r"[a-z]+", x.lower()) if w not in STOP and len(w) > 2}
            qt = toks(c["title"]); best = None; bs = 0
            for u in P2:
                if u["id"] in used2: continue
                ut = toks(u["title"])
                if not qt or not ut: continue
                sc = len(qt & ut) / min(len(qt), len(ut))
                if sc > bs: best, bs = u, sc
            approx = False
            if not best or bs < 0.3:
                # no close match: only use another model answer of the same kind (a person for a person card), and say it is the closest
                best = next((u for u in P2 if u["id"] not in used2 and unit_cat(u) == c["cat"]), None); approx = True
            if best:
                used2.add(best["id"]); label = best["title"].replace("Describe ", "").rstrip(".")
                name = f"Speaking Part 2: {label[:1].upper() + label[1:]}"
                did = add_deck(date, name, "speaking2", best["pdf"]["title"], best["pdf"]["url"], best["pairs"], "chunk", "Say it aloud, then use it in your own Part 2 story.", "Part 2 model answer")
                day["speaking"]["part2"].append({**{k: best[k] for k in ("id", "kind", "text", "pdf", "audio")}, "topic": c["title"], "title": f"Part 2: {c['title'].replace('Describe ', '').rstrip('.')}", "questions": [], "deck": did, "words": len(best["pairs"]), "cardId": cid, "modelFor": best["title"], "approx": approx})
        # ---- Part 3: one topic a day; each topic gets its deck once, later days show the questions again
        for th in info.get("part3", [])[:1]:
            opts = [x for tp in THEME2P3.get(th, []) for x in P3 if x["topic"] == tp]
            u = next((x for x in opts if x["id"] not in p3_done), opts[0] if opts else None)
            if u:
                new = u["id"] not in p3_done; p3_done.add(u["id"]); did = p3_deck.get(u["id"])
                if new:
                    did = add_deck(date, f"Speaking Part 3: {u['topic']}", "speaking3", u["pdf"]["title"], u["pdf"]["url"], u["pairs"], "chunk", "Use it in your own Part 3 answer on this topic.", "Part 3 model answers"); p3_deck[u["id"]] = did
                day["speaking"]["part3"].append({**{k: u[k] for k in ("id", "kind", "topic", "questions", "text", "pdf", "audio")}, "title": f"Part 3: {u['topic']}", "deck": did if new else None, "words": len(u["pairs"]) if new else 0, "again": not new})
        # ---- Reading
        n_study = study.index(d) + 1
        todays = list(by_day.get(n_study, [])[:3])
        while len(todays) < 2 and spill: todays.append(spill.pop(0))
        for r in todays:
            ri += 1; info_r = r["info"]; name = deck_name_reading(r, info_r)
            ents = [{"term": e["term"], "meaning": e["meaning"], "example": e["example"]} for e in r["entries"]]
            did = add_deck(date, name, "reading", r["item"]["title"], r["item"]["url"], ents, "vocab", "Say what it means, then use it in a sentence.", r["item"]["course"], minimum=5)
            if not did: continue
            fm = lambda x: ({"title": x["title"], "url": x["url"]} if x else None)
            day["reading"].append({"title": name.replace("Reading: ", ""), "kind": r["kind"], "deck": did, "words": len(ents), "wordlist": fm(r["item"]), "passage": fm(info_r["passage"]), "notes": fm(info_r["notes"]),
                                   "video": ({"title": info_r["video"]["title"] or name, "url": info_r["video"]["url"], "minutes": info_r["video"]["minutes"]} if info_r["video"] else None), "course": r["item"]["course"]})
        # ---- homework tasks (one per unit)
        tn = 0
        def task(text, minutes, route, deck=None, unit=None):
            nonlocal tn; tn += 1
            day["tasks"].append({"id": f"c{tn}", "text": text, "minutes": minutes, "route": route, "deck": deck, "unit": unit})
        for u in day["speaking"]["part1"]: task(f"Read and listen to the model answer: {u['topic']} (Part 1)", 10, f"#/model/{u['id']}", None, u["id"])
        for u in day["speaking"]["part2"]: task(f"Read and listen to the model answer for your Part 2 card: {u['title'].replace('Part 2: ', '')}", 10, f"#/model/{u['id']}", None, u["id"])
        for u in day["speaking"]["part3"]:
            if u["deck"]: task(f"Read the model answers on {u['topic']} (Part 3)", 10, f"#/model/{u['id']}", None, u["id"])
        todays_decks = [u["deck"] for k in ("part1", "part2", "part3") for u in day["speaking"][k] if u.get("deck")] + [r["deck"] for r in day["reading"]]
        if todays_decks:
            total = sum(x["count"] for x in decks if x["id"] in todays_decks)
            task(f"Learn today's new words: {total} cards in {len(todays_decks)} decks", 15, f"#/review/session?day={date}", None, None)
        days[date] = day
    return {"decks": decks, "cards": cards, "days": days, "stats": {"p1": len(P1), "p2": len(P2), "p3": len(P3), "reading": len(RU), "p1_used": len(used1), "p2_used": len(used2), "reading_used": ri}}

STOP = set("a an the of to in on for and or you your is are was were be been that this it with as at by from who whom what when where why how about do does did have has had can could should would i my me we our they their them he she his her describe person someone something time".split())

if __name__ == "__main__":
    from build_catalogue import load_items, classify
    items = {k: classify(v) for k, v in load_items().items()}
    r = build(items)
    print(r["stats"], "decks", len(r["decks"]), "cards", len(r["cards"]))
    for d in r["decks"][:60]: print(f"  {d['date']}  {d['count']:3d}  {d['name']}")
