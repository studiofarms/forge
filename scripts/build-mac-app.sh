#!/usr/bin/env bash
# Builds a real, installable macOS application (FrameForge.app) on Linux:
#   1. downloads the official Electron macOS runtime
#   2. injects the built FrameForge app + embedded test GPU backend
#   3. rebrands the bundle (name, identifier)
#   4. ad-hoc code-signs it with rcodesign (required on Apple Silicon)
#   5. zips it with symlinks + exec bits preserved
#
#   ./scripts/build-mac-app.sh arm64   → release/FrameForge-Mac-AppleSilicon.zip
#   ./scripts/build-mac-app.sh x64     → release/FrameForge-Mac-Intel.zip
#
# Prereq: npm run build (needs out/), python3, zip, curl.
set -euo pipefail
cd "$(dirname "$0")/.."

ARCH="${1:-arm64}"
ELECTRON_VERSION="33.2.0"
RCODESIGN_VERSION="0.29.0"
CACHE=".cache-mac"
STAGE="$CACHE/stage-$ARCH"
case "$ARCH" in
  arm64) OUT_ZIP="release/FrameForge-Mac-AppleSilicon.zip" ;;
  x64)   OUT_ZIP="release/FrameForge-Mac-Intel.zip" ;;
  *) echo "arch must be arm64 or x64"; exit 1 ;;
esac

[ -f out/index.html ] || { echo "Run 'npm run build' first (out/ missing)"; exit 1; }
mkdir -p "$CACHE" release

# ── 1. Electron runtime ────────────────────────────────────────────────────
EZIP="$CACHE/electron-v$ELECTRON_VERSION-darwin-$ARCH.zip"
if [ ! -f "$EZIP" ]; then
  echo "Downloading Electron $ELECTRON_VERSION (darwin-$ARCH)..."
  curl -fsSL -o "$EZIP" \
    "https://github.com/electron/electron/releases/download/v$ELECTRON_VERSION/electron-v$ELECTRON_VERSION-darwin-$ARCH.zip"
fi

# ── 2. rcodesign (signs Mach-O binaries from Linux) ────────────────────────
RCS="$CACHE/rcodesign"
if [ ! -x "$RCS" ]; then
  echo "Downloading rcodesign $RCODESIGN_VERSION..."
  curl -fsSL -o "$CACHE/rcodesign.tar.gz" \
    "https://github.com/indygreg/apple-platform-rs/releases/download/apple-codesign%2F$RCODESIGN_VERSION/apple-codesign-$RCODESIGN_VERSION-x86_64-unknown-linux-musl.tar.gz"
  tar -xzf "$CACHE/rcodesign.tar.gz" -C "$CACHE" --strip-components=1 \
    "apple-codesign-$RCODESIGN_VERSION-x86_64-unknown-linux-musl/rcodesign"
  chmod +x "$RCS"
fi

# ── 3. Assemble the bundle ─────────────────────────────────────────────────
echo "Assembling FrameForge.app ($ARCH)..."
rm -rf "$STAGE"
mkdir -p "$STAGE"
unzip -q "$EZIP" -d "$STAGE"

APP="$STAGE/FrameForge.app"
mv "$STAGE/Electron.app" "$APP"
RES="$APP/Contents/Resources"
rm -f "$RES/default_app.asar"

mkdir -p "$RES/app/electron"
cp electron/main.js "$RES/app/electron/main.js"
cp scripts/mock-comfy-standalone.mjs "$RES/app/electron/mock-backend.mjs"
cp -r out "$RES/app/out"
cat > "$RES/app/package.json" <<'EOF'
{
  "name": "frameforge",
  "productName": "FrameForge",
  "version": "1.0.0",
  "main": "electron/main.js"
}
EOF

# ── 4. Rebrand Info.plist ──────────────────────────────────────────────────
python3 - "$APP/Contents/Info.plist" <<'EOF'
import plistlib, sys
p = sys.argv[1]
with open(p, 'rb') as f:
    d = plistlib.load(f)
d['CFBundleName'] = 'FrameForge'
d['CFBundleDisplayName'] = 'FrameForge'
d['CFBundleIdentifier'] = 'com.frameforge.studio'
d['CFBundleVersion'] = '1.0.0'
d['CFBundleShortVersionString'] = '1.0.0'
with open(p, 'wb') as f:
    plistlib.dump(d, f)
print('Info.plist rebranded')
EOF

# Electron helper apps ship without CFBundleExecutable (macOS infers it from
# the bundle name, rcodesign does not) — stamp it in so they get signed too.
for helper in "$APP/Contents/Frameworks/"*.app; do
  python3 - "$helper/Contents/Info.plist" <<'EOF'
import plistlib, sys
p = sys.argv[1]
with open(p, 'rb') as f:
    d = plistlib.load(f)
if 'CFBundleExecutable' not in d:
    d['CFBundleExecutable'] = d['CFBundleName']
    with open(p, 'wb') as f:
        plistlib.dump(d, f)
    print(f"CFBundleExecutable -> {d['CFBundleName']}")
EOF
done

# ── 5. Ad-hoc sign (mandatory for Apple Silicon) ───────────────────────────
echo "Signing (ad-hoc)..."
"$RCS" sign "$APP" >/dev/null
echo "Signed."

# ── 6. Package ─────────────────────────────────────────────────────────────
cat > "$STAGE/INSTALL.txt" <<'EOF'
FRAMEFORGE - INSTALL ON YOUR MAC
================================
1. Drag FrameForge.app into your Applications folder.
2. Open it. First time only, macOS will warn about an unidentified
   developer (normal for apps outside the App Store):
     - Right-click FrameForge.app -> Open -> Open, or
     - System Settings -> Privacy & Security -> "Open Anyway"
3. FrameForge opens in its own window. A built-in test GPU is already
   running: go to Connect, paste  http://127.0.0.1:8188  and press
   Connect to try generation end-to-end (placeholder renders, ~6s).
4. For real AI video (free): run backend/kaggle_notebook.py on
   kaggle.com and paste the printed URL into Connect instead.
EOF

rm -f "$OUT_ZIP"
( cd "$STAGE" && zip -qry "$(pwd)/../../$OUT_ZIP" FrameForge.app INSTALL.txt )
echo "✓ $OUT_ZIP ($(du -h "$OUT_ZIP" | cut -f1))"
