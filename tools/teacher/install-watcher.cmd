@echo off
rem Installs (or with -Remove, removes) the 8.5 homework watcher. Double-click it; it does not need administrator rights.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-watcher.ps1" %*
echo.
pause
