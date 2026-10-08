@echo off
setlocal
cd /d "%~dp0"
if not exist index.json call build-index.cmd
if errorlevel 1 exit /b 1
start "ME5412 Offline Search" http://127.0.0.1:8765
node server.js
