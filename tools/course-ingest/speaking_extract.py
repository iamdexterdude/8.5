"""Turn the pulled speaking channels into readable, formatting-preserving text.
  course/speaking/<chat>/extract/<msg>.md    one file per message with text or a document (bold = **..**, highlight = ==color:..==)
  course/speaking/<chat>/overview.md         every message in order, with the first lines of each attached file
  course/speaking/<chat>/runs.json           the same as structured runs (for the PDF builder)
"""
import json, re, sys, glob
from pathlib import Path
import pymupdf
from common import COURSE

OUT = COURSE / "speaking"
COLORS = {(0, 1, 0): "green", (1, 0.6, 0): "orange", (0, 1, 1): "cyan", (1, 1, 0): "yellow", (1, 0, 1): "magenta", (1, 0, 0): "red", (0, 0, 1): "blue", (1, 0.75, 0.8): "pink", (0.5, 0.5, 0.5): "grey"}
def color_name(c):
    if not c: return None
    best, bd = None, 9
    for k, n in COLORS.items():
        d = sum((a - b) ** 2 for a, b in zip(k, c))
        if d < bd: best, bd = n, d
    return best if bd < 0.3 else "rgb(%d,%d,%d)" % tuple(int(x * 255) for x in c)

# ---------- Telegram message text with entities ----------
def render_message(text, ents):
    if not text: return ""
    u = text.encode("utf-16-le")
    marks = []  # (utf16 offset, open/close order, string)
    for e in ents:
        t = e["type"]; a, b = e["offset"], e["offset"] + e["length"]
        if t == "bold": o, c = "**", "**"
        elif t == "italic": o, c = "_", "_"
        elif t == "underline": o, c = "__", "__"
        elif t == "strike": o, c = "~~", "~~"
        elif t in ("code", "pre"): o, c = "`", "`"
        elif t == "spoiler": o, c = "||", "||"
        elif t == "texturl": o, c = "[", "](" + e.get("url", "") + ")"
        else: continue
        marks.append((a, 1, o)); marks.append((b, 0, c))
    marks.sort(key=lambda m: (m[0], m[1]))
    out, pos = [], 0
    for off, _, s in marks:
        out.append(u[pos * 2:off * 2].decode("utf-16-le", "replace")); out.append(s); pos = off
    out.append(u[pos * 2:].decode("utf-16-le", "replace"))
    return "".join(out)

# ---------- PDF with bold and highlights ----------
def pdf_runs(path):
    doc = pymupdf.open(path)
    pages = []
    for page in doc:
        rects = []
        for dr in page.get_drawings():
            if dr.get("fill") and dr.get("rect") and dr["rect"].width > 2 and dr["rect"].height > 2 and dr["rect"].width < page.rect.width * 0.95:
                if sum(dr["fill"]) < 1.2: continue   # a dark fill is a background, not a highlight
                rects.append((dr["rect"], color_name(dr["fill"])))
        for a in page.annots() or []:
            if a.type[0] == 8: rects.append((a.rect, color_name(tuple(a.colors.get("stroke") or (1, 1, 0)))))
        lines = []
        d = page.get_text("dict")
        for b in d["blocks"]:
            for ln in b.get("lines", []):
                runs = []
                for sp in ln["spans"]:
                    t = sp["text"]
                    if not t: continue
                    bold = bool(sp["flags"] & 16) or "bold" in sp["font"].lower() or "black" in sp["font"].lower()
                    ital = bool(sp["flags"] & 2) or "italic" in sp["font"].lower() or "oblique" in sp["font"].lower()
                    bb = pymupdf.Rect(sp["bbox"]); cx, cy = (bb.x0 + bb.x1) / 2, (bb.y0 + bb.y1) / 2
                    hl = None
                    for r, cn in rects:
                        if r.x0 - 1 <= cx <= r.x1 + 1 and r.y0 - 1 <= cy <= r.y1 + 1: hl = cn; break
                    if hl is None:  # a highlight that covers part of the span: split by words
                        parts = []
                        for w in t.split(" "):
                            parts.append(w)
                        # cheap approximation: check the word boxes via page.get_text("words") later; keep span-level here
                    col = sp["color"]
                    color = None if col in (0,) else "#%06x" % col if col not in (0x000000,) else None
                    runs.append({"t": t, "b": bold, "i": ital, "h": hl, "c": color, "size": round(sp["size"], 1)})
                if runs: lines.append({"y": round(ln["bbox"][1], 1), "x": round(ln["bbox"][0], 1), "runs": runs})
        # word-level highlights (rectangles smaller than a line) : refine using words
        words = page.get_text("words")  # x0,y0,x1,y1,word,block,line,wordno
        wh = {}
        for w in words:
            cx, cy = (w[0] + w[2]) / 2, (w[1] + w[3]) / 2
            for r, cn in rects:
                if r.x0 - 1 <= cx <= r.x1 + 1 and r.y0 - 1 <= cy <= r.y1 + 1: wh[(w[5], w[6], w[7])] = cn; break
        pages.append({"lines": lines, "wordhl": [[k[0], k[1], k[2], v] for k, v in wh.items()], "words": [[w[4], w[5], w[6], w[7]] for w in words]})
    return pages

def pdf_markdown(pages):
    """lines of text with **bold** and ==color:text== (word-level highlights where available)"""
    out = []
    for pg in pages:
        # map (block,line) -> list of (wordno, word, hl)
        bywl = {}
        for w, b, l, n in pg["words"]: bywl.setdefault((b, l), []).append([n, w, None])
        for b, l, n, c in pg["wordhl"]:
            for ww in bywl.get((b, l), []):
                if ww[0] == n: ww[2] = c
        # render each dict line: bold from spans, highlight from words (matched by text order)
        for ln in pg["lines"]:
            text = "".join(r["t"] for r in ln["runs"]).strip()
            if not text: out.append(""); continue
            # find the words line that matches this text best
            best = None
            for key, ws in bywl.items():
                s = " ".join(w[1] for w in sorted(ws))
                if s == text or (len(s) > 8 and (s in text or text in s)): best = sorted(ws); break
            parts = []
            for r in ln["runs"]:
                t = r["t"]
                if r["b"] and t.strip(): t = "**" + t.strip() + "**" + (" " if t.endswith(" ") else "")
                parts.append(t)
            s = "".join(parts).strip()
            if best:
                hls = [w for w in best if w[2]]
                if hls:
                    # group consecutive highlighted words
                    groups, cur = [], None
                    for w in best:
                        if w[2]:
                            if cur and cur[1] == w[2] and cur[2] == w[0] - 1: cur[0].append(w[1]); cur[2] = w[0]
                            else: cur = [[w[1]], w[2], w[0]]; groups.append(cur)
                        else: cur = None
                    for g in groups:
                        phrase = " ".join(g[0])
                        if phrase in s: s = s.replace(phrase, "==" + g[1] + ":" + phrase + "==", 1)
                        else:
                            bare = re.sub(r"\*\*", "", s)
                            if phrase in bare: s = bare.replace(phrase, "==" + g[1] + ":" + phrase + "==", 1)
            out.append(s)
        out.append("\n[page break]\n")
    return "\n".join(out)

def docx_text(path):
    import docx
    d = docx.Document(path); out = []
    for p in d.paragraphs:
        s = "".join(("**" + r.text + "**" if r.bold and r.text.strip() else r.text) for r in p.runs)
        out.append(s)
    return "\n".join(out)

def main():
    for chat in sorted(OUT.iterdir()):
        if not (chat / "messages.jsonl").exists(): continue
        title = (chat / "title.txt").read_text(encoding="utf-8")
        ex = chat / "extract"; ex.mkdir(exist_ok=True)
        rows = [json.loads(l) for l in (chat / "messages.jsonl").read_text(encoding="utf-8").splitlines()]
        files = {}
        for p in (chat / "files").iterdir():
            m = re.match(r"(\d+)_", p.name)
            if m: files[int(m.group(1))] = p
        over = [f"# {title}\n"]
        runs_all = {}
        for r in rows:
            text = render_message(r["text"], r["entities"])
            f = files.get(r["id"]); body = ""; first = ""
            if f:
                ext = f.suffix.lower()
                try:
                    if ext == ".pdf":
                        pages = pdf_runs(f); runs_all[r["id"]] = {"file": f.name, "pages": pages}; body = pdf_markdown(pages)
                    elif ext == ".docx": body = docx_text(f)
                    elif ext in (".txt", ".md"): body = f.read_text(encoding="utf-8", errors="replace")
                except Exception as e:
                    body = f"[could not read {f.name}: {type(e).__name__} {e}]"
                first = re.sub(r"\s+", " ", body)[:260]
            m = r["media"]
            mdesc = f"{m.get('mkind') or m.get('kind')}: {m.get('name') or ''} {('%d s' % m['duration']) if m.get('duration') else ''}".strip() if m else ""
            if text or body:
                (ex / f"{r['id']}.md").write_text(f"# msg {r['id']}  {r['date'][:10]}  {mdesc}\n\n{text}\n\n{('---- file: ' + f.name + ' ----' + chr(10) + body) if body else ''}", encoding="utf-8")
            over.append(f"## {r['id']}  {r['date'][:10]}  {('[' + mdesc + ']') if mdesc else ''}{'  (reply to ' + str(r['reply_to']) + ')' if r.get('reply_to') else ''}\n{text}\n{('> ' + first) if first else ''}\n")
        (chat / "overview.md").write_text("\n".join(over), encoding="utf-8")
        (chat / "runs.json").write_text(json.dumps(runs_all, ensure_ascii=False), encoding="utf-8")
        print(title, len(rows), "messages,", len(files), "files,", len(runs_all), "pdfs")
main()
