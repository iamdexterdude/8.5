"""Build the merged speaking course as HTML from the pulled channels, following speaking_plan.py.
  python speaking_build.py            -> course/speaking/build/course.html (+ toc.json read back after the first PDF pass)
"""
import json, re, html, hashlib, sys
from pathlib import Path
from common import COURSE
import speaking_plan as plan

ROOT = COURSE / "speaking"
BUILD = ROOT / "build"; BUILD.mkdir(exist_ok=True)
TOC_PAGES = BUILD / "toc_pages.json"          # written by the PDF renderer after pass 1

MARK = re.compile(r"==([a-z]+|rgb\([0-9,]+\)):(.*?)==", re.S)
BOLD = re.compile(r"\*\*(.+?)\*\*", re.S)

# ---------------------------------------------------------------- loading
def load_unit_text(ch, mid):
    d = ROOT / plan.CHANNELS[ch]
    ex = d / "extract" / f"{mid}.md"; oc = d / "ocr" / f"{mid}.txt"
    text = ""
    if ex.exists():
        t = ex.read_text(encoding="utf-8")
        text = t.split("---- file:", 1)[1].split("----", 1)[1] if "---- file:" in t else t.split("\n", 2)[-1]
    if oc.exists(): text = (text + "\n\n" if text.strip() else "") + oc.read_text(encoding="utf-8")
    text = re.sub(r"(?m)^\[page \d+\]\s*", "", text)
    text = re.sub(r"(?im)^\s*DIYORBEK.S\s+IELTS\s*", "", text)
    return text

def file_title(ch, mid):
    d = ROOT / plan.CHANNELS[ch]
    for p in (d / "files").iterdir():
        if p.name.startswith(f"{mid}_"):
            name = p.name.split("_", 1)[1]
            if p.suffix.lower() in (".jpg", ".png", ".jpeg"): return ""
            return re.sub(r"\.(pdf|docx)$", "", name, flags=re.I).strip()
    return ""

def caption(ch, mid):
    d = ROOT / plan.CHANNELS[ch]
    for l in (d / "messages.jsonl").read_text(encoding="utf-8").splitlines():
        r = json.loads(l)
        if r["id"] == mid: return (r["text"] or "").strip()
    return ""

# ---------------------------------------------------------------- lines -> runs
def strip_marks(s): return BOLD.sub(r"\1", MARK.sub(r"\2", s)).replace("​", "").strip()

def runs_of(line, bg_colors):
    """'**a** ==green:b==' -> [{t,b,h}]"""
    out = []
    pos = 0
    line = line.replace("****", "** **")          # Keith's slides: bold runs butt against each other
    tokens = []
    for m in re.finditer(r"\*\*|==(?:[a-z]+|rgb\([0-9,]+\)):|==", line):
        tokens.append((m.start(), m.end(), m.group(0)))
    bold = False; hl = None
    i = 0
    for start, end, tok in tokens:
        if start > pos: out.append({"t": line[pos:start], "b": bold, "h": hl})
        if tok == "**": bold = not bold
        elif tok == "==": hl = None
        else: hl = tok[2:-1]
        pos = end
    if pos < len(line): out.append({"t": line[pos:], "b": bold, "h": hl})
    for r in out:
        r["t"] = r["t"].replace("​", "")
        if r["h"] in bg_colors or (r["h"] or "").startswith("rgb"): r["h"] = None
    out = [r for r in out if r["t"]]
    cleaned = []
    for i, r in enumerate(out):
        if r["t"] == " " and i + 1 < len(out) and out[i + 1]["t"][:1] in ",.;:!?": continue
        cleaned.append(r)
    return cleaned

def background_colors(lines):
    """colours that are page/box backgrounds in this file rather than phrase highlights: most of their lines are wholly covered"""
    full, part = {}, {}
    for ln in lines:
        for m in MARK.finditer(ln):
            c = m.group(1)
            whole = strip_marks(ln) == strip_marks(m.group(2)) and len(strip_marks(ln)) > 0
            (full if whole else part)[c] = (full if whole else part).get(c, 0) + 1
    bg = set()
    for c in set(full) | set(part):
        f, p = full.get(c, 0), part.get(c, 0)
        if f >= 3 and f / (f + p) > 0.6: bg.add(c)
    return bg

# ---------------------------------------------------------------- blocks
def is_heading(text, raw):
    if not text or len(text) > 70 or text.endswith(("?", ".", ",", ";", ":")): return False
    b = BOLD.fullmatch(raw.strip()) or (raw.strip().startswith("**") and raw.strip().endswith("**"))
    return bool(b) or (text.isupper() and len(text) > 2)

def is_question(text):
    text = re.sub(r"\s*[\[(]\s*why[^\])]*[\])]\s*$", "", text, flags=re.I).strip()
    if re.search(r"make some notes|speaking now|pencil back|time is up|do you understand\?$", text, re.I): return False
    return text.endswith("?") and 8 < len(text) < 260 and len(text.split()) <= 32 and "___" not in text and " = " not in text and not text.lower().startswith("answer")

NOTE_RX = re.compile(r"^\s*(?:[•●▪\-–]\s*)?(?:\d+[.)]\s*)?(?P<term>[^:–—=]{1,70}?)\s*(?::|–|—|\s-\s|\s*=\s*)\s*(?P<def>.{2,})$")
LABEL_RX = re.compile(r"^\s*(Answer\s*\d*|A|#\d+|Sample answer|Model answer|Tip|Note|Your Answer|Examiner)\s*:?\s*$", re.I)

def blocks_of(text, bg_colors=None):
    """markdown-ish lines -> blocks: {kind: h|q|p|note|break|your, runs}"""
    raw_lines = [l.rstrip() for l in text.splitlines()]
    if bg_colors is None: bg_colors = background_colors(raw_lines)
    # 1. join wrapped lines into logical lines
    logical = []
    lens = sorted(len(strip_marks(l)) for l in raw_lines if strip_marks(l) and l.strip() != "[page break]")
    slide_mode = bool(lens) and lens[len(lens) // 2] < 42
    NOTE_START = re.compile(r"^\s*(\*\*|[•●▪])?\s*[A-Za-z][^:–—=]{0,45}?(\*\*)?\s*(:|–|—|\s-\s|\s*=\s*)\s*\S")
    TAIL = re.compile(r"\b(a|an|the|and|or|of|to|in|on|at|for|with|but|so|that|is|are|was|were|my|your|his|her|their|our|I|you|he|she|we|they|it|very|really|quite|not|be|as|by|from|into|than|when|if|because)$", re.I)
    for raw in raw_lines:
        t = strip_marks(raw)
        if raw.strip() == "[page break]" or not t:
            logical.append(None); continue
        if logical and logical[-1] is not None:
            prev_raw = logical[-1]; prev = strip_marks(prev_raw)
            prev_head = is_heading(prev, prev_raw); cur_head = is_heading(t, raw)
            starts_lower = t[0].islower()
            note_next = bool(NOTE_START.match(raw)) and not starts_lower and len(t.split(":")[0].split("–")[0].split(" - ")[0].split()) <= 6
            if slide_mode:
                continues = starts_lower or prev.endswith((",", ";")) or bool(TAIL.search(prev)) or (prev_raw.strip().startswith("**") and raw.strip().startswith("**") and not prev.endswith((".", "?", "!")) and not prev_head)
                if prev_head and cur_head and len(prev) < 20 and len(t) < 20 and not prev.endswith("?"): continues = True   # "Bottled" / "Water"
                if is_question(prev) and not starts_lower: continues = False
            else:
                continues = (not prev.endswith((".", "?", "!", ":", ")", "”", "\"")) and not (prev_head and not cur_head) and not re.match(r"^(\d+[.)]|[•●▪]|[a-dA-D][.)]\s)", t) and not is_question(prev) and not note_next) or starts_lower
                if prev_head and cur_head and len(prev) < 20 and len(t) < 20 and not prev.endswith("?"): continues = True
            if continues and not (prev.endswith("?") and not starts_lower):
                sep = "" if prev_raw.endswith("-") else " "
                logical[-1] = prev_raw + sep + raw.strip(); continue
        logical.append(raw.strip())
    # 1b. a bold vocabulary term that starts after a sentence end begins its own line
    split = []
    for raw in logical:
        if raw is None: split.append(None); continue
        parts = re.split(r"(?<=[.!?”\"])\s+(?=\*\*[^*]{2,60}\*\*\s*(?:–|—|:|-|=)\s)", raw)
        split.extend(parts)
    logical = split
    # 2. classify
    blocks = []
    for raw in logical:
        if raw is None:
            if blocks and blocks[-1]["kind"] != "break": blocks.append({"kind": "break"})
            continue
        t = strip_marks(raw)
        if not t: continue
        if re.fullmatch(r"\d{1,3}", t): continue                   # page numbers
        if re.search(r"keithspeakingacademy\.com|Copyright ©", t): continue
        if re.fullmatch(r"Your Answer:?", t, re.I): blocks.append({"kind": "your"}); continue
        if re.fullmatch(r"Lexical Resources\s+Coherence\s+Grammar", t): continue
        if is_heading(t, raw): blocks.append({"kind": "h", "runs": runs_of(raw, bg_colors), "text": t}); continue
        if is_question(t) and not re.match(r"^\d+\.\s*\S.*\s=\s", t): blocks.append({"kind": "q", "runs": runs_of(raw, bg_colors), "text": t}); continue
        m = NOTE_RX.match(t)
        if m and len(m.group("term")) <= 60 and not LABEL_RX.match(m.group("term") + ":") and (raw.lstrip().startswith(("**", "•", "●")) or re.match(r"^\s*\d+[.)]\s*\*\*", raw) or (len(m.group("term").split()) <= 6 and not m.group("term")[0].isdigit() and m.group("term")[0:1].isalpha() and not re.match(r"^(so|and|but|well|i|it|they|we|you|he|she)\b", m.group("term"), re.I))):
            blocks.append({"kind": "note", "runs": runs_of(raw, bg_colors), "text": t}); continue
        blocks.append({"kind": "p", "runs": runs_of(raw, bg_colors), "text": t})
    seen_p = set(); dedup = []
    for b in blocks:
        if b["kind"] == "p" and len(b.get("text", "")) > 60:
            key = norm(b["text"])
            if key in seen_p: continue
            seen_p.add(key)
        dedup.append(b)
    blocks = dedup
    while blocks and blocks[-1]["kind"] == "break": blocks.pop()
    return blocks

# ---------------------------------------------------------------- sections of multi-topic files
def norm(s): return re.sub(r"[^a-z0-9]+", " ", strip_marks(s).lower()).strip()

def slice_lesson(blocks, which):
    """Keith's lesson decks: the Part 2 half (ideas, model answer, analysis) or the Part 3 half"""
    out, on = [], False
    for b in blocks:
        t = b.get("text", "")
        is_p2 = b["kind"] in ("h", "p") and re.search(r"^(IELTS Speaking\s*)?Part 2\b", t, re.I) and len(t) < 40
        is_p3 = b["kind"] in ("h", "p") and re.search(r"^(IELTS Speaking\s*)?Part 3\b", t, re.I) and len(t) < 40
        if which == "Part 2":
            if is_p3 and on: break
            if is_p2: on = True; continue
        else:
            if is_p3: on = True; out.append({"kind": "h", "runs": [{"t": "Part 3", "b": True, "h": None}], "text": "Part 3"}); continue
        if on and not (b["kind"] in ("h", "p") and re.fullmatch(r"(IELTS Speaking\s*)?(Part 2\s*\+\s*3|Part 2)", t, re.I)): out.append(b)
    while out and out[-1]["kind"] == "break": out.pop()
    return out

def slice_section(blocks, ref, section):
    spec = plan.SECTIONS.get(ref)
    if spec == "lesson": return slice_lesson(blocks, section)
    if spec == "numbered":
        names = None; start_rx = lambda t: norm(t) == norm(section)
        is_boundary = lambda t: bool(re.fullmatch(r"\d{1,2}\.\s*[A-Z][A-Za-z/ &\-]{2,30}", t)) and norm(t) != norm(section)
    else:
        names = [norm(n) for n in spec]
        start_rx = lambda t: norm(t) == norm(section) or (norm(section).rstrip("s") in norm(t) and len(norm(t)) <= len(norm(section)) + 2)
        is_boundary = lambda t: norm(t) in names and norm(t) != norm(section)
    out, on = [], False
    for b in blocks:
        t = b.get("text", "")
        if not on:
            if (b["kind"] == "h" or (b["kind"] == "p" and spec == "numbered")) and start_rx(t): on = True; out.append({"kind": "h", "runs": [{"t": strip_marks(section).split(". ", 1)[-1], "b": True, "h": None}], "text": section})
            continue
        if b["kind"] in ("h", "p") and is_boundary(t) and len(t) < 40: break
        out.append(b)
    # drop a leading repeat of the heading and trailing breaks
    while len(out) > 1 and out[1]["kind"] in ("h", "p") and norm(out[1].get("text", "")) == norm(section): out.pop(1)
    while out and out[-1]["kind"] == "break": out.pop()
    return out

def sheet_groups(blocks):
    """a full test or day sheet -> [(part, title, [blocks])]: groups of questions under 'Let's talk about X' / a short heading"""
    groups, part, cur = [], 1, None
    START = re.compile(r"^(let.s talk about|now let.s talk about|let.s consider|now let.s consider|we have been talking|we.ve been talking|finally|let.s move on)", re.I)
    for b in blocks:
        t = b.get("text", "")
        pm = re.match(r"^part\s*([123])\b[\s:.-]*(.*)$", t, re.I) if b["kind"] in ("h", "p") else None
        if pm:
            part = int(pm.group(1)); cur = None
            rest = pm.group(2).strip()
            if rest and len(rest) < 60 and not rest.lower().startswith(("describe", "now i", "i'd like", "i’d like")): cur = (part, rest.rstrip(".:"), []); groups.append(cur)
            continue
        if b["kind"] in ("h", "p") and (START.match(t) or (b["kind"] == "h" and len(t) < 45 and not t.lower().startswith("describe"))):
            cur = (part, t.rstrip(".:"), []); groups.append(cur); continue
        if b["kind"] in ("p", "h") and (t.lower().startswith("describe ") or t.lower().startswith("i.d like you to describe") or "you should say" in t.lower()): cur = None; continue
        if b["kind"] == "q":
            if cur is None: cur = (part, "", []); groups.append(cur)
            cur[2].append(b)
    return [g for g in groups if g[2]]

def group_blocks(groups, rx, part):
    out = []
    for p, title, qs in groups:
        if not (p == part or (part == 3 and p == 2)): continue
        blob = title + " " + " ".join(q["text"] for q in qs)
        if re.search(rx, blob, re.I):
            if title: out.append({"kind": "h", "runs": [{"t": title, "b": True, "h": None}], "text": title})
            out.extend(qs)
    return out

def slice_talk_old(blocks, talk):
    """the 'Let's talk about X' block (questions) of a full test or day sheet"""
    out, on = [], False
    for b in blocks:
        t = b.get("text", "")
        if re.match(r"^(let.s talk about|now let.s talk about|let.s consider)", t, re.I) or re.match(r"^PART \d|^Describe |^Now I.m going to give you a topic", t, re.I):
            if on: break
            if re.search(re.escape(talk), t, re.I): on = True; out.append({"kind": "h", "runs": [{"t": t.rstrip("."), "b": True, "h": None}], "text": t}); continue
        if on and b["kind"] == "q": out.append(b)
        elif on and b["kind"] == "p" and len(t) < 160 and not re.match(r"^(All right|Thank you|Here.s some paper|Before you talk)", t): out.append({"kind": "q", "runs": b["runs"], "text": t})
    return out

def slice_talk(blocks, talk):
    rx = r"Do you work or are you a student" if talk == "what you do" else re.escape(talk)
    return group_blocks(sheet_groups(blocks), rx, 1)

def slice_p3(blocks, after):
    return group_blocks(sheet_groups(blocks), re.escape(after), 3)

def slice_p3_old(blocks, after):
    """the Part 3 questions that follow the cue card matching `after`"""
    out, seen_card, on = [], False, False
    for b in blocks:
        t = b.get("text", "")
        if not seen_card:
            if re.search(re.escape(after), t, re.I) and (t.lower().startswith("describe") or "describe" in t.lower() or len(t) < 120): seen_card = True
            continue
        if not on:
            if re.match(r"^PART 3|^Part 3|^We.ve been talking|^We have been talking|^Let.s consider|^Let.s talk about", t, re.I): on = True
            if not on: continue
        if re.match(r"^PART 2|^Part 2|^Describe ", t) and out: break
        if b["kind"] == "q": out.append(b)
        elif b["kind"] in ("p", "h") and re.match(r"^(let.s|we.ve been|we have been|finally|now|secondly|moving on)", t, re.I) and len(t) < 160: out.append({"kind": "h", "runs": [{"t": t, "b": True, "h": None}], "text": t})
        elif b["kind"] == "p" and 20 < len(t) < 200 and "?" in t: out.append({"kind": "q", "runs": b["runs"], "text": t})
    return out

# ---------------------------------------------------------------- units
def unit_blocks(item):
    ref = item if isinstance(item, str) else item["ref"]
    ch, mid = ref.split(":"); mid = int(mid)
    text = load_unit_text(ch, mid)
    blocks = blocks_of(text)
    if isinstance(item, dict):
        if "section" in item: blocks = slice_section(blocks, ref, item["section"])
        elif "talk" in item: blocks = slice_talk(blocks, item["talk"])
        elif "p3" in item: blocks = slice_p3(blocks, item["p3"])
    return ch, mid, blocks

def unit_title(ch, mid, item):
    if isinstance(item, dict):
        if "section" in item: return re.sub(r"^\d+\.\s*", "", item["section"])
        if "talk" in item: return "Questions from a full test"
        if "p3" in item: return "Part 3 questions from a full test"
    t = file_title(ch, mid) or caption(ch, mid).split("\n")[0][:80] or f"message {mid}"
    t = re.sub(r"^\d+\s+", "", t)
    t = re.sub(r"^[0-9a-f]{8}-[0-9a-f-]{20,}$", "Lesson notes", t)
    return t.strip()

def fingerprint(blocks): return hashlib.md5(" ".join(b.get("text", "") for b in blocks if b["kind"] != "break").encode("utf-8")).hexdigest()

# ---------------------------------------------------------------- HTML
def esc(s): return html.escape(s, quote=False)
def runs_html(runs):
    out = []
    for r in runs:
        s = esc(r["t"])
        if r.get("h"): s = f'<mark class="hl-{r["h"]}">{s}</mark>'
        if r.get("b"): s = f"<b>{s}</b>"
        out.append(s)
    return re.sub(r"\s+(?=(?:</?b>|</?mark[^>]*>)*[,.;:!?])", "", "".join(out))

def block_html(b):
    k = b["kind"]
    if k == "break": return ""
    if k == "your": return '<p class="your">Your answer:</p>'
    if k == "h": return f'<h4 class="uh">{runs_html(b["runs"])}</h4>'
    if k == "q": return f'<p class="q">{runs_html(b["runs"])}</p>'
    if k == "note":
        m = NOTE_RX.match(b["text"])
        return f'<p class="note">{runs_html(b["runs"])}</p>'
    return f'<p>{runs_html(b["runs"])}</p>'

def chunkify(blocks):
    """mark the chunks in every answer paragraph: the teacher's note terms, bold and red phrases, else the curated list"""
    import speaking_chunks as C
    terms = []
    for b in blocks:
        if b["kind"] == "note":
            m = NOTE_RX.match(b["text"])
            term = m.group("term") if m else b["text"].split(":")[0]
            rx = C.term_rx(term)
            if rx: terms.append(rx)
    for b in blocks:
        if b["kind"] != "p" or len(b.get("text", "")) < 40: continue
        runs = b["runs"]
        boldlen = sum(len(r["t"]) for r in runs if r.get("b")); total = sum(len(r["t"]) for r in runs) or 1
        mostly_bold = boldlen / total > 0.7
        for r in runs:
            if r.get("h") == "red": r["h"] = "chunk"
            elif r.get("b") and not mostly_bold and not r.get("h") and len(r["t"].strip()) > 2: r["h"] = "chunk"
        runs = C.mark_chunks(runs, terms)
        if not any(r.get("h") in ("chunk", "green") for r in runs) and len(b["text"].split()) >= 25:
            runs = C.mark_chunks(runs, C.FALLBACK_RX)
        b["runs"] = runs
    return blocks

def unit_html(ch, mid, blocks, item, seen):
    fp = fingerprint(blocks)
    if not blocks: return "", None
    if fp in seen: return "", fp
    seen.add(fp)
    blocks = chunkify(blocks)
    title = unit_title(ch, mid, item)
    body = "".join(block_html(b) for b in blocks)
    chip = f'<span class="chip chip-{ch}">{esc(plan.NAMES[ch])}</span>'
    return f'<section class="unit unit-{ch}"><div class="uhead">{chip}<span class="ufile">{esc(title)}</span></div>{body}</section>', fp

def questions_of(blocks):
    qs = []
    for b in blocks:
        if b["kind"] == "q":
            t = re.sub(r"^\s*(\d+[.)]|[•●▪\-–]|Q:)\s*", "", b["text"]).strip()
            if 10 < len(t) < 230 and not re.search(r"odd one out|do we not say|which one|what does .* mean|synonym|^q:|\bQ:", t, re.I): qs.append(t)
    return qs

def build_topic(part_no, idx, title, items, seen, toc_pages, qbox=True):
    tid = f"T{part_no}-{idx:02d}"
    units_html, allq, sources, kinds = [], [], [], set()
    for it in items:
        try: ch, mid, blocks = unit_blocks(it)
        except Exception as e:
            print("  !! unit failed", it, type(e).__name__, e); continue
        if not blocks: print("  (empty)", it); continue
        h, fp = unit_html(ch, mid, blocks, it, seen)
        if not h: continue
        units_html.append(h)
        if plan.NAMES[ch] not in sources: sources.append(plan.NAMES[ch])
        for q in questions_of(blocks):
            if norm(q) not in {norm(x) for x in allq}: allq.append(q)
    qlist = "".join(f"<li>{esc(q)}</li>" for q in allq)
    src = " · ".join(sources)
    return tid, f'''<article class="topic" id="{tid}">
<header class="thead"><div class="tnum">{part_no}.{idx:02d}</div><div><h2>{esc(title)}</h2><div class="tsrc">{esc(src)}</div></div><span class="marker">⟦{tid}⟧</span></header>
{('<div class="qbox"><div class="qbox-k">All the questions on this topic</div><ol>' + qlist + '</ol></div>') if (allq and qbox) else ''}
{"".join(units_html)}
</article>''', allq

def build():
    toc_pages = json.loads(TOC_PAGES.read_text(encoding="utf-8")) if TOC_PAGES.exists() else {}
    parts = [(1, "Part 1", "Short questions about you and your life. Each topic gathers every question the three channels ask, then the sample answers as the teachers wrote them, with their own highlights.", plan.PART1, 1, "P1"),
             (1, "Part 1, continued", "Every other Part 1 topic the three channels answered: the booklet topics with their exercises, Diyorbek’s remaining answer sheets and Keith’s remaining lessons.", plan.PART1B, 31, "P1B"),
             (2, "Part 2", "The long turn. Each cue card has the full sample answers, the phrases the teachers marked, and where Keith taught it, his ideas, model answer and language analysis.", plan.PART2, 1, "P2"),
             (3, "Part 3", "The discussion. Opinion questions grouped by theme, with sample answers and the question sets that appeared in full tests.", plan.PART3, 1, "P3")]
    seen = set(); body = []; toc = []; stats = {}
    for no, name, intro, topics, start, pid in parts:
        body.append(f'<section class="divider" id="{pid}"><div class="dnum">{no}</div><h1>{name}</h1><p>{esc(intro)}</p><span class="marker">⟦{pid}⟧</span></section>')
        entries = []
        for i, (title, items) in enumerate(topics, start):
            print(f"{name} {i:02d} {title}")
            tid, h, qs = build_topic(no, i, title, items, seen, toc_pages)
            body.append(h); entries.append((tid, title, len(qs)))
            stats[tid] = len(qs)
        toc.append((pid, name, entries))
    # appendix
    body.append('<section class="divider" id="PA"><div class="dnum">+</div><h1>General advice</h1><p>The teachers’ own guides to idiomatic language, fillers and tips, kept whole.</p><span class="marker">⟦PA⟧</span></section>')
    aentries = []
    for i, (title, items) in enumerate(plan.APPENDIX, 1):
        tid, h, qs = build_topic(4, i, title, items, seen, toc_pages, qbox=False); body.append(h.replace("4.%02d" % i, "A%d" % i)); aentries.append((tid, title, 0))
    toc.append(("PA", "General advice", aentries))

    def pg(tid): return toc_pages.get(tid, "")
    toc_html = []
    for no, name, entries in toc:
        toc_html.append(f'<div class="toc-part"><h3>{esc(name)}<span class="pg">{pg(no)}</span></h3><ol>')
        for tid, title, nq in entries:
            toc_html.append(f'<li><a href="#{tid}"><span class="tt">{esc(title)}</span><span class="dots"></span><span class="pg">{pg(tid)}</span></a></li>')
        toc_html.append("</ol></div>")
    css = (Path(__file__).parent / "speaking_course.css").read_text(encoding="utf-8")
    doc = f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><title>8.5 Speaking</title><style>{css}</style></head><body>
<section class="cover">
  <h1 class="brand">8.5</h1>
  <div class="cover-k">Speaking</div>
  <p class="cover-sub">Parts 1, 2 and 3 · 30 topics each<br>Every question and every sample answer from <b>USB</b>, <b>Diyorbek’s Speaking</b> and <b>Keith’s Speaking</b>, with the chunks of language to take into your own answers.</p>
  <div class="cover-weave">{"".join('<i></i>' for _ in range(18))}</div>
  <p class="cover-foot">October 2026</p>
</section>
<section class="howto">
  <h1>How to use this book</h1>
  <p>Each topic opens with <b>all the questions</b> the three channels ask about it, in one list. Then come the teachers’ materials, one block per source, kept as they were written: the questions, the sample answers and the vocabulary notes.</p>
  <ul>
    <li><b>Bold</b> text is bold in the original: the phrase the teacher wants you to notice and reuse.</li>
    <li><mark class="hl-green">Light green</mark> marks the chunks of language to take into your own answers: the phrases the teacher highlighted, put in bold or in red, or listed in the notes under the answer. <mark class="hl-orange">Orange</mark>, <mark class="hl-cyan">cyan</mark>, <mark class="hl-pink">pink</mark> and <mark class="hl-yellow">yellow</mark> highlights are the colours used in the original PDF.</li>
    <li>The coloured chip on each block names the channel: <span class="chip chip-U">USB</span> <span class="chip chip-D">Diyorbek’s Speaking</span> <span class="chip chip-K">Keith’s Speaking</span></li>
    <li>“Your answer:” marks the places where the original booklet leaves room for you to write or record your own answer. Do it.</li>
    <li>Part 2 blocks from Keith’s Speaking come as lesson notes: ideas and vocabulary, a model answer, then its language analysis (signposts, collocations, expressions).</li>
  </ul>
  <p>Work through one topic a day: read the questions, study the answers aloud, write your own versions of three questions, and record them.</p>
</section>
<section class="toc"><h1>Contents</h1>{"".join(toc_html)}</section>
{"".join(body)}
</body></html>'''
    (BUILD / "course.html").write_text(doc, encoding="utf-8")
    print("wrote", BUILD / "course.html", len(doc) // 1024, "KB; topics with questions:", sum(1 for v in stats.values() if v))

if __name__ == "__main__": build()
