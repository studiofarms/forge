// The single typed ComfyUI client. All communication with the tunnel URL goes
// through this module — no fetch calls to the backend anywhere else.

import {
  normalizeBaseUrl,
  parseHistoryOutputs,
  parsePromptSubmit,
  parseQueue,
  parseSystemStats,
  parseWsMessage,
  toWsUrl,
} from './parse';
import type {
  ComfyWorkflow,
  ComfyWsEvent,
  OutputFileRef,
  PromptSubmitResult,
  QueueSnapshot,
  SystemStats,
  UploadImageResult,
} from './types';

const DEFAULT_TIMEOUT_MS = 15000;

export class ComfyError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'ComfyError';
  }
}

async function fetchJson(url: string, init?: RequestInit, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) {
      let detail = '';
      try {
        detail = await res.text();
      } catch {
        /* ignore */
      }
      throw new ComfyError(
        `ComfyUI returned ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`,
        res.status
      );
    }
    return await res.json();
  } catch (err) {
    if (err instanceof ComfyError) throw err;
    if ((err as Error)?.name === 'AbortError') {
      throw new ComfyError('Request timed out — is the tunnel still alive?');
    }
    throw new ComfyError(
      `Could not reach the backend (${(err as Error)?.message ?? 'network error'})`
    );
  } finally {
    clearTimeout(timer);
  }
}

export interface ComfySocketHandle {
  close(): void;
}

export class ComfyClient {
  readonly baseUrl: string;
  readonly clientId: string;

  constructor(baseUrl: string, clientId?: string) {
    const normalized = normalizeBaseUrl(baseUrl);
    if (!normalized) throw new ComfyError('Invalid backend URL');
    this.baseUrl = normalized;
    this.clientId =
      clientId ??
      (typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `ff-${Math.random().toString(36).slice(2)}`);
  }

  /** Cheap liveness + capability probe. */
  async systemStats(): Promise<SystemStats> {
    return parseSystemStats(await fetchJson(`${this.baseUrl}/system_stats`));
  }

  async queue(): Promise<QueueSnapshot> {
    return parseQueue(await fetchJson(`${this.baseUrl}/queue`));
  }

  async submit(workflow: ComfyWorkflow): Promise<PromptSubmitResult> {
    const body = JSON.stringify({ prompt: workflow, client_id: this.clientId });
    return parsePromptSubmit(
      await fetchJson(`${this.baseUrl}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      })
    );
  }

  async interrupt(): Promise<void> {
    await fetch(`${this.baseUrl}/interrupt`, { method: 'POST' }).catch(() => undefined);
  }

  async cancelQueued(promptId: string): Promise<void> {
    await fetch(`${this.baseUrl}/queue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ delete: [promptId] }),
    }).catch(() => undefined);
  }

  async historyOutputs(promptId: string): Promise<OutputFileRef[]> {
    const raw = await fetchJson(`${this.baseUrl}/history/${encodeURIComponent(promptId)}`);
    return parseHistoryOutputs(raw, promptId);
  }

  viewUrl(ref: OutputFileRef): string {
    const params = new URLSearchParams({
      filename: ref.filename,
      subfolder: ref.subfolder,
      type: ref.type,
    });
    return `${this.baseUrl}/view?${params.toString()}`;
  }

  /** Download a finished output as a Blob for the local gallery. */
  async downloadOutput(ref: OutputFileRef): Promise<Blob> {
    const res = await fetch(this.viewUrl(ref));
    if (!res.ok) throw new ComfyError(`Download failed (${res.status})`, res.status);
    return await res.blob();
  }

  /** Upload a reference image (e.g. brand product shot) for image-to-video. */
  async uploadImage(file: Blob, filename: string): Promise<UploadImageResult> {
    const form = new FormData();
    form.append('image', file, filename);
    form.append('overwrite', 'true');
    const raw = await fetchJson(
      `${this.baseUrl}/upload/image`,
      { method: 'POST', body: form },
      60000
    );
    const data = raw as Record<string, any>;
    return {
      name: String(data.name ?? filename),
      subfolder: String(data.subfolder ?? ''),
      type: String(data.type ?? 'input'),
    };
  }

  /**
   * Open the progress websocket. Reconnects are the caller's concern — the
   * handle simply closes cleanly. Events are pre-parsed into ComfyWsEvent.
   */
  openSocket(
    onEvent: (ev: ComfyWsEvent) => void,
    onClose?: (clean: boolean) => void
  ): ComfySocketHandle {
    const ws = new WebSocket(toWsUrl(this.baseUrl, this.clientId));
    let closedByUs = false;
    ws.onmessage = (e) => {
      if (typeof e.data === 'string') onEvent(parseWsMessage(e.data));
      // Binary frames are preview images — ignored; we rely on progress events.
    };
    ws.onclose = () => onClose?.(closedByUs);
    ws.onerror = () => {
      /* onclose fires next; nothing to do */
    };
    return {
      close() {
        closedByUs = true;
        try {
          ws.close();
        } catch {
          /* ignore */
        }
      },
    };
  }
}
