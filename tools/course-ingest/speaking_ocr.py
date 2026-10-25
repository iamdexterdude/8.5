"""OCR for the scanned PDFs and the photos in the speaking channels, with the OCR engine built into Windows (no install).
Output: course/speaking/<chat>/ocr/<msg>.txt"""
import json, subprocess, sys, tempfile
from pathlib import Path
import pymupdf
from common import COURSE, HERE

OUT_ROOT = COURSE / "speaking"
PS = HERE / "winocr.ps1"

def ocr_png(png):
    r = subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(PS), str(png)], capture_output=True, text=True, encoding="utf-8", errors="replace")
    return r.stdout

def main():
    tmp = Path(tempfile.gettempdir()) / "eight-ocr"; tmp.mkdir(exist_ok=True)
    for chat in sorted(OUT_ROOT.iterdir()):
        files = chat / "files"
        if not files.exists(): continue
        out = chat / "ocr"; out.mkdir(exist_ok=True)
        runs = json.loads((chat / "runs.json").read_text(encoding="utf-8")) if (chat / "runs.json").exists() else {}
        scanned = set()
        for k, v in runs.items():
            n = sum(len(r["t"]) for p in v["pages"] for l in p["lines"] for r in l["runs"])
            if n < 40 * len(v["pages"]): scanned.add(int(k))
        n = 0
        for p in sorted(files.iterdir()):
            try: mid = int(p.name.split("_", 1)[0])
            except ValueError: continue
            dest = out / f"{mid}.txt"
            if dest.exists(): continue
            ext = p.suffix.lower()
            texts = []
            if ext == ".pdf" and mid in scanned:
                doc = pymupdf.open(p)
                for i, page in enumerate(doc):
                    png = tmp / f"{chat.name}_{mid}_{i}.png"; page.get_pixmap(dpi=200).save(png)
                    texts.append(f"[page {i+1}]\n" + ocr_png(png))
            elif ext in (".jpg", ".jpeg", ".png", ".webp"):
                if ext == ".webp":
                    png = tmp / f"{chat.name}_{mid}.png"; pymupdf.Pixmap(str(p)).save(png); src = png
                else: src = p
                texts.append(ocr_png(src))
            else: continue
            dest.write_text("\n".join(texts), encoding="utf-8"); n += 1
            print(chat.name, mid, p.name[:40], len("".join(texts)), "chars", flush=True)
        print(chat.name, "ocr done", n)
main()
