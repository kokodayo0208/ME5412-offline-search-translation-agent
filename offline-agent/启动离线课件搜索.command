#!/bin/bash
# Finder double-click launcher for macOS. All search/index work is local.
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR"
if ! command -v node >/dev/null 2>&1; then
  osascript -e 'display alert "ME5412 Offline Search" message "需要 Node.js 18 或更新版本。请在考试前安装一次，然后重新双击本文件。"'
  exit 1
fi
if command -v ollama >/dev/null 2>&1 && ! curl -fsS --max-time 1 http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
  ollama serve >/dev/null 2>&1 &
  sleep 3
fi
node indexer.js "$APP_DIR/.." || exit 1
node server.js &
SERVER_PID=$!
sleep 1
open "http://127.0.0.1:18765"
wait "$SERVER_PID"
