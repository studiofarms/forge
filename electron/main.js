// FrameForge desktop shell. Serves the static Next.js export (out/) from an
// in-process HTTP server on a random localhost port, then opens it in a
// BrowserWindow. No external dependencies beyond Electron itself.

const { app, BrowserWindow, shell } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
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
