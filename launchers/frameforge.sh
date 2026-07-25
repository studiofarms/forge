#!/usr/bin/env bash
# FrameForge launcher for macOS / Linux.
set -euo pipefail
cd "$(dirname "$0")/.."

echo
echo " ============================================="
echo "  FrameForge — AI Brand Video Studio"
echo " ============================================="
echo

if ! command -v node >/dev/null 2>&1; then
  echo " [!] Node.js is not installed. Get the LTS from https://nodejs.org"
  exit 1
fi

if [ ! -d node_modules ]; then
  echo " [1/3] Installing dependencies (first run only)…"
  npm install --no-audit --no-fund
fi

if [ ! -f out/index.html ]; then
  echo " [2/3] Building the app (first run only)…"
  npm run build
fi

echo " [3/3] Starting FrameForge at http://localhost:3999"
echo "       Keep this terminal open while you use the app."
echo

(command -v open >/dev/null && open http://localhost:3999) \
  || (command -v xdg-open >/dev/null && xdg-open http://localhost:3999) || true

exec npx --yes serve out -l 3999
