@echo off
setlocal
cd /d "%~dp0"
node indexer.js "%~dp0.."
if errorlevel 1 pause
