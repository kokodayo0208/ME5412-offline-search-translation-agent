@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-ME5412.ps1"
if errorlevel 1 pause
