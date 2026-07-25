# FrameForge — AI Brand Video Studio

A full, free AI video generation suite that specializes in **brand-driven content**: upload a
brand asset package once, and batch-generate a whole library of on-brand video — logo stings,
product spotlights, vertical social teasers, lifestyle mood films, seasonal promos and more.

**The entire stack is free**: open-source models (LTX-Video), free GPUs (Kaggle, ~30 hrs/week),
free hosting (any static host), and this app.

```
┌─────────────────────┐         ┌──────────────────────┐         ┌─────────────────────┐
│  FrameForge UI      │  HTTPS  │  Cloudflare Tunnel   │         │  Kaggle Notebook    │
│  (web / desktop     │────────▶│  (free, auto-created │────────▶│  ComfyUI + LTX      │
│   .exe / launcher)  │  + WS   │   by the notebook)   │         │  on T4 GPU          │
└─────────────────────┘         └──────────────────────┘         └─────────────────────┘
        │
        ▼
  Brand kits + gallery stored locally in your browser (IndexedDB) — nothing uploaded anywhere.
```

## Quick start (Windows — the one file that matters)

**`release/FrameForge-AllInOne.cmd`** is the entire app in a single ~0.5 MB file.
Copy it to any Windows 10/11 PC and double-click — it self-extracts to
`%LOCALAPPDATA%\FrameForge` and serves the app at `http://127.0.0.1:3999` using
Windows' built-in PowerShell. **No Node.js, no npm, no installs, no internet needed to run**
(you only go online to reach your GPU tunnel). Rebuild it any time with `npm run package:cmd`.

**`release/FrameForge-TestBackend.cmd`** is its test companion: a fake GPU backend in one
file. Double-click it, paste `http://127.0.0.1:8188` into FrameForge → Connect, and the full
generate flow works end-to-end with placeholder renders (~6 s each) — no GPU, no setup. It
uses Node from your PATH if present, otherwise it fetches a portable node.exe once (official
nodejs.org zip, nothing installed). Rebuild with `node scripts/package-test-cmd.mjs`.

**On a Mac**, use the `.command` twins instead: `release/FrameForge-Mac.command` (the app —
serves the embedded build with the Mac's stock ruby/python3) and
`release/FrameForge-TestBackend-Mac.command` (fake GPU — fetches portable Node only if
needed). If Gatekeeper blocks the double-click, run `bash ~/Downloads/FrameForge-Mac.command`
in Terminal. Rebuild both with `npm run package:mac`.

## Dev launchers (run from inside the repo)

These live in `launchers/` and drive the full dev checkout (they need Node.js):

| Launcher | What it does |
|---|---|
| `FrameForge.cmd` | Installs deps, builds, opens the app at `http://localhost:3999` |
| `FrameForge-Desktop.cmd` | Runs FrameForge as a native desktop window (Electron) |
| `Build-Windows-EXE.cmd` | Builds `dist/FrameForge-Setup-*.exe` (installer) **and** `dist/FrameForge-Portable-*.exe` (single-file exe) |
| `Start-Mock-Backend.cmd` | Fake GPU backend on `http://127.0.0.1:8188` for testing without a GPU |

macOS / Linux: `./launchers/frameforge.sh`

Requires [Node.js LTS](https://nodejs.org) once; the launchers handle everything else.

**Launcher window closes instantly / "does nothing"?** The launchers re-open themselves in a
persistent console, so any error stays on screen. If you still see nothing, your checkout may
have mangled the batch files' CRLF line endings (cmd.exe breaks on LF-only batch files) —
re-pull; `.gitattributes` now pins them. Running from a plain `cmd` window
(`cd frameforge\launchers && FrameForge.cmd`) always shows the output.

## Quick start (developers)

```bash
cd frameforge
npm install
npm run dev          # app on http://localhost:3999
npm run mock-comfy   # optional: mock GPU backend on http://127.0.0.1:8188
npm test             # 46 unit tests (workflow builder, API parsing, job FSM, content engine)
npm run build        # static export to out/ — deploy anywhere (Vercel/Netlify/Pages)
npm run dist:win     # Windows installer + portable exe into dist/
```

## The workflow

1. **Brand Kits** — drop a `.zip` brand package (or loose files). FrameForge sorts
   `logos/`, `products/`, `lifestyle/` and font files, auto-extracts a color palette from
   your logo, and stores it all locally. Add a tagline, industry, brand voice
   (bold / elegant / warm / …) and keywords. An optional `brand.json` in the zip prefills
   everything:

   ```json
   {
     "name": "Studio Farms",
     "tagline": "Fresh from the valley",
     "industry": "organic farm",
     "voice": "warm",
     "keywords": ["organic", "sun-drenched", "hand-picked"],
     "colors": ["#2f6b3a", "#e8c447"]
   }
   ```

2. **Connect** — run `backend/kaggle_notebook.py` in a free Kaggle GPU notebook; it boots
   ComfyUI, downloads LTX-Video, opens a Cloudflare tunnel and prints a URL. Paste it into
   FrameForge → Connect. A session timer helps budget your ~30 free GPU hours/week.

3. **Content Packs** — pick campaign types and variants-per-type; the content engine expands
   your brand kit into dozens of distinct, fully-written prompts (voice + palette + keywords
   baked in). Templates that animate an actual uploaded asset (logo → logo sting,
   product shot → spotlight) automatically switch to image-to-video. One tap queues the
   whole batch.

4. **Studio** — single-shot generation with full control (aspect, duration, fps, steps, CFG,
   seed) and optional one-toggle brand infusion.

5. **Queue** — jobs render one at a time with live progress over the ComfyUI websocket;
   finished videos are pulled straight into the gallery. Offline? Jobs wait and auto-start
   when you reconnect.

6. **Gallery** — everything stored in IndexedDB, filterable by brand and favorites, with
   per-clip download, seed/settings metadata, and hover previews.

## Repository layout

```
frameforge/
├── app/                  # Next.js App Router screens (dashboard, brand, generate, studio,
│                         #   queue, gallery, connect, settings)
├── components/           # UI components per feature area
├── lib/
│   ├── comfy/            # THE ComfyUI client (client.ts), response parsing, workflow
│   │   └── workflows/    #   JSON templates parameterized via buildWorkflow() only
│   ├── brand/            # brand kit model, zip import, palette extraction, content engine
│   ├── jobs/             # pure job state machine
│   └── stores/           # Zustand stores (connection, jobs, gallery, brand, settings)
├── tests/                # Vitest unit tests
├── scripts/mock-comfy.mjs# mock ComfyUI server (HTTP + WS)
├── electron/             # desktop shell + electron-builder config
├── launchers/            # double-click .cmd / .sh launchers
└── backend/              # paste-ready Kaggle notebook (the GPU backend)
```

## Honest constraints

- Kaggle sessions last ~9–12 h; the tunnel URL changes each session — paste the new one.
- Free T4s are comfortable with LTX-Video 2B at 512–768 px, 5–10 s clips.
- The backend will often be offline: every screen degrades gracefully and the queue
  parks jobs until you reconnect.
- Generated video quality is a starting point for social/web content, not a Hollywood
  pipeline — iterate with seeds and variants.

## Design rules (for contributors)

- All backend traffic goes through `lib/comfy/client.ts` — no stray fetches.
- Workflow JSON is never string-replaced; `buildWorkflow(params)` clones and mutates typed
  node inputs, and is fully unit-tested.
- No accounts, no paid services, no server-side storage. Ever.
