"""Free local transcription with faster-whisper (small model, CPU, int8).
Order: all audio/voice first (shortest first), then videos shortest first. Videos over 40 minutes are skipped (listed in course/skipped_videos.json).
Loops while downloads are still running. Output: course/transcripts/<chat>_<msg>.json + .txt"""
import json, time, sys, os
from pathlib import Path
from common import COURSE, STATE
MAX_VIDEO_S = 40 * 60
OUT = COURSE / "transcripts"; OUT.mkdir(exist_ok=True)

def pending():
    items, seen = [], set()
    idx = COURSE / "index.jsonl"
    if not idx.exists(): return items
    for l in idx.read_text(encoding="utf-8").splitlines():
        r = json.loads(l)
        if r.get("dup") or r["path"] in seen: continue
        seen.add(r["path"])
        if r["mkind"] not in ("audio", "voice", "video"): continue
        if (OUT / f"{r['chat']}_{r['msg']}.json").exists(): continue
        if r["mkind"] == "video" and (r.get("duration") or 0) > MAX_VIDEO_S: continue
        items.append(r)
    items.sort(key=lambda r: (0 if r["mkind"] in ("audio", "voice") else 1, r.get("duration") or 0))
    return items

def downloads_finished():
    log = (STATE / "download.log")
    return log.exists() and "DOWNLOAD COMPLETE" in log.read_text(errors="replace")

def main():
    from faster_whisper import WhisperModel
    model = WhisperModel("small", device="cpu", compute_type="int8", cpu_threads=int(os.environ.get("WHISPER_THREADS", "6")))
    while True:
        todo = pending()
        if not todo:
            if downloads_finished(): break
            time.sleep(60); continue
        r = todo[0]; t0 = time.time()
        try:
            segs, info = model.transcribe(str(COURSE / r["path"]), vad_filter=True, beam_size=1, condition_on_previous_text=False)
            out = [{"s": round(s.start, 1), "e": round(s.end, 1), "t": s.text.strip()} for s in segs]
            (OUT / f"{r['chat']}_{r['msg']}.json").write_text(json.dumps({"lang": info.language, "dur": info.duration, "segments": out}, ensure_ascii=False), encoding="utf-8")
            (OUT / f"{r['chat']}_{r['msg']}.txt").write_text("\n".join(x["t"] for x in out), encoding="utf-8")
            print(f"done {r['chat']}_{r['msg']} {r['mkind']} {info.duration:.0f}s in {time.time()-t0:.0f}s  ({len(todo)-1} left)", flush=True)
        except Exception as e:
            print("FAIL", r["path"], type(e).__name__, str(e)[:100], flush=True)
            (OUT / f"{r['chat']}_{r['msg']}.json").write_text(json.dumps({"error": str(e)[:200]}))
    # list skipped long videos
    skipped = []
    for l in (COURSE / "index.jsonl").read_text(encoding="utf-8").splitlines():
        r = json.loads(l)
        if r["mkind"] == "video" and (r.get("duration") or 0) > MAX_VIDEO_S and not r.get("dup"):
            skipped.append({"chat": r["chat"], "msg": r["msg"], "name": r.get("name"), "minutes": round(r["duration"] / 60)})
    (COURSE / "skipped_videos.json").write_text(json.dumps(skipped, indent=1))
    print("TRANSCRIBE COMPLETE", flush=True)
if __name__ == "__main__": main()
