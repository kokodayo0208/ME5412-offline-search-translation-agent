@echo off
cd /d "%~dp0"
py -3.13 offline_exam_search.py
if errorlevel 1 pause
