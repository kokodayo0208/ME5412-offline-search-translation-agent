@echo off
setlocal
set "ROOT=%~dp0"
"%ROOT%runtime\node\node.exe" "%ROOT%scripts\setup-model.mjs" %*
if errorlevel 1 pause
