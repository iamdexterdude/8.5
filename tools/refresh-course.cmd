@echo off
rem Re-run after more downloads/transcripts have arrived: text extraction, catalogue, map, pack, report, private build.
cd /d "%~dp0course-ingest"
set PYTHONIOENCODING=utf-8
.venv\Scripts\python.exe extract_text.py
.venv\Scripts\python.exe build_catalogue.py
.venv\Scripts\python.exe report.py > nul
cd /d "%~dp0.."
node tools\build.mjs --private
echo Done. Course files are in the course folder; the private build is in build-private.
