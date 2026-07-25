// Pure response-parsing helpers for the ComfyUI HTTP + WebSocket API.
// Kept separate from the client so they can be unit-tested without a network.

import type {
  ComfyWsEvent,
  OutputFileRef,
  PromptSubmitResult,
  QueueSnapshot,
  SystemStats,
} from './types';

export function parseSystemStats(raw: unknown): SystemStats {
  const data = (raw ?? {}) as Record<string, any>;
  const system = data.system ?? {};
  const devices = Array.isArray(data.devices) ? data.devices : [];
  return {
    comfyVersion: String(system.comfyui_version ?? 'unknown'),
    os: String(system.os ?? 'unknown'),
    pythonVersion: String(system.python_version ?? 'unknown'),
    devices: devices.map((d: any) => ({
      name: String(d.name ?? 'GPU'),
      type: String(d.type ?? 'cuda'),
      vramTotal: Number(d.vram_total ?? 0),
      vramFree: Number(d.vram_free ?? 0),
    })),
  };
}

export function parseQueue(raw: unknown): QueueSnapshot {
  const data = (raw ?? {}) as Record<string, any>;
  return {
    running: Array.isArray(data.queue_running) ? data.queue_running.length : 0,
    pending: Array.isArray(data.queue_pending) ? data.queue_pending.length : 0,
  };
}

export function parsePromptSubmit(raw: unknown): PromptSubmitResult {
  const data = (raw ?? {}) as Record<string, any>;
  if (typeof data.prompt_id !== 'string' || data.prompt_id.length === 0) {
    const err = data.error?.message ?? data.error ?? 'ComfyUI rejected the prompt';
    throw new Error(typeof err === 'string' ? err : JSON.stringify(err));
  }
  return {
    promptId: data.prompt_id,
    number: Number(data.number ?? 0),
    nodeErrors: (data.node_errors ?? {}) as Record<string, unknown>,
  };
}

/**
 * Extract downloadable video/animation outputs from a /history/{prompt_id}
 * response. ComfyUI nests outputs per node under several possible keys
 * depending on the save node used (gifs for VHS_VideoCombine, videos,
 * images for animated webp).
 */
export function parseHistoryOutputs(raw: unknown, promptId: string): OutputFileRef[] {
  const data = (raw ?? {}) as Record<string, any>;
  const entry = data[promptId];
  if (!entry || typeof entry !== 'object') return [];
  const outputs = entry.outputs ?? {};
  const refs: OutputFileRef[] = [];
  for (const nodeId of Object.keys(outputs)) {
    const node = outputs[nodeId] ?? {};
    for (const key of ['gifs', 'videos', 'images']) {
      const arr = node[key];
      if (!Array.isArray(arr)) continue;
      for (const f of arr) {
        if (!f || typeof f.filename !== 'string') continue;
        refs.push({
          filename: f.filename,
          subfolder: String(f.subfolder ?? ''),
          type: String(f.type ?? 'output'),
          format: typeof f.format === 'string' ? f.format : undefined,
        });
      }
    }
  }
  return refs;
}

export function parseWsMessage(raw: string): ComfyWsEvent {
  let msg: any;
  try {
    msg = JSON.parse(raw);
  } catch {
    return { kind: 'unknown', type: 'unparseable' };
  }
  const data = msg?.data ?? {};
  switch (msg?.type) {
    case 'status': {
      const remaining = data?.status?.exec_info?.queue_remaining;
      return { kind: 'status', queueRemaining: Number(remaining ?? 0) };
    }
    case 'execution_start':
      return { kind: 'execution_start', promptId: String(data.prompt_id ?? '') };
    case 'executing':
      return {
        kind: 'executing',
        promptId: String(data.prompt_id ?? ''),
        node: data.node == null ? null : String(data.node),
      };
    case 'progress':
      return {
        kind: 'progress',
        promptId: data.prompt_id == null ? null : String(data.prompt_id),
        value: Number(data.value ?? 0),
        max: Number(data.max ?? 1),
      };
    case 'executed': {
      const outputs: OutputFileRef[] = [];
      for (const key of ['gifs', 'videos', 'images']) {
        const arr = data?.output?.[key];
        if (!Array.isArray(arr)) continue;
        for (const f of arr) {
          if (f && typeof f.filename === 'string') {
            outputs.push({
              filename: f.filename,
              subfolder: String(f.subfolder ?? ''),
              type: String(f.type ?? 'output'),
            });
          }
        }
      }
      return {
        kind: 'executed',
        promptId: String(data.prompt_id ?? ''),
        node: String(data.node ?? ''),
        outputs,
      };
    }
    case 'execution_success':
      return { kind: 'execution_success', promptId: String(data.prompt_id ?? '') };
    case 'execution_interrupted':
      return { kind: 'execution_interrupted', promptId: String(data.prompt_id ?? '') };
    case 'execution_error': {
      const message =
        data.exception_message ?? data.exception_type ?? 'Unknown execution error';
      return {
        kind: 'execution_error',
        promptId: String(data.prompt_id ?? ''),
        message: String(message),
      };
    }
    default:
      return { kind: 'unknown', type: String(msg?.type ?? 'none') };
  }
}

/** Normalize a user-pasted tunnel URL: trim, add https://, strip trailing slash. */
export function normalizeBaseUrl(input: string): string {
  let url = (input ?? '').trim();
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  url = url.replace(/\/+$/, '');
  try {
    const u = new URL(url);
    if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i.test(u.hostname)) return '';
    return `${u.protocol}//${u.host}`;
  } catch {
    return '';
  }
}

export function toWsUrl(baseUrl: string, clientId: string): string {
  const u = new URL(baseUrl);
  const proto = u.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${u.host}/ws?clientId=${encodeURIComponent(clientId)}`;
}
