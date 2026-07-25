import { describe, expect, it } from 'vitest';
import {
  normalizeBaseUrl,
  parseHistoryOutputs,
  parsePromptSubmit,
  parseQueue,
  parseSystemStats,
  parseWsMessage,
  toWsUrl,
} from '@/lib/comfy/parse';

describe('normalizeBaseUrl', () => {
  it('adds https and strips trailing slashes/paths', () => {
    expect(normalizeBaseUrl('foo.trycloudflare.com')).toBe('https://foo.trycloudflare.com');
    expect(normalizeBaseUrl('https://foo.trycloudflare.com/')).toBe(
      'https://foo.trycloudflare.com'
    );
    expect(normalizeBaseUrl('  http://localhost:8188/  ')).toBe('http://localhost:8188');
    expect(normalizeBaseUrl('')).toBe('');
    expect(normalizeBaseUrl('ht!tp://???')).toBe('');
  });
});

describe('toWsUrl', () => {
  it('maps http(s) to ws(s) and appends clientId', () => {
    expect(toWsUrl('https://x.com', 'abc')).toBe('wss://x.com/ws?clientId=abc');
    expect(toWsUrl('http://localhost:8188', 'a b')).toBe(
      'ws://localhost:8188/ws?clientId=a%20b'
    );
  });
});

describe('parseSystemStats', () => {
  it('parses a real-shaped payload', () => {
    const stats = parseSystemStats({
      system: { comfyui_version: '0.3.10', os: 'posix', python_version: '3.11.9' },
      devices: [{ name: 'Tesla T4', type: 'cuda', vram_total: 100, vram_free: 60 }],
    });
    expect(stats.comfyVersion).toBe('0.3.10');
    expect(stats.devices).toHaveLength(1);
    expect(stats.devices[0].vramFree).toBe(60);
  });

  it('tolerates garbage', () => {
    expect(parseSystemStats(null).devices).toEqual([]);
    expect(parseSystemStats({}).comfyVersion).toBe('unknown');
  });
});

describe('parseQueue', () => {
  it('counts running and pending', () => {
    expect(parseQueue({ queue_running: [1], queue_pending: [1, 2] })).toEqual({
      running: 1,
      pending: 2,
    });
    expect(parseQueue({})).toEqual({ running: 0, pending: 0 });
  });
});

describe('parsePromptSubmit', () => {
  it('returns the prompt id', () => {
    expect(parsePromptSubmit({ prompt_id: 'p1', number: 3, node_errors: {} }).promptId).toBe(
      'p1'
    );
  });

  it('throws with the server error message', () => {
    expect(() =>
      parsePromptSubmit({ error: { message: 'invalid prompt' } })
    ).toThrow('invalid prompt');
  });
});

describe('parseHistoryOutputs', () => {
  const history = {
    'p-1': {
      outputs: {
        '12': {
          gifs: [{ filename: 'a.mp4', subfolder: 'video', type: 'output', format: 'video/h264-mp4' }],
        },
        '13': { images: [{ filename: 'b.webp', subfolder: '', type: 'output' }] },
        '14': { text: ['not a file'] },
      },
    },
  };

  it('collects gifs, videos and images across nodes', () => {
    const refs = parseHistoryOutputs(history, 'p-1');
    expect(refs.map((r) => r.filename).sort()).toEqual(['a.mp4', 'b.webp']);
    expect(refs.find((r) => r.filename === 'a.mp4')?.subfolder).toBe('video');
  });

  it('returns [] for unknown prompt ids and malformed payloads', () => {
    expect(parseHistoryOutputs(history, 'nope')).toEqual([]);
    expect(parseHistoryOutputs(null, 'p-1')).toEqual([]);
  });
});

describe('parseWsMessage', () => {
  it('parses progress', () => {
    const ev = parseWsMessage(
      JSON.stringify({ type: 'progress', data: { prompt_id: 'p', value: 5, max: 20 } })
    );
    expect(ev).toEqual({ kind: 'progress', promptId: 'p', value: 5, max: 20 });
  });

  it('parses status queue_remaining', () => {
    const ev = parseWsMessage(
      JSON.stringify({ type: 'status', data: { status: { exec_info: { queue_remaining: 2 } } } })
    );
    expect(ev).toEqual({ kind: 'status', queueRemaining: 2 });
  });

  it('parses executed outputs', () => {
    const ev = parseWsMessage(
      JSON.stringify({
        type: 'executed',
        data: {
          prompt_id: 'p',
          node: 'save',
          output: { gifs: [{ filename: 'x.mp4', subfolder: '', type: 'output' }] },
        },
      })
    );
    expect(ev.kind).toBe('executed');
    if (ev.kind === 'executed') expect(ev.outputs[0].filename).toBe('x.mp4');
  });

  it('parses execution_error with a message', () => {
    const ev = parseWsMessage(
      JSON.stringify({
        type: 'execution_error',
        data: { prompt_id: 'p', exception_message: 'CUDA OOM' },
      })
    );
    expect(ev).toEqual({ kind: 'execution_error', promptId: 'p', message: 'CUDA OOM' });
  });

  it('never throws on garbage', () => {
    expect(parseWsMessage('not json').kind).toBe('unknown');
    expect(parseWsMessage('{"type":"???"}').kind).toBe('unknown');
  });
});
