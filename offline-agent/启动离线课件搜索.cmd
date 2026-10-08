@echo off
setlocal
cd /d "%~dp0"
if not defined ME5412_NODE_EXE if exist "%~dp0runtime\node\node.exe" set "ME5412_NODE_EXE=%~dp0runtime\node\node.exe"
if not defined ME5412_NODE_EXE set "ME5412_NODE_EXE=node"
if not defined PORT set "PORT=18765"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start_ollama.ps1"
if errorlevel 1 echo Ollama could not be prepared. The course search will still start.
echo Building local course index...
"%ME5412_NODE_EXE%" indexer.js "%~dp0.."
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
start "ME5412 Offline Search" "http://127.0.0.1:%PORT%/"
