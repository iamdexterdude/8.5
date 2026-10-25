"""Transcribe the speaking channels' videos and audio with faster-whisper (small, CPU). Runs while downloads continue.
Order: Keith's videos (his Part 1 model answers are only on video), then Keith's audio, then Diyorbek's voice/audio/video, then USB voice (already on paper).
Output: course/speaking/<chat>/transcripts/<msg>.txt (+ .json with timings)"""
import json, time, os, sys
from pathlib import Path
from common import COURSE, STATE
OUT_ROOT = COURSE / "speaking"
ORDER = ["-1001961939608", "-1002008308821", "-1003128376830"]
AUDIO_EXT = {".mp4", ".mp3", ".m4a", ".ogg", ".oga", ".opus", ".wav", ".webm", ".mov"}

def pending():
    items = []
    for i, cid in enumerate(ORDER):
        d = OUT_ROOT / cid
        if not (d / "messages.jsonl").exists(): continue
        rows = {json.loads(l)["id"]: json.loads(l) for l in (d / "messages.jsonl").read_text(encoding="utf-8").splitlines()}
        out = d / "transcripts"; out.mkdir(exist_ok=True)
        for p in (d / "files").iterdir():
            if p.suffix.lower() not in AUDIO_EXT or p.name.endswith(".part"): continue
            try: mid = int(p.name.split("_", 1)[0])
            except ValueError: continue
            if (out / f"{mid}.txt").exists(): continue
            m = rows.get(mid, {}).get("media") or {}
            if m.get("size") and p.stat().st_size != m["size"]: continue   # still downloading
            kind = m.get("mkind") or "audio"
            items.append((i, 0 if kind == "video" else 1, m.get("duration") or 0, mid, p, out))
    items.sort()
    return items

def downloads_finished():
    log = STATE / "speaking-video.log"
    return log.exists() and "Keith's Speaking done" in log.read_text(errors="replace") and "USB done" in log.read_text(errors="replace")

def main():
    from faster_whisper import WhisperModel
    model = WhisperModel("small", device="cpu", compute_type="int8", cpu_threads=int(os.environ.get("WHISPER_THREADS", "8")))
    idle = 0
    while True:
        todo = pending()
        if not todo:
            if downloads_finished() or idle > 240: break
            idle += 1; time.sleep(30); continue
        idle = 0
        _, _, dur, mid, p, out = todo[0]; t0 = time.time()
        try:
            segs, info = model.transcribe(str(p), vad_filter=True, beam_size=1, condition_on_previous_text=False, language="en")
            rows = [{"s": round(s.start, 1), "e": round(s.end, 1), "t": s.text.strip()} for s in segs]
            (out / f"{mid}.json").write_text(json.dumps({"dur": info.duration, "segments": rows}, ensure_ascii=False), encoding="utf-8")
            (out / f"{mid}.txt").write_text("\n".join(r["t"] for r in rows), encoding="utf-8")
            print(f"done {out.parent.name}/{mid} {p.name[:40].encode('ascii','ignore').decode()} {info.duration:.0f}s in {time.time()-t0:.0f}s ({len(todo)-1} left)", flush=True)
        except Exception as e:
            print("FAIL", p.name, type(e).__name__, str(e)[:100], flush=True)
            (out / f"{mid}.txt").write_text("", encoding="utf-8")
    print("TRANSCRIPTION COMPLETE", flush=True)
main()
