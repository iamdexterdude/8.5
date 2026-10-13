@echo off
rem Shows how far the course download and transcription have got. Safe to run any time.
cd /d "%~dp0course-ingest"
set PYTHONIOENCODING=utf-8
.venv\Scripts\python.exe status.py
echo.
pause
