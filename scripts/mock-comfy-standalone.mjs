#!/usr/bin/env node
// Standalone mock ComfyUI server — ZERO npm dependencies (hand-rolled
// WebSocket server), so it runs on a bare portable node.exe. Same API surface
// as scripts/mock-comfy.mjs: system_stats, queue, prompt, history, view,
// upload/image, interrupt, and the /ws progress websocket.
//
//   node mock-comfy-standalone.mjs   → http://127.0.0.1:8188

import http from 'node:http';
import crypto from 'node:crypto';

const PORT = Number(process.env.MOCK_COMFY_PORT ?? 8188);
const RENDER_MS = Number(process.env.MOCK_RENDER_MS ?? 6000);

// 1×1 GIF — stands in for a rendered video file.
const FAKE_OUTPUT = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

const history = new Map();
const sockets = new Set(); // raw net sockets with ws framing
let counter = 0;

// ── Minimal RFC6455 WebSocket server (text frames only) ─────────────────────
const WS_MAGIC = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function wsFrame(text) {
  const payload = Buffer.from(text, 'utf8');
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x81, len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

function handleUpgrade(req, socket) {
  const key = req.headers['sec-websocket-key'];
  if (!key) return socket.destroy();
  const accept = crypto
    .createHash('sha1')
    .update(key + WS_MAGIC)
    .digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );
  socket.setNoDelay(true);
  sockets.add(socket);

  // Parse just enough of incoming frames to answer pings and closes.
  socket.on('data', (buf) => {
    if (buf.length < 2) return;
    const opcode = buf[0] & 0x0f;
    if (opcode === 0x8) {
      // close → echo close, drop
      try {
        socket.write(Buffer.from([0x88, 0x00]));
      } catch {}
      socket.end();
      sockets.delete(socket);
    } else if (opcode === 0x9) {
      // ping → pong (empty)
      try {
        socket.write(Buffer.from([0x8a, 0x00]));
      } catch {}
    }
    // text frames from the client are ignored — the app never sends any
  });
  const drop = () => sockets.delete(socket);
  socket.on('close', drop);
  socket.on('error', drop);

  send(socket, { type: 'status', data: { status: { exec_info: { queue_remaining: 0 } } } });
}

function send(socket, obj) {
  try {
    socket.write(wsFrame(JSON.stringify(obj)));
  } catch {
    sockets.delete(socket);
  }
}

function broadcast(obj) {
  for (const s of sockets) send(s, obj);
}

// ── Render simulation ───────────────────────────────────────────────────────
function simulateRender(promptId) {
  const steps = 20;
  broadcast({ type: 'execution_start', data: { prompt_id: promptId } });
  broadcast({ type: 'executing', data: { prompt_id: promptId, node: 'sampler' } });
  let step = 0;
  const timer = setInterval(() => {
    step += 1;
    broadcast({ type: 'progress', data: { prompt_id: promptId, value: step, max: steps } });
    if (step >= steps) {
      clearInterval(timer);
      const filename = `frameforge_${promptId.slice(0, 8)}.gif`;
      history.set(promptId, {
        outputs: {
          save: { gifs: [{ filename, subfolder: '', type: 'output', format: 'image/gif' }] },
        },
        status: { completed: true },
      });
      broadcast({
        type: 'executed',
        data: {
          prompt_id: promptId,
          node: 'save',
          output: { gifs: [{ filename, subfolder: '', type: 'output' }] },
        },
      });
      broadcast({ type: 'execution_success', data: { prompt_id: promptId } });
      broadcast({ type: 'status', data: { status: { exec_info: { queue_remaining: 0 } } } });
    }
  }, RENDER_MS / steps);
}

// ── HTTP API ────────────────────────────────────────────────────────────────
function json(res, code, body) {
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  if (url.pathname === '/system_stats') {
    return json(res, 200, {
      system: { comfyui_version: 'mock-0.3', os: 'windows (mock)', python_version: 'n/a (mock)' },
      devices: [
        {
          name: 'Mock T4 GPU (test backend)',
          type: 'cuda',
          vram_total: 16 * 1024 ** 3,
          vram_free: 14.2 * 1024 ** 3,
        },
      ],
    });
  }

  if (url.pathname === '/queue') {
    if (req.method === 'POST') {
      await readBody(req);
      return json(res, 200, {});
    }
    return json(res, 200, { queue_running: [], queue_pending: [] });
  }

  if (url.pathname === '/prompt' && req.method === 'POST') {
    const body = JSON.parse((await readBody(req)).toString() || '{}');
    if (!body.prompt || typeof body.prompt !== 'object') {
      return json(res, 400, { error: { message: 'invalid prompt' } });
    }
    counter += 1;
    const promptId = `mock-${String(counter).padStart(4, '0')}-${Date.now().toString(36)}`;
    console.log(`[test-backend] accepted prompt ${promptId}`);
    setTimeout(() => simulateRender(promptId), 400);
    return json(res, 200, { prompt_id: promptId, number: counter, node_errors: {} });
  }

  if (url.pathname.startsWith('/history/')) {
    const id = decodeURIComponent(url.pathname.slice('/history/'.length));
    const entry = history.get(id);
    return json(res, 200, entry ? { [id]: entry } : {});
  }

  if (url.pathname === '/view') {
    res.writeHead(200, { 'Content-Type': 'image/gif', 'Access-Control-Allow-Origin': '*' });
    return res.end(FAKE_OUTPUT);
  }

  if (url.pathname === '/upload/image' && req.method === 'POST') {
    await readBody(req);
    return json(res, 200, { name: `upload-${Date.now()}.png`, subfolder: '', type: 'input' });
  }

  if (url.pathname === '/interrupt' && req.method === 'POST') {
    return json(res, 200, {});
  }

  json(res, 404, { error: 'not found' });
});

server.on('upgrade', (req, socket) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname === '/ws') handleUpgrade(req, socket);
  else socket.destroy();
});

server.on('error', (err) => {
  // Port already taken (another copy running) — not fatal for an embedded use.
  console.log(`[test-backend] not started: ${err.code ?? err.message}`);
});

server.listen(PORT, () => {
  console.log('');
  console.log(' ============================================');
  console.log('  FrameForge TEST backend (fake GPU) running');
  console.log('');
  console.log(`     http://127.0.0.1:${PORT}`);
  console.log('');
  console.log('  Paste that URL into FrameForge -> Connect.');
  console.log('  Renders return placeholder files in ~6s.');
  console.log('  Keep this window open. Close it to stop.');
  console.log(' ============================================');
  console.log('');
});
