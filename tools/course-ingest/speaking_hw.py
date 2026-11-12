"""Pulls Part 1 topics out of the built speaking book (course/speaking/build/course.html) for an 8.5 speaking homework.
Each question keeps its model answers, and every phrase the book highlights is kept as ==phrase==.
usage: python speaking_hw.py out.json T1-02:from=Questions%20from%20a%20full%20test T1-03 T1-04 T1-05
"""
import html, json, re, sys
from pathlib import Path

BOOK = Path(__file__).resolve().parents[2] / "course" / "speaking" / "build" / "course.html"
SRC = BOOK.read_text(encoding="utf-8")


def clean(fragment, keep_marks):
    t = fragment
    if keep_marks:
        t = re.sub(r"<mark[^>]*>(.*?)</mark>", lambda m: "==" + re.sub(r"<[^>]+>", "", m.group(1)).strip() + "==", t, flags=re.S)
        t = t.replace("== ==", " ").replace("====", "")
    t = re.sub(r"<[^>]+>", "", t)
    t = html.unescape(t)
    t = re.sub(r"\s+", " ", t).strip()
    return t


def norm(q):
    q = re.sub(r"^\d+\s*[.)]\s*", "", q)
    q = q.replace("Let's talk about what you do. ", "")
    return re.sub(r"[^a-z ]", "", q.lower()).strip()


def topic(tid, start_after=None):
    a = SRC.index(f'id="{tid}"')
    b = SRC.find('<article class="topic"', a + 10)
    art = SRC[a:b if b > 0 else None]
    name = clean(re.search(r"<h2>(.*?)</h2>", art).group(1), False)
    num = clean(re.search(r'<div class="tnum">(.*?)</div>', art).group(1), False)
    box = re.search(r'<div class="qbox">.*?<ol>(.*?)</ol>', art, re.S)
    listed = [clean(x, False) for x in re.findall(r"<li>(.*?)</li>", box.group(1), re.S)] if box else []
    if start_after:
        art = art[art.index(start_after) - 200:]
        listed = []
    order, answers, shown = [], {}, {}
    for unit in re.findall(r'<section class="unit[^"]*">(.*?)</section>', art, re.S):
        cur = None
        for cls, body in re.findall(r'<p( class="q")?>(.*?)</p>', unit, re.S):
            if cls:
                text = re.sub(r"^\d+\s*[.)]\s*", "", clean(body, False)).replace("Let's talk about what you do. ", "")
                k = norm(text)
                if not k:
                    continue
                if k not in answers:
                    order.append(k); answers[k] = []; shown[k] = text
                cur = k
            elif cur:
                t = clean(body, True)
                t = re.sub(r"^\d+\s*[.)]\s*", "", t)
                if len(re.sub(r"[^A-Za-z]", "", t)) < 12:
                    continue
                if t not in answers[cur]:
                    answers[cur].append(t)
    keys = order
    if listed:  # the topic's own list decides which questions count, in its order
        lk = []
        for q in listed:
            k = norm(q)
            if k and k not in lk:
                lk.append(k)
                if k not in answers:
                    answers[k] = []; shown[k] = re.sub(r"^\d+\s*[.)]\s*", "", q)
        keys = lk + [k for k in order if k not in lk and answers[k]]
    qs = [{"q": shown[k], "answers": answers[k][:3]} for k in keys]
    return {"id": tid, "num": num, "name": name, "questions": qs}


if __name__ == "__main__":
    out, specs = sys.argv[1], sys.argv[2:]
    topics = []
    for s in specs:
        tid, _, rest = s.partition(":")
        start = rest.split("=", 1)[1].replace("%20", " ") if rest.startswith("from=") else None
        topics.append(topic(tid, start))
    Path(out).write_text(json.dumps(topics, ensure_ascii=False, indent=1), encoding="utf-8")
    for t in topics:
        print(t["num"], t["name"], len(t["questions"]), "questions,", sum(1 for q in t["questions"] if q["answers"]), "with answers")
        for q in t["questions"]:
            print("   ", len(q["answers"]), q["q"][:80])
