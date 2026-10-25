"""OCR the answer photos again, this time keeping the teacher's coloured phrases: words whose ink is red (or another
non-black colour) are wrapped as ==red:...== so the builder can show them as chunks. Overwrites course/speaking/<chat>/ocr/<msg>.txt for photos."""
import json, subprocess, sys
from pathlib import Path
import pymupdf
from common import COURSE, HERE

OUT_ROOT = COURSE / "speaking"
PS = HERE / "winocr_json.ps1"

def ocr_words(png):
    r = subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(PS), str(png)], capture_output=True, text=True, encoding="utf-8", errors="replace")
    try: return json.loads(r.stdout.strip() or "[]")
    except json.JSONDecodeError: return []

def ink_colour(pix, box):
    """fraction of ink pixels in the box that are clearly coloured (not black/grey)"""
    x0, y0 = max(0, box["x"]), max(0, box["y"]); x1, y1 = min(pix.width, box["x"] + box["w"]), min(pix.height, box["y"] + box["h"])
    n = pix.n; s = pix.samples; stride = pix.stride
    ink = col = 0
    for y in range(y0, y1):
        row = y * stride
        for x in range(x0, x1):
            i = row + x * n; r, g, b = s[i], s[i + 1], s[i + 2]
            if r + g + b > 560: continue                       # paper
            ink += 1
            if max(r, g, b) - min(r, g, b) > 70: col += 1       # coloured ink
    return (col / ink) if ink else 0.0

def main():
    only = sys.argv[1] if len(sys.argv) > 1 else None
    for chat in sorted(OUT_ROOT.iterdir()):
        files = chat / "files"
        if not files.exists() or (only and only not in chat.name): continue
        out = chat / "ocr"; out.mkdir(exist_ok=True)
        n = 0
        for p in sorted(files.iterdir()):
            if p.suffix.lower() not in (".jpg", ".jpeg", ".png"): continue
            mid = int(p.name.split("_", 1)[0])
            pix = pymupdf.Pixmap(str(p))
            if pix.n not in (3, 4): pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
            lines = ocr_words(p)
            text_lines, coloured = [], 0
            for ln in lines:
                parts, run = [], []
                for w in ln.get("words", []):
                    red = ink_colour(pix, w) > 0.35
                    if red: run.append(w["t"]); coloured += 1
                    else:
                        if run: parts.append("==red:" + " ".join(run) + "=="); run = []
                        parts.append(w["t"])
                if run: parts.append("==red:" + " ".join(run) + "==")
                text_lines.append(" ".join(parts))
            (out / f"{mid}.txt").write_text("\n".join(text_lines), encoding="utf-8"); n += 1
            print(chat.name, mid, p.name[:30], "coloured words:", coloured, flush=True)
        print(chat.name, "photos re-done:", n)
main()
