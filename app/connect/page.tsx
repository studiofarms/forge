'use client';

import { useEffect, useState } from 'react';
import { Field, PageHeader } from '@/components/ui';
import { useConnectionStore } from '@/lib/stores/useConnectionStore';

function SessionTimer() {
  const connectedAt = useConnectionStore((s) => s.connectedAt);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!connectedAt) return null;
  const secs = Math.floor((now - connectedAt) / 1000);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    <div className="card p-5">
      <div className="label !mb-0">Session timer</div>
      <div className="mt-2 font-mono text-3xl font-bold text-white">
        {pad(h)}:{pad(m)}:{pad(s)}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-ink-500">
        Kaggle sessions last ~9–12 hours and count against ~30 free GPU hours/week. Budget
        accordingly — the tunnel URL changes every new session.
      </p>
    </div>
  );
}

export default function ConnectPage() {
  const { url, status, error, stats, setUrl, connect, disconnect } = useConnectionStore();
  const [busy, setBusy] = useState(false);

  const handleConnect = async () => {
    setBusy(true);
    await connect();
    setBusy(false);
  };

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Connect"
        subtitle="Point FrameForge at your free GPU backend. Run the Kaggle notebook, copy the tunnel URL it prints, paste it here."
      />

      <div className="card p-6">
        <Field
          label="Tunnel URL"
          hint="Looks like https://something-random.trycloudflare.com — printed by the notebook after ComfyUI boots."
        >
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              className="input flex-1 font-mono"
              placeholder="https://your-tunnel.trycloudflare.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
              spellCheck={false}
            />
            {status === 'connected' ? (
              <button className="btn-secondary" onClick={disconnect}>
                Disconnect
              </button>
            ) : (
              <button className="btn-primary" onClick={handleConnect} disabled={busy}>
                {busy ? 'Connecting…' : 'Connect'}
              </button>
            )}
          </div>
        </Field>

        {error && (
          <div className="mt-4 rounded-xl border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {status === 'connected' && stats && (
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-emerald-800/50 bg-emerald-950/30 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                Connected
              </div>
              <div className="mt-1 text-sm text-ink-200">
                ComfyUI {stats.comfyVersion} · {stats.os}
              </div>
            </div>
            {stats.devices.map((d, i) => (
              <div key={i} className="rounded-xl border border-ink-700 bg-ink-850 px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-ink-400">
                  {d.name}
                </div>
                <div className="mt-1 text-sm text-ink-200">
                  {(d.vramFree / 1024 ** 3).toFixed(1)} GB free /{' '}
                  {(d.vramTotal / 1024 ** 3).toFixed(1)} GB VRAM
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <SessionTimer />
        <div className="card p-5">
          <div className="label !mb-0">How to boot the backend</div>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-ink-400">
            <li>Open kaggle.com → New Notebook</li>
            <li>Accelerator: GPU T4 ×2 · Internet: ON</li>
            <li>
              Paste <code className="rounded bg-ink-800 px-1.5 py-0.5 text-accent-400">backend/kaggle_notebook.py</code>{' '}
              and run
            </li>
            <li>Copy the printed trycloudflare URL here</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
