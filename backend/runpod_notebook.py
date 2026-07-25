# ============================================================
#  FrameForge GPU backend — one-cell RunPod notebook
# ============================================================
#  Same idea as kaggle_notebook.py, but for a PAID RunPod pod:
#  faster GPUs, no weekly hour cap, ~$0.35-0.70/hr for an
#  RTX 4090 that renders clips 5-10x faster than Kaggle's T4.
#
#  SETUP (once):
#   1. runpod.io → Sign up → Billing → add $10 to start.
#   2. Pods → Deploy → pick "RTX 4090" (Community Cloud is the
#      cheap tier) → template "RunPod Pytorch 2.x" → Deploy.
#   3. When the pod is running: Connect → "Jupyter Lab" →
#      New notebook → paste this whole file into a cell → Run.
#   4. Wait for the "FRAMEFORGE BACKEND READY" banner
#      (~3-5 min on first boot while models download).
#   5. Copy the https://xxxx.trycloudflare.com URL into
#      FrameForge → Connect.
#
#  WHEN YOU'RE DONE: STOP the pod in the RunPod dashboard —
#  billing runs while the pod is on, even if idle. A stopped
#  pod keeps /workspace, so the next boot skips the downloads.
# ============================================================

import os
import re
import subprocess
import sys
import threading
import time
import urllib.request

# RunPod pods persist /workspace across stop/start; models cached there.
WORK = "/workspace" if os.path.isdir("/workspace") else os.getcwd()
COMFY = os.path.join(WORK, "ComfyUI")
PORT = 8188

# Set True to also download the larger LTX-Video 13B distilled model
# (better quality, ~2x slower, needs a 24 GB GPU — fine on a 4090).
# It shows up as an extra checkpoint inside ComfyUI; FrameForge's stock
# workflows keep using the 2B model until we wire up a model picker.
DOWNLOAD_13B = False

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
if DOWNLOAD_13B:
    MODELS.append(
        (
            "checkpoints",
            "ltxv-13b-0.9.7-distilled.safetensors",
            "https://huggingface.co/Lightricks/LTX-Video/resolve/main/ltxv-13b-0.9.7-distilled.safetensors",
        )
    )


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
print(" FrameForge backend boot (RunPod)")
print("═" * 60)

# ── 0. Show which GPU we got ─────────────────────────────────
try:
    sh("nvidia-smi --query-gpu=name,memory.total --format=csv,noheader")
except Exception:
    print("[!] nvidia-smi failed — is this a GPU pod?")

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

# ── 2. Models ────────────────────────────────────────────────
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
print(" FRAMEFORGE BACKEND READY  (RunPod)")
print()
print(f"   → {url}")
print()
print(" Paste this URL into FrameForge → Connect.")
print(" Remember: STOP the pod in the RunPod dashboard when done —")
print(" you are billed by the hour while it runs.")
print("█" * 60)
print()

# ── 6. Keep the cell alive + show a cost-aware session timer ─
boot = time.time()
while True:
    time.sleep(600)
    hrs = (time.time() - boot) / 3600
    print(
        f"[session] alive {hrs:.1f}h (≈${hrs * 0.44:.2f} at $0.44/hr) — tunnel: {url}",
        flush=True,
    )
