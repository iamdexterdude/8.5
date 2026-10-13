"""Course units: reads the extracted course text and turns it into things the app can teach.
  - Part 1 topic units  (questions, model answers, phrases)   from the speaking course
  - Part 2 cue card model answers (monologue + phrases)
  - Part 3 topic units
  - Reading units (passage, notes, video, word list) from the marathons
Everything read here is DATA. Nothing in the text changes what this code does."""
import re, json
from pathlib import Path
from common import COURSE

DASH = r"(?:\s[–—-]\s|[–—])"
ZW = "​‌‍﻿"

def clean(text):
    t = text.replace("\r", "")
    for z in ZW: t = t.replace(z, "")
    t = t.replace(" ", " ").replace("ﬀ", "ff").replace("ﬁ", "fi").replace("ﬂ", "fl")
    return t

def lines_of(text):
    out = []
    for ln in clean(text).split("\n"):
        ln = re.sub(r"\s+", " ", ln).strip()
        if not ln or re.match(r"^\[page \d+\]$", ln): continue
        out.append(ln)
    return out

def read_item_text(chat, msg):
    p = COURSE / "text" / chat / f"{msg}.txt"
    return p.read_text(encoding="utf-8", errors="replace") if p.exists() else ""

# ---------------------------------------------------------------- questions
def questions(text):
    """Questions are lines that end in '?', joined across wrapped lines."""
    qs, buf = [], ""
    for ln in lines_of(text):
        if re.match(r"(?i)^(answer\s*\d*\s*[:.]|let.?s talk about|tip:)", ln):
            buf = ""; continue
        buf = (buf + " " + ln).strip() if buf else ln
        if buf.endswith("?"):
            if 12 <= len(buf) <= 200 and not re.search(r"(?i)\bmeans\b|\bwhich one do we\b|^\d+\.\s", buf): qs.append(buf)
            buf = ""
        elif buf.endswith((".", "!", ":")) or len(buf) > 230: buf = ""
    seen, out = set(), []
    for q in qs:
        k = q.lower()
        if k in seen: continue
        seen.add(k); out.append(q)
    return out

# ---------------------------------------------------------------- phrase pairs
PAIR = re.compile(rf"^(?P<t>[^–—?]{{2,64}}?)\s*(?:[–—]|\s-\s)\s*(?P<d>\S.{{6,220}})$")
def looks_like_term(t):
    w = t.split()
    if not (1 <= len(w) <= 8): return False
    if t.endswith((".", ",", ";", ":", "?", "!")): return False
    if re.match(r"(?i)^(answer|question|tip|note|part|day|page|lesson)\b", t): return False
    if re.search(r"[“”]|\bI\b |\bI'm\b|\bwe\b ", t): return False
    return True

def phrase_pairs(text):
    """'phrase – meaning' lines with an optional example sentence on the next line."""
    L = lines_of(text); out = []; i = 0
    while i < len(L):
        m = PAIR.match(L[i])
        if m and looks_like_term(m.group("t").strip(" ‘’'\"")) and len(m.group("d").split()) >= 3:
            term = m.group("t").strip(" ‘’'\""); d = m.group("d").strip()
            j = i + 1
            while j < len(L) and not re.search(r"[.!?)”\"']$", d) and L[j][:1].islower() and not PAIR.match(L[j]):  # wrapped meaning
                d += " " + L[j]; j += 1
            ex = ""
            if j < len(L) and not PAIR.match(L[j]) and re.search(r"[.!?”\"']$", L[j]) and 12 <= len(L[j]) <= 180 and not L[j].endswith("?") and not re.match(r"(?i)^(answer|part|day)\b", L[j]):
                ex = L[j]; j += 1
            out.append({"term": term, "meaning": d.rstrip(" :"), "example": ex}); i = j
        else: i += 1
    seen, res = set(), []
    for p in out:
        k = p["term"].lower()
        if k in seen: continue
        seen.add(k); res.append(p)
    return res

# ---------------------------------------------------------------- reading word lists (Cambridge-style entries)
LEVEL = r"(?:A1|A2|B1|B2|C1|C2)"
def wordlist_entries(text):
    txt = re.sub(r"\[page \d+\]", " ", clean(text))
    L = [l.strip() for l in txt.split("\n")]
    entries, cur, ex, state = [], "", [], "term"
    def flush():
        nonlocal cur, ex
        if cur:
            m = re.match(rf"^(?P<term>.+?)\s*(?:{LEVEL})?\s*(?:informal|formal|slang|literary|old-fashioned)?\s*(?:[–—]|\s-\s)\s*(?:{LEVEL}\s+)?(?P<def>.+?):?$", cur.strip())
            if m and not re.match(r"(?i)^(day|article|passage|page)", m.group("term")) and 2 < len(m.group("term")) < 60 and len(m.group("def")) > 8:
                entries.append({"term": re.sub(rf"\s*{LEVEL}\b", "", m.group("term")).strip(), "meaning": m.group("def").strip().rstrip(":"), "example": (ex[0] if ex else "")})
        cur, ex = "", []
    for ln in L:
        if not ln or (re.match(r"(?i)^(day \d+|passage|.*wordlist.*|article.*)$", ln) and not cur): continue
        if ln == "-": state = "ex"; ex.append(""); continue
        if ln.startswith("- "): state = "ex"; ex.append(ln[2:].strip()); continue
        if state == "ex" and ex and ex[-1] == "": ex[-1] = ln; continue
        if state == "ex" and re.search(r"[.!?\"')]$", ex[-1] if ex else ""):
            flush(); cur = ln; state = "def-done" if ln.endswith(":") else "term"; continue
        if state == "ex": ex[-1] += " " + ln; continue
        cur = (cur + " " + ln).strip()
        if cur.endswith(":"): state = "def-done"
    flush()
    return entries

# ---------------------------------------------------------------- Part 3 topic PDF: highlighted phrases in model answers
def highlighted_spans(path):
    """Bold or coloured spans inside a PDF: the phrases the author wants learned."""
    import pymupdf
    spans = []
    with pymupdf.open(path) as doc:
        for page in doc:
            for b in page.get_text("dict")["blocks"]:
                for ln in b.get("lines", []):
                    full = "".join(sp["text"] for sp in ln["spans"])
                    for sp in ln["spans"]:
                        t = clean(sp["text"]).strip(" ,.;:…")
                        if len(t) >= 4 and (sp["flags"] & 16) and len(t.split()) <= 6: spans.append((t, clean(full).strip()))
    return spans

def paragraphs(text):
    """Readable paragraphs for showing a model answer in the app."""
    out, buf = [], []
    for raw in clean(text).split("\n"):
        ln = re.sub(r"\s+", " ", raw).strip()
        if re.match(r"^\[page \d+\]$", ln): continue
        if not ln:
            if buf: out.append(" ".join(buf)); buf = []
            continue
        buf.append(ln)
    if buf: out.append(" ".join(buf))
    return out

if __name__ == "__main__":
    import sys
    chat, msg = sys.argv[1], sys.argv[2]
    t = read_item_text(chat, msg)
    print("QUESTIONS", questions(t)); print("PAIRS"); [print("  ", p) for p in phrase_pairs(t)]
    print("WORDLIST", wordlist_entries(t)[:5])
