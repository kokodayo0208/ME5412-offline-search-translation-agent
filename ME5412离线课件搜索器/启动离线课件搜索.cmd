@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js 18 or later is required.& pause & exit /b 1)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start_ollama.ps1"
if errorlevel 1 echo Ollama could not be prepared. The course search will still start.
echo Building local course index...
node indexer.js "%~dp0.."
if errorlevel 1 (
  echo Indexing failed.
  pause
  exit /b 1
)
echo Starting local AI course assistant...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start_server.ps1"
if errorlevel 1 (
  echo The local service could not start. Check startup logs in this folder.
  pause
  exit /b 1
)
start "ME5412 Offline Search" "http://127.0.0.1:18765/"
