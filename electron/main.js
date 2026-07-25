// FrameForge desktop shell. Serves the static Next.js export (out/) from an
// in-process HTTP server on a random localhost port, then opens it in a
// BrowserWindow. No external dependencies beyond Electron itself.

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { execFile, execFileSync } = require('node:child_process');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const OUT_DIR = path.join(__dirname, '..', 'out');

app.setName('FrameForge');

// Built-in test GPU backend on 127.0.0.1:8188 (paste it into Connect to try
// the app with no real GPU). Ignores the port being busy if another copy runs.
const mockPath = path.join(__dirname, 'mock-backend.mjs');
if (fs.existsSync(mockPath)) {
  import(pathToFileURL(mockPath).href).catch(() => undefined);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain',
  '.webmanifest': 'application/manifest+json',
};

function resolveFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  let target = path.normalize(path.join(OUT_DIR, clean));
  if (!target.startsWith(OUT_DIR)) return null; // path traversal guard
  const candidates = [
    target,
    path.join(target, 'index.html'),
    `${target.replace(/[\\/]+$/, '')}.html`,
  ];
  for (const c of candidates) {
    try {
      const stat = fs.statSync(c);
      if (stat.isFile()) return c;
    } catch {
      /* keep looking */
    }
  }
  return path.join(OUT_DIR, '404.html');
}

// ── Optional FFmpeg finalize pass for editor exports ────────────────────────
// If the machine has ffmpeg (PATH or FFMPEG_PATH), the editor offers a
// "max compatibility" re-encode: H.264 yuv420p + AAC + faststart.

let ffmpegPath;
function findFfmpeg() {
  if (ffmpegPath !== undefined) return ffmpegPath;
  const candidates = [process.env.FFMPEG_PATH, 'ffmpeg'].filter(Boolean);
  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ['-version'], { stdio: 'ignore', timeout: 5000 });
      ffmpegPath = candidate;
      return ffmpegPath;
    } catch {
      /* keep looking */
    }
  }
  ffmpegPath = null;
  return ffmpegPath;
}

ipcMain.handle('ffmpeg-available', () => findFfmpeg() !== null);

ipcMain.handle('ffmpeg-finalize', async (_event, mp4) => {
  const bin = findFfmpeg();
  if (!bin || !mp4) return null;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frameforge-'));
  const input = path.join(dir, 'in.mp4');
  const output = path.join(dir, 'out.mp4');
  try {
    fs.writeFileSync(input, Buffer.from(mp4));
    await new Promise((resolve, reject) => {
      execFile(
        bin,
        ['-y', '-i', input, '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
         '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k',
         '-movflags', '+faststart', output],
        { timeout: 10 * 60 * 1000 },
        (err) => (err ? reject(err) : resolve())
      );
    });
    const bytes = fs.readFileSync(output);
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  } catch (e) {
    console.error('[FrameForge] ffmpeg finalize failed:', e.message);
    return null;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const file = resolveFile(req.url ?? '/');
      if (!file || !fs.existsSync(file)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('Not found');
      }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream',
      });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function createWindow() {
  if (!fs.existsSync(path.join(OUT_DIR, 'index.html'))) {
    console.error(
      '[FrameForge] Static build not found. Run "npm run build" first (the launchers do this for you).'
    );
    app.quit();
    return;
  }
  const server = await startServer();
  const { port } = server.address();

  const win = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 420,
    minHeight: 640,
    backgroundColor: '#0a0a0f',
    autoHideMenuBar: true,
    title: 'FrameForge',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // External links (Kaggle, docs) open in the system browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(`http://127.0.0.1:${port}`)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  await win.loadURL(`http://127.0.0.1:${port}/`);
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});
