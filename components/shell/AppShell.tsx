'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useConnectionStore } from '@/lib/stores/useConnectionStore';
import { useJobStore } from '@/lib/stores/useJobStore';
import { isTerminal } from '@/lib/jobs/stateMachine';

const NAV = [
  { href: '/', label: 'Dashboard', icon: '◈' },
  { href: '/create/', label: 'Create', icon: '✹' },
  { href: '/brand/', label: 'Brand Kits', icon: '⬢' },
  { href: '/generate/', label: 'Content Packs', icon: '⚡' },
  { href: '/studio/', label: 'Studio', icon: '✦' },
  { href: '/queue/', label: 'Queue', icon: '≡' },
  { href: '/gallery/', label: 'Gallery', icon: '▣' },
  { href: '/editor/', label: 'Editor', icon: '✂' },
  { href: '/connect/', label: 'Connect', icon: '⌁' },
  { href: '/settings/', label: 'Settings', icon: '⚙' },
];

function StatusPill() {
  const status = useConnectionStore((s) => s.status);
  const connectedAt = useConnectionStore((s) => s.connectedAt);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Poll the backend every 45s while connected so a dead tunnel surfaces fast,
  // and restart any parked draft jobs when a connection (re)appears.
  useEffect(() => {
    if (status !== 'connected') return;
    useJobStore.getState().pump();
    const t = setInterval(() => void useConnectionStore.getState().heartbeat(), 45_000);
    return () => clearInterval(t);
  }, [status]);

  const styles: Record<string, string> = {
    connected: 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60',
    connecting: 'bg-amber-950/60 text-amber-300 border-amber-800/60',
    error: 'bg-red-950/60 text-red-300 border-red-800/60',
    disconnected: 'bg-ink-800 text-ink-400 border-ink-700',
  };
  const dot: Record<string, string> = {
    connected: 'bg-emerald-400',
    connecting: 'bg-amber-400 animate-pulse',
    error: 'bg-red-400',
    disconnected: 'bg-ink-500',
  };
  const label =
    status === 'connected' && connectedAt
      ? `GPU · ${Math.max(0, Math.floor((now - connectedAt) / 60000))}m`
      : status === 'connecting'
        ? 'Connecting…'
        : status === 'error'
          ? 'Backend error'
          : 'Offline';

  return (
    <Link
      href="/connect/"
      className={`chip border ${styles[status]} transition hover:brightness-125`}
      title="Connection status — tap to manage"
    >
      <span className={`h-2 w-2 rounded-full ${dot[status]}`} />
      {label}
    </Link>
  );
}

function QueueBadge() {
  const jobs = useJobStore((s) => s.jobs);
  const active = jobs.filter((j) => !isTerminal(j.state)).length;
  if (!active) return null;
  return (
    <span className="ml-auto rounded-full bg-brand-600 px-2 py-0.5 text-[11px] font-bold text-white">
      {active}
    </span>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* Sidebar (desktop) / top bar (mobile) */}
      <aside className="sticky top-0 z-40 border-b border-ink-800 bg-ink-950/90 backdrop-blur md:h-screen md:w-60 md:shrink-0 md:border-b-0 md:border-r">
        <div className="flex items-center justify-between px-4 py-3 md:py-5">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-accent-500 font-display text-lg font-bold text-white shadow-lg shadow-brand-600/30">
              F
            </span>
            <div className="leading-tight">
              <div className="font-display text-base font-bold text-white">FrameForge</div>
              <div className="text-[10px] uppercase tracking-widest text-ink-400">
                Brand Video Studio
              </div>
            </div>
          </Link>
          <div className="md:hidden">
            <StatusPill />
          </div>
        </div>

        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:pb-0">
          {NAV.map((item) => {
            const active =
              item.href === '/' ? pathname === '/' : pathname.startsWith(item.href.replace(/\/$/, ''));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex shrink-0 items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition md:w-full ${
                  active
                    ? 'bg-ink-800 text-white shadow-inner'
                    : 'text-ink-400 hover:bg-ink-850 hover:text-ink-200'
                }`}
              >
                <span className="text-base opacity-80">{item.icon}</span>
                {item.label}
                {item.label === 'Queue' && <QueueBadge />}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto hidden px-4 py-4 md:block">
          <StatusPill />
          <p className="mt-3 text-[11px] leading-relaxed text-ink-600">
            100% free stack — models, GPU and hosting.
          </p>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
    </div>
  );
}
