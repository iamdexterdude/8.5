"""Writes course/IMPORT-REPORT.md: what was downloaded, extracted, transcribed, skipped. Re-runnable."""
import json, glob, collections, re
from pathlib import Path
from common import COURSE, STATE

chats = {str(c["id"]): c["title"] for c in json.loads((STATE / "folder_chats.json").read_text(encoding="utf-8"))}
index = {}
for l in (COURSE / "index.jsonl").read_text(encoding="utf-8").splitlines():
    r = json.loads(l); index[(r["chat"], r["msg"])] = r

tot = collections.Counter(); got = collections.Counter(); totsz = collections.Counter(); gotsz = collections.Counter()
missing, long_videos, vids_done, vids_tr = [], [], 0, 0
tr_min = 0
for p in sorted(glob.glob(str(COURSE / "meta" / "*.jsonl"))):
    cid = Path(p).stem
    for l in open(p, encoding="utf-8"):
        r = json.loads(l); m = r["media"]
        if not m or m.get("kind") not in ("photo", "document"): continue
        k = m.get("mkind") or "photo"; k = "image" if k == "photo" else k
        tot[k] += 1; totsz[k] += m.get("size") or 0
        title = (r["text"].split("\n")[0] or m.get("name") or "").strip()[:80]
        if (cid, r["id"]) in index:
            got[k] += 1; gotsz[k] += m.get("size") or 0
        elif k in ("video", "audio", "file"):
            missing.append((k, round((m.get("duration") or 0) / 60), round((m.get("size") or 0) / 1e6), chats[cid], title))
        if k == "video" and (m.get("duration") or 0) > 2400:
            long_videos.append((round(m["duration"] / 60), chats[cid], title, (cid, r["id"]) in index))

texts = len(list((COURSE / "text").glob("*/*.txt")))
trs = [json.loads(f.read_text(encoding="utf-8")) for f in (COURSE / "transcripts").glob("*.json")]
trs_ok = [t for t in trs if "segments" in t]
tr_hours = sum(t.get("dur", 0) for t in trs_ok) / 3600
tr_audio = sum(1 for f in (COURSE / "transcripts").glob("*.json") if "segments" in json.loads(f.read_text(encoding="utf-8")))

L = ["# Course import report", "", f"Source: the 13 chats in the Telegram folder IELTS STUFF (read-only). Built {__import__('datetime').datetime.now():%d %b %Y %H:%M}.", "",
     "## Downloaded", "", "| Type | Downloaded | Total | Size on disk |", "| --- | --- | --- | --- |"]
for k in ["file", "image", "audio", "voice", "video"]:
    L.append(f"| {k} | {got[k]} | {tot[k]} | {gotsz[k]/1e9:.1f} of {totsz[k]/1e9:.1f} GB |")
L += ["", f"Text extracted from documents (PDF, DOCX, HTML, XLSX): **{texts}** files.",
      f"Transcripts (faster-whisper small, CPU): **{len(trs_ok)}** items, **{tr_hours:.1f} hours** of audio and video.", ""]
L += ["## Videos over 40 minutes (not transcribed, by rule)", "", f"{len(long_videos)} videos. They are catalogued by title and link; the app can still point to them.", ""]
for m, c, t, d in sorted(long_videos, reverse=True)[:60]:
    L.append(f"- {m} min, {c}: {t}" + ("" if d else " (not downloaded)"))
L += ["", "## Not downloaded yet", "", f"{len(missing)} media files were still waiting when this report was written (the connection is about 0.5 MB/s, so large videos come last).", ""]
by = collections.Counter(k for k, *_ in missing)
L.append(", ".join(f"{n} {k}" for k, n in by.items()) or "nothing")
(COURSE / "IMPORT-REPORT.md").write_text("\n".join(L), encoding="utf-8")
print("\n".join(L[:22]))
