#!/usr/bin/env node
// Packages macOS all-in-one launchers (double-clickable .command files):
//
//   node scripts/package-mac.mjs
//     → release/FrameForge-Mac.command             (the app, self-extracting)
//     → release/FrameForge-TestBackend-Mac.command (fake GPU backend)
//
// The app file serves the embedded static build with whatever the Mac already
// has (ruby → python3 → node). The test backend needs Node and fetches a
// portable copy from nodejs.org only if the Mac has none.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'out');
const RELEASE_DIR = path.join(ROOT, 'release');

const NODE_VERSION = 'v20.18.1';

if (!fs.existsSync(path.join(OUT, 'index.html'))) {
  console.error('out/index.html not found — run "npm run build" first.');
  process.exit(1);
}

function wrap64(buf) {
  return buf.toString('base64').replace(/(.{76})/g, '$1\n');
}

function writeCommand(target, script) {
  fs.mkdirSync(RELEASE_DIR, { recursive: true });
  fs.writeFileSync(target, script, { mode: 0o755 });
  const size = fs.statSync(target).size;
  console.log(`✓ ${path.relative(ROOT, target)} (${(size / 1024).toFixed(0)} KB)`);
}

// ── 1. The app ─────────────────────────────────────────────────────────────
const zip = new JSZip();
(function addDir(dir, zipPath) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    const rel = `${zipPath}/${entry.name}`;
    if (entry.isDirectory()) addDir(abs, rel);
    else zip.file(rel, fs.readFileSync(abs));
  }
})(OUT, 'app');

const zipBuffer = await zip.generateAsync({
  type: 'nodebuffer',
  compression: 'DEFLATE',
  compressionOptions: { level: 9 },
});
const appStamp = crypto.createHash('sha256').update(zipBuffer).digest('hex').slice(0, 12);

const appScript = `#!/bin/bash
# ===========================================================
#  FrameForge - AI Brand Video Studio  (all-in-one, macOS)
#  The entire app is embedded in this file. Runs with tools
#  that ship with macOS - nothing to install.
#  Build stamp: ${appStamp}
#
#  If double-clicking is blocked, run in Terminal:
#      bash ~/Downloads/FrameForge-Mac.command
# ===========================================================
set -u
APPDIR="$HOME/Library/Application Support/FrameForge"
PORT=3999
mkdir -p "$APPDIR"

echo
echo " ============================================="
echo "  FrameForge - AI Brand Video Studio"
echo " ============================================="

if [ ! -f "$APPDIR/app-${appStamp}.ok" ]; then
  echo
  echo " First run: unpacking the app..."
  rm -rf "$APPDIR/app" "$APPDIR/payload.zip"
  awk '/^::PAYLOAD-BEGIN::$/{f=1;next}/^::PAYLOAD-END::$/{f=0}f' "$0" \\
    | openssl base64 -d > "$APPDIR/payload.zip" 2>/dev/null
  if ! unzip -oq "$APPDIR/payload.zip" -d "$APPDIR" 2>/dev/null; then
    echo " [!] Could not unpack the embedded app. Re-download this file"
    echo "     (copy-pasting the file's text corrupts it - download it whole)."
    read -r -p " Press Enter to close..." _
    exit 1
  fi
  rm -f "$APPDIR/payload.zip" "$APPDIR"/app-*.ok
  touch "$APPDIR/app-${appStamp}.ok"
fi

echo
echo " Opening http://127.0.0.1:$PORT ..."
echo " Keep this window open while you use the app. Ctrl+C or close to stop."
echo
( sleep 2; command -v open >/dev/null && open "http://127.0.0.1:$PORT" ) &

cd "$APPDIR/app"
if command -v ruby >/dev/null 2>&1 && ruby -e 'require "webrick"' >/dev/null 2>&1; then
  exec ruby -run -e httpd . -p "$PORT"
elif command -v python3 >/dev/null 2>&1; then
  exec python3 -m http.server "$PORT" --bind 127.0.0.1
elif command -v node >/dev/null 2>&1; then
  exec node -e '
    const http=require("http"),fs=require("fs"),p=require("path");
    const M={".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",".svg":"image/svg+xml",".png":"image/png",".ico":"image/x-icon",".txt":"text/plain",".woff2":"font/woff2"};
    http.createServer((q,s)=>{
      let f=p.join(process.cwd(),decodeURIComponent(q.url.split("?")[0]));
      if(!f.startsWith(process.cwd()))f=process.cwd();
      try{if(fs.statSync(f).isDirectory())f=p.join(f,"index.html")}catch{}
      if(!fs.existsSync(f))f=p.join(process.cwd(),"404.html");
      try{const b=fs.readFileSync(f);s.writeHead(200,{"Content-Type":M[p.extname(f)]||"application/octet-stream"});s.end(b)}
      catch{s.writeHead(404);s.end("not found")}
    }).listen('"$PORT"',"127.0.0.1",()=>console.log(" serving"));
  '
else
  echo " [!] Could not find ruby, python3 or node on this Mac to serve the app."
  echo "     Install Node.js from https://nodejs.org and re-run."
  read -r -p " Press Enter to close..." _
  exit 1
fi

exit 0

::PAYLOAD-BEGIN::
${wrap64(zipBuffer)}
::PAYLOAD-END::
`;

writeCommand(path.join(RELEASE_DIR, 'FrameForge-Mac.command'), appScript);

// ── 2. The test backend ────────────────────────────────────────────────────
const mockSource = fs.readFileSync(path.join(ROOT, 'scripts', 'mock-comfy-standalone.mjs'));
const mockStamp = crypto.createHash('sha256').update(mockSource).digest('hex').slice(0, 12);

const backendScript = `#!/bin/bash
# ===========================================================
#  FrameForge TEST backend (fake GPU) - all-in-one, macOS
#  Simulates the ComfyUI GPU server so you can test the full
#  generate flow with no GPU. Renders return placeholder
#  files after ~6 seconds. Build stamp: ${mockStamp}
#
#  If double-clicking is blocked, run in Terminal:
#      bash ~/Downloads/FrameForge-TestBackend-Mac.command
# ===========================================================
set -u
APPDIR="$HOME/Library/Application Support/FrameForge"
mkdir -p "$APPDIR"

echo
echo " ============================================="
echo "  FrameForge - Test GPU Backend (fake GPU)"
echo " ============================================="

if [ ! -f "$APPDIR/backend-${mockStamp}.ok" ]; then
  echo
  echo " Unpacking the test backend..."
  awk '/^::PAYLOAD-BEGIN::$/{f=1;next}/^::PAYLOAD-END::$/{f=0}f' "$0" \\
    | openssl base64 -d > "$APPDIR/mock-backend.mjs" 2>/dev/null
  if [ ! -s "$APPDIR/mock-backend.mjs" ]; then
    echo " [!] Could not unpack. Re-download this file whole (no copy-paste)."
    read -r -p " Press Enter to close..." _
    exit 1
  fi
  rm -f "$APPDIR"/backend-*.ok
  touch "$APPDIR/backend-${mockStamp}.ok"
fi

NODE="$(command -v node || true)"
if [ -z "$NODE" ] && [ -x "$APPDIR/node/bin/node" ]; then
  NODE="$APPDIR/node/bin/node"
fi
if [ -z "$NODE" ]; then
  case "$(uname -m)" in
    arm64) A=darwin-arm64 ;;
    *)     A=darwin-x64 ;;
  esac
  echo
  echo " Node.js not found - fetching a portable copy (~40 MB, one time,"
  echo " official nodejs.org download, nothing is installed)..."
  curl -L --progress-bar -o "$APPDIR/node.tgz" \\
    "https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-$A.tar.gz" || {
      echo " [!] Download failed - check your internet connection and re-run."
      read -r -p " Press Enter to close..." _
      exit 1
    }
  tar -xzf "$APPDIR/node.tgz" -C "$APPDIR"
  rm -rf "$APPDIR/node"
  mv "$APPDIR/node-${NODE_VERSION}-$A" "$APPDIR/node"
  rm -f "$APPDIR/node.tgz"
  NODE="$APPDIR/node/bin/node"
fi

exec "$NODE" "$APPDIR/mock-backend.mjs"

exit 0

::PAYLOAD-BEGIN::
${wrap64(mockSource)}
::PAYLOAD-END::
`;

writeCommand(path.join(RELEASE_DIR, 'FrameForge-TestBackend-Mac.command'), backendScript);
