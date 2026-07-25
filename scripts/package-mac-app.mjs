#!/usr/bin/env node
// Packages FrameForge as double-clickable macOS .app bundles, zipped so the
// executable permissions survive the download (raw script downloads lose the
// exec bit; zips extracted by Archive Utility keep it).
//
//   node scripts/package-mac-app.mjs  →  release/FrameForge-Mac.zip
//     ├── FrameForge.app            the app: serves the embedded build, opens browser
//     ├── FrameForge Test GPU.app   fake GPU backend on http://127.0.0.1:8188
//     ├── Stop FrameForge.app       stops both servers
//     └── READ ME FIRST.txt         one-time Gatekeeper unblock steps

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'out');
const RELEASE_DIR = path.join(ROOT, 'release');
const STAGE = path.join(RELEASE_DIR, 'mac-app');
const ZIP_TARGET = path.join(RELEASE_DIR, 'FrameForge-Mac.zip');
const NODE_VERSION = 'v20.18.1';

if (!fs.existsSync(path.join(OUT, 'index.html'))) {
  console.error('out/index.html not found — run "npm run build" first.');
  process.exit(1);
}

function plist(name, id, executable) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>${name}</string>
  <key>CFBundleDisplayName</key><string>${name}</string>
  <key>CFBundleIdentifier</key><string>${id}</string>
  <key>CFBundleVersion</key><string>1.0.0</string>
  <key>CFBundleShortVersionString</key><string>1.0.0</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>${executable}</string>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
  <key>LSUIElement</key><true/>
</dict>
</plist>
`;
}

function makeApp(appName, id, execName, execScript, resources = {}) {
  const contents = path.join(STAGE, `${appName}.app`, 'Contents');
  fs.mkdirSync(path.join(contents, 'MacOS'), { recursive: true });
  fs.mkdirSync(path.join(contents, 'Resources'), { recursive: true });
  fs.writeFileSync(path.join(contents, 'Info.plist'), plist(appName, id, execName));
  fs.writeFileSync(path.join(contents, 'MacOS', execName), execScript, { mode: 0o755 });
  for (const [rel, src] of Object.entries(resources)) {
    const dest = path.join(contents, 'Resources', rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.cpSync(src, dest, { recursive: true });
  }
}

fs.rmSync(STAGE, { recursive: true, force: true });

// ── FrameForge.app — serves the bundled static build ───────────────────────
makeApp(
  'FrameForge',
  'com.frameforge.studio',
  'FrameForge',
  `#!/bin/bash
# FrameForge — serves the app bundled in Resources/app and opens the browser.
set -u
DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP="$DIR/Resources/app"
PORT=3999
notify() { osascript -e "display notification \\"$1\\" with title \\"FrameForge\\"" >/dev/null 2>&1 || true; }
fatal() { osascript -e "display dialog \\"$1\\" with title \\"FrameForge\\" buttons {\\"OK\\"}" >/dev/null 2>&1 || echo "$1" >&2; exit 1; }

# Already running? Just open the browser.
if curl -s -o /dev/null --max-time 1 "http://127.0.0.1:$PORT"; then
  open "http://127.0.0.1:$PORT"
  exit 0
fi

cd "$APP" || fatal "App files are missing — re-download FrameForge-Mac.zip."

if command -v ruby >/dev/null 2>&1 && ruby -e 'require "webrick"' >/dev/null 2>&1; then
  nohup ruby -run -e httpd . -p "$PORT" >/dev/null 2>&1 &
elif command -v python3 >/dev/null 2>&1; then
  nohup python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
elif command -v node >/dev/null 2>&1; then
  nohup node -e '
    const http=require("http"),fs=require("fs"),p=require("path");
    const M={".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",".svg":"image/svg+xml",".png":"image/png",".ico":"image/x-icon",".txt":"text/plain",".woff2":"font/woff2"};
    http.createServer((q,s)=>{
      let f=p.join(process.cwd(),decodeURIComponent(q.url.split("?")[0]));
      if(!f.startsWith(process.cwd()))f=process.cwd();
      try{if(fs.statSync(f).isDirectory())f=p.join(f,"index.html")}catch{}
      if(!fs.existsSync(f))f=p.join(process.cwd(),"404.html");
      try{const b=fs.readFileSync(f);s.writeHead(200,{"Content-Type":M[p.extname(f)]||"application/octet-stream"});s.end(b)}
      catch{s.writeHead(404);s.end("not found")}
    }).listen(${'3999'},"127.0.0.1");
  ' ff-server-3999 >/dev/null 2>&1 &
else
  fatal "No ruby, python3 or node found on this Mac. Install Node.js from nodejs.org and run FrameForge again."
fi

for i in 1 2 3 4 5 6 7 8 9 10; do
  curl -s -o /dev/null --max-time 1 "http://127.0.0.1:$PORT" && break
  sleep 1
done
notify "FrameForge is running at http://127.0.0.1:$PORT"
open "http://127.0.0.1:$PORT"
exit 0
`,
  { app: OUT }
);

// ── FrameForge Test GPU.app — the mock backend ─────────────────────────────
makeApp(
  'FrameForge Test GPU',
  'com.frameforge.testgpu',
  'TestGPU',
  `#!/bin/bash
# FrameForge test backend — fake GPU server on http://127.0.0.1:8188.
set -u
DIR="$(cd "$(dirname "$0")/.." && pwd)"
SUP="$HOME/Library/Application Support/FrameForge"
mkdir -p "$SUP"
notify() { osascript -e "display notification \\"$1\\" with title \\"FrameForge\\"" >/dev/null 2>&1 || true; }
fatal() { osascript -e "display dialog \\"$1\\" with title \\"FrameForge\\" buttons {\\"OK\\"}" >/dev/null 2>&1 || echo "$1" >&2; exit 1; }

if curl -s -o /dev/null --max-time 1 "http://127.0.0.1:8188/system_stats"; then
  notify "Test GPU already running — paste http://127.0.0.1:8188 into Connect"
  exit 0
fi

NODE="$(command -v node || true)"
if [ -z "$NODE" ] && [ -x "$SUP/node/bin/node" ]; then NODE="$SUP/node/bin/node"; fi
if [ -z "$NODE" ]; then
  case "$(uname -m)" in
    arm64) A=darwin-arm64 ;;
    *)     A=darwin-x64 ;;
  esac
  notify "Downloading portable Node.js (~40 MB, one time)..."
  curl -sL -o "$SUP/node.tgz" "https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-$A.tar.gz" \\
    || fatal "Node.js download failed — check your internet connection and run this again."
  tar -xzf "$SUP/node.tgz" -C "$SUP" || fatal "Could not unpack Node.js — run this again."
  rm -rf "$SUP/node"
  mv "$SUP/node-${NODE_VERSION}-$A" "$SUP/node"
  rm -f "$SUP/node.tgz"
  NODE="$SUP/node/bin/node"
fi

nohup "$NODE" "$DIR/Resources/mock-backend.mjs" >/dev/null 2>&1 &
for i in 1 2 3 4 5; do
  curl -s -o /dev/null --max-time 1 "http://127.0.0.1:8188/system_stats" && break
  sleep 1
done
notify "Test GPU running — paste http://127.0.0.1:8188 into FrameForge Connect"
exit 0
`,
  { 'mock-backend.mjs': path.join(ROOT, 'scripts', 'mock-comfy-standalone.mjs') }
);

// ── Stop FrameForge.app ────────────────────────────────────────────────────
makeApp(
  'Stop FrameForge',
  'com.frameforge.stop',
  'Stop',
  `#!/bin/bash
pkill -f "run -e httpd" >/dev/null 2>&1
pkill -f "http.server 3999" >/dev/null 2>&1
pkill -f "ff-server-3999" >/dev/null 2>&1
pkill -f "mock-backend.mjs" >/dev/null 2>&1
osascript -e 'display notification "FrameForge servers stopped" with title "FrameForge"' >/dev/null 2>&1 || true
exit 0
`
);

// ── READ ME ────────────────────────────────────────────────────────────────
fs.writeFileSync(
  path.join(STAGE, 'READ ME FIRST.txt'),
  `FRAMEFORGE — HOW TO RUN ON YOUR MAC
====================================

1. Double-click  FrameForge.app
   The first time, macOS will say it cannot verify the developer.
   That is normal for any app not sold through the App Store:
     • Older macOS (Sonoma & earlier): RIGHT-CLICK the app → Open → Open.
     • macOS 15 Sequoia: try to open it once, then go to
       System Settings → Privacy & Security, scroll down, and click
       "Open Anyway" next to FrameForge. Then open the app again.
   Your browser opens FrameForge at http://127.0.0.1:3999
   (you'll see a notification when it's ready).

2. Double-click  FrameForge Test GPU.app   (same one-time unblock)
   This starts a pretend GPU so you can test video generation with
   nothing else set up. First run may download a portable Node.js
   (~40 MB) — wait for the "Test GPU running" notification.

3. In FrameForge, go to Connect, paste:  http://127.0.0.1:8188
   and press Connect. The status pill turns green.

4. Try it end to end:
     Brand Kits  → drop in a logo / product photos (or a zip)
     Content Packs → pick campaign types → Queue renders
     Queue → watch jobs finish in ~6 seconds each
     Gallery → your placeholder renders are saved locally

5. Finished? Double-click  Stop FrameForge.app

REAL VIDEOS (still 100% free): run backend/kaggle_notebook.py from the
project on kaggle.com (free GPU notebook), copy the URL it prints, and
paste that into Connect instead of the test GPU address.
`
);

// ── Zip it (zip preserves the exec bits Archive Utility will restore) ──────
fs.rmSync(ZIP_TARGET, { force: true });
execFileSync('zip', ['-qry', ZIP_TARGET, '.'], { cwd: STAGE });
const size = fs.statSync(ZIP_TARGET).size;
console.log(`✓ ${path.relative(ROOT, ZIP_TARGET)} (${(size / 1024 / 1024).toFixed(2)} MB)`);
