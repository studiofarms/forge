#!/usr/bin/env node
// Mock ComfyUI server for local development and acceptance testing.
// Speaks just enough of the real API: system_stats, queue, prompt, history,
// view, upload/image, and the /ws progress websocket.
//
//   npm run mock-comfy    → http://127.0.0.1:8188

import http from 'node:http';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.MOCK_COMFY_PORT ?? 8188);
const RENDER_MS = Number(process.env.MOCK_RENDER_MS ?? 6000);

// 1×1 transparent GIF — stands in for a rendered video file.
const FAKE_OUTPUT = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

const history = new Map(); // promptId -> history entry
const sockets = new Set();
let counter = 0;

function broadcast(obj) {
  const msg = JSON.stringify(obj);
  for (const ws of sockets) {
    if (ws.readyState === ws.OPEN) ws.send(msg);
  }
}

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

function simulateRender(promptId) {
  const steps = 20;
  const stepMs = RENDER_MS / steps;
  broadcast({ type: 'execution_start', data: { prompt_id: promptId } });
  broadcast({ type: 'executing', data: { prompt_id: promptId, node: 'sampler' } });
  let step = 0;
  const timer = setInterval(() => {
    step += 1;
    broadcast({
      type: 'progress',
      data: { prompt_id: promptId, value: step, max: steps },
    });
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
  }, stepMs);
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
      system: { comfyui_version: 'mock-0.3', os: 'posix', python_version: '3.11 (mock)' },
      devices: [
        {
          name: 'Mock T4 GPU',
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
    console.log(`[mock-comfy] accepted prompt ${promptId}`);
    setTimeout(() => simulateRender(promptId), 400);
    return json(res, 200, { prompt_id: promptId, number: counter, node_errors: {} });
  }

  if (url.pathname.startsWith('/history/')) {
    const id = decodeURIComponent(url.pathname.slice('/history/'.length));
    const entry = history.get(id);
    return json(res, 200, entry ? { [id]: entry } : {});
  }

  if (url.pathname === '/view') {
    res.writeHead(200, {
      'Content-Type': 'image/gif',
      'Access-Control-Allow-Origin': '*',
    });
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

const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws) => {
  sockets.add(ws);
  ws.send(
    JSON.stringify({ type: 'status', data: { status: { exec_info: { queue_remaining: 0 } } } })
  );
  ws.on('close', () => sockets.delete(ws));
});

server.listen(PORT, () => {
  console.log(`[mock-comfy] ComfyUI mock listening on http://127.0.0.1:${PORT}`);
  console.log(`[mock-comfy] paste http://127.0.0.1:${PORT} into FrameForge → Connect`);
});
