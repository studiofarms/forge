# ============================================================
#  FrameForge GPU backend — one-cell Kaggle / Colab notebook
# ============================================================
#  1. kaggle.com → New Notebook → Accelerator: GPU T4 x2 → Internet: ON
#  2. Paste this whole file into a cell and run it.
#  3. Wait for the big "FRAMEFORGE BACKEND READY" banner (~5-8 min
#     on first run while models download).
#  4. Copy the https://xxxx.trycloudflare.com URL into
#     FrameForge → Connect.
#
#  The tunnel URL changes on every new session. Sessions last
#  ~9-12h; Kaggle gives ~30 GPU hours/week on the free tier.
# ============================================================

import os
import re
import subprocess
import sys
import threading
import time
import urllib.request

WORK = "/kaggle/working" if os.path.isdir("/kaggle/working") else os.getcwd()
COMFY = os.path.join(WORK, "ComfyUI")
PORT = 8188

MODELS = [
    # (subdir, filename, url)
    (
        "checkpoints",
        "ltx-video-2b-v0.9.5.safetensors",
        "https://huggingface.co/Lightricks/LTX-Video/resolve/main/ltx-video-2b-v0.9.5.safetensors",
    ),
    (
        "text_encoders",
        "t5xxl_fp8_e4m3fn_scaled.safetensors",
        "https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/t5xxl_fp8_e4m3fn_scaled.safetensors",
    ),
]


def sh(cmd, **kw):
    print(f"$ {cmd}", flush=True)
    subprocess.run(cmd, shell=True, check=True, **kw)


def download(url, dest):
    if os.path.exists(dest) and os.path.getsize(dest) > 1_000_000:
        print(f"✓ cached {os.path.basename(dest)}", flush=True)
        return
    print(f"↓ {url}", flush=True)
    sh(f'wget -q --show-progress -O "{dest}" "{url}"')


print("═" * 60)
print(" FrameForge backend boot")
print("═" * 60)

# ── 0. Internet check (Kaggle's #1 gotcha) ───────────────────
try:
    urllib.request.urlopen("https://github.com", timeout=10)
except Exception:
    raise SystemExit(
        "\n"
        + "!" * 60
        + "\n"
        "  NO INTERNET ACCESS — this notebook can't download anything.\n"
        "\n"
        "  Fix (takes 1 minute):\n"
        "   1. Open the panel on the RIGHT side of the notebook\n"
        "      (click the sidebar arrow if it's collapsed)\n"
        "   2. Under 'Session options', switch  Internet  →  ON\n"
        "   3. If it says 'Requires phone verification':\n"
        "      kaggle.com/settings → Phone verification, then retry\n"
        "   4. Also set Accelerator: GPU T4 x2\n"
        "   5. Re-run this cell\n"
        + "!" * 60
    )

# ── 1. ComfyUI + custom nodes ────────────────────────────────
if not os.path.isdir(COMFY):
    sh(f'git clone --depth 1 https://github.com/comfyanonymous/ComfyUI "{COMFY}"')
sh(f'pip install -q -r "{COMFY}/requirements.txt"')

vhs = os.path.join(COMFY, "custom_nodes", "ComfyUI-VideoHelperSuite")
if not os.path.isdir(vhs):
    sh(
        "git clone --depth 1 "
        f'https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite "{vhs}"'
    )
sh(f'pip install -q -r "{vhs}/requirements.txt"')

# ── 2. Models (LTX-Video 2B fits comfortably on a free T4) ───
for subdir, name, url in MODELS:
    folder = os.path.join(COMFY, "models", subdir)
    os.makedirs(folder, exist_ok=True)
    download(url, os.path.join(folder, name))

# ── 3. cloudflared tunnel binary ─────────────────────────────
cfd = os.path.join(WORK, "cloudflared")
if not os.path.exists(cfd):
    download(
        "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64",
        cfd,
    )
    sh(f'chmod +x "{cfd}"')

# ── 4. Start ComfyUI ─────────────────────────────────────────
comfy_proc = subprocess.Popen(
    [
        sys.executable,
        "main.py",
        "--listen",
        "0.0.0.0",
        "--port",
        str(PORT),
        "--enable-cors-header",
        "*",
    ],
    cwd=COMFY,
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    text=True,
)


def pump_comfy():
    for line in comfy_proc.stdout:
        print(f"[comfy] {line.rstrip()}", flush=True)


threading.Thread(target=pump_comfy, daemon=True).start()

for _ in range(120):
    try:
        urllib.request.urlopen(f"http://127.0.0.1:{PORT}/system_stats", timeout=2)
        break
    except Exception:
        time.sleep(2)
else:
    raise RuntimeError("ComfyUI did not come up — check the [comfy] log lines above.")
print("✓ ComfyUI is up", flush=True)

# ── 5. Open the tunnel and print the URL ─────────────────────
tunnel_proc = subprocess.Popen(
    [cfd, "tunnel", "--url", f"http://127.0.0.1:{PORT}", "--no-autoupdate"],
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    text=True,
)

url = None
start = time.time()
for line in tunnel_proc.stdout:
    m = re.search(r"https://[a-z0-9-]+\.trycloudflare\.com", line)
    if m:
        url = m.group(0)
        break
    if time.time() - start > 120:
        break

if not url:
    raise RuntimeError("Tunnel URL never appeared — re-run the cell.")

print()
print("█" * 60)
print(" FRAMEFORGE BACKEND READY")
print()
print(f"   → {url}")
print()
print(" Paste this URL into FrameForge → Connect.")
print(" Keep this notebook running while you generate.")
print("█" * 60)
print()

# ── 6. Keep the cell alive + show a session timer ────────────
boot = time.time()
while True:
    time.sleep(600)
    hrs = (time.time() - boot) / 3600
    print(f"[session] alive {hrs:.1f}h — tunnel: {url}", flush=True)
