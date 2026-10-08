@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul || (echo 未检测到 Node.js 18+，请先安装 Node.js。&pause&exit /b 1)
where python >nul 2>nul || (echo 未检测到 Python。请安装 Python 3 和 PyMuPDF，或设置 ME5412_PYTHON。&pause&exit /b 1)
if not exist index.json (echo 首次运行，正在建立本地索引...&node indexer.js "%~dp0.."&if errorlevel 1 (pause&exit /b 1))
start "ME5412 Offline Search" http://127.0.0.1:8765
node server.js
