"""Prints download and transcription progress. Read-only."""
import json, glob, subprocess, time
from pathlib import Path
from common import COURSE

done = set()
for l in (COURSE / "index.jsonl").read_text(encoding="utf-8").splitlines():
    r = json.loads(l); done.add((r["chat"], r["msg"]))
tot = {"video": [0, 0, 0], "audio": [0, 0, 0], "other": [0, 0, 0]}   # total, got, bytes left
for p in glob.glob(str(COURSE / "meta" / "*.jsonl")):
    cid = Path(p).stem
    for l in open(p, encoding="utf-8"):
        r = json.loads(l); m = r["media"]
        if not m or m.get("kind") not in ("photo", "document"): continue
        k = m.get("mkind") or "photo"; k = "video" if k == "video" else "audio" if k in ("audio", "voice") else "other"
        tot[k][0] += 1
        if (cid, r["id"]) in done: tot[k][1] += 1
        else: tot[k][2] += m.get("size") or 0

def running(name):
    out = subprocess.run(["powershell", "-NoProfile", "-Command", f"(Get-CimInstance Win32_Process -Filter \"Name='python.exe'\" | Where-Object {{ $_.CommandLine -like '*{name}*' }} | Measure-Object).Count"], capture_output=True, text=True).stdout.strip()
    return out not in ("", "0")

def size_now():
    return sum(f.stat().st_size for f in (COURSE / "media").rglob("*") if f.is_file())

print("COURSE IMPORT STATUS")
print("--------------------")
for k, label in (("video", "Videos"), ("audio", "Audio"), ("other", "Documents and photos")):
    t, g, left = tot[k]
    print(f"{label:22} {g} of {t} downloaded" + (f", about {left/1e9:.1f} GB still to go" if t - g else ", all done"))
trs = [f for f in (COURSE / "transcripts").glob("*.json") if "segments" in f.read_text(encoding="utf-8")[:300] or True]
hours = 0
for f in (COURSE / "transcripts").glob("*.json"):
    try: hours += json.loads(f.read_text(encoding="utf-8")).get("dur", 0) / 3600
    except Exception: pass
print(f"{'Transcribed':22} {len(trs)} items, {hours:.1f} hours of speech")
print()
a = size_now(); time.sleep(10); b = size_now()
speed = (b - a) / 10 / 1e6
print(f"Downloader running:    {'YES' if running('download.py') else 'NO (it stopped: run download.py again)'}")
print(f"Transcriber running:   {'YES' if running('transcribe.py') else 'NO (it stopped: run transcribe.py again)'}")
print(f"Download speed now:    {speed:.2f} MB/s" + ("  (nothing is arriving)" if speed < 0.01 else ""))
left = tot["video"][2] + tot["audio"][2] + tot["other"][2]
if speed > 0.05 and left: print(f"Rough time left:       {left/1e6/speed/3600:.0f} hours at this speed")
