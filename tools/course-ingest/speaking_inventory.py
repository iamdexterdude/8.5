"""An inventory of the speaking material: for every file or post, which part it serves, its topic, its questions, whether it has answers.
Writes course/speaking/inventory.md (for reading) and inventory.json (for the builder)."""
import json, re
from pathlib import Path
from common import COURSE

ROOT = COURSE / "speaking"
Q = re.compile(r"\?\s*(\*\*)?\s*$")

def strip_md(s): return re.sub(r"==[a-z()0-9,]+:|==|\*\*|__", "", s).strip()

def questions_of(text):
    qs = []
    for line in text.splitlines():
        t = strip_md(line)
        if t.endswith("?") and 12 < len(t) < 220 and not t.lower().startswith(("answer", "a:")):
            qs.append(re.sub(r"^\s*(\d+[.)]|•|-|•)\s*", "", t))
    return qs

def guess_part(name, text):
    n = name.lower(); t = text.lower()[:600]
    if re.search(r"\bp3\b|part 3|part-3", n) or "part 3" in t[:80]: return 3
    if re.search(r"\bp2\b|part 2|describe a|describe an|cue card", n): return 2
    if re.search(r"\bp1\b|part 1", n): return 1
    if "describe a" in t[:300] or "describe an" in t[:300] or "you should say" in t: return 2
    if "full test" in n or n.startswith("day "): return 0  # mixed
    return 1

def main():
    inv = []; md = ["# Speaking inventory\n"]
    for chat in sorted(ROOT.iterdir()):
        if not (chat / "messages.jsonl").exists(): continue
        title = (chat / "title.txt").read_text(encoding="utf-8")
        md.append(f"\n## {title}\n")
        rows = {json.loads(l)["id"]: json.loads(l) for l in (chat / "messages.jsonl").read_text(encoding="utf-8").splitlines()}
        files = {}
        for p in (chat / "files").iterdir():
            m = re.match(r"(\d+)_", p.name)
            if m: files[int(m.group(1))] = p.name[len(m.group(1)) + 1:]
        for mid in sorted(rows):
            r = rows[mid]
            ex = chat / "extract" / f"{mid}.md"; oc = chat / "ocr" / f"{mid}.txt"; tr = chat / "transcripts" / f"{mid}.txt"
            body = ex.read_text(encoding="utf-8") if ex.exists() else ""
            if oc.exists(): body += "\n" + oc.read_text(encoding="utf-8")
            kind = (r["media"] or {}).get("mkind") or ((r["media"] or {}).get("kind") if r["media"] else "")
            fname = files.get(mid, "")
            text_len = len(strip_md(body))
            if text_len < 30 and not tr.exists(): continue
            qs = questions_of(body)
            part = guess_part(fname or r["text"], body)
            has_answers = text_len > 120 * max(1, len(qs)) and len(qs) > 0 or (len(qs) == 0 and text_len > 400)
            inv.append({"chat": chat.name, "channel": title, "msg": mid, "file": fname, "kind": kind, "part": part, "chars": text_len, "questions": qs, "answers": has_answers, "caption": r["text"][:120], "transcript": tr.exists()})
            md.append(f"- **{mid}** {fname or '(post)'} [{kind}] part {part}, {text_len} chars, {len(qs)} questions{' + answers' if has_answers else ''}{' + transcript' if tr.exists() else ''}" + (f" — {r['text'][:80]!r}" if r["text"].strip() else ""))
            for q in qs[:40]: md.append(f"    - {q}")
    (ROOT / "inventory.json").write_text(json.dumps(inv, ensure_ascii=False, indent=0), encoding="utf-8")
    (ROOT / "inventory.md").write_text("\n".join(md), encoding="utf-8")
    print(len(inv), "items")
main()
