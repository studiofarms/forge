# FrameForge on RunPod — paid GPU, no weekly cap

Kaggle's free tier gives ~30 slow T4 hours/week. RunPod rents you a much faster
GPU by the hour with no cap. An RTX 4090 renders a FrameForge clip in roughly
**5–10× less time** than the free T4 and costs about **$0.35–0.70/hr** — an
evening of batch-generating brand content usually costs a dollar or two.

## One-time setup (5 minutes)

1. Go to **runpod.io** and create an account.
2. **Billing → Add funds** — $10 is plenty to start (you pay only while a pod runs).
3. **Pods → Deploy a Pod**:
   - GPU: **RTX 4090** (the "Community Cloud" listings are the cheap ones)
   - Template: **RunPod Pytorch 2.x** (the default PyTorch template is fine)
   - Storage: the default ~50 GB volume is enough
   - Click **Deploy On-Demand**.

## Every session

1. In the RunPod dashboard, **Start** your pod (first time it's already running).
2. Click **Connect → Jupyter Lab**.
3. Open a new notebook, paste the whole contents of `runpod_notebook.py`
   into a cell, and run it.
4. Wait for the **FRAMEFORGE BACKEND READY** banner (~3–5 min the first boot
   while models download; ~1 min after that — models are cached on the pod's disk).
5. Copy the printed `https://….trycloudflare.com` URL into
   **FrameForge → Connect**. The status pill turns green — generate away.

## When you're done — IMPORTANT

**Stop the pod** in the RunPod dashboard. Billing runs the whole time the pod
is on, even if you're not generating. A stopped pod costs only pennies/day for
its storage, and keeps the downloaded models so the next boot is fast.

## Cost cheat-sheet

| What | Cost |
|---|---|
| RTX 4090, Community Cloud | ~$0.34–0.44/hr |
| RTX 4090, Secure Cloud | ~$0.69/hr |
| A100 80 GB (only if we later wire the big Wan 14B model) | ~$1.4–1.6/hr |
| Typical 6-sec clip on a 4090 | well under a minute of GPU time |
| An evening (3 h) of batch generation | ≈ $1–2 |

The tunnel URL changes every session — always paste the newly printed one.
