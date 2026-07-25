'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { PageHeader } from '@/components/ui';
import { VideoThumb } from '@/components/gallery/VideoThumb';
import { isTerminal } from '@/lib/jobs/stateMachine';
import { useBrandStore } from '@/lib/stores/useBrandStore';
import { useConnectionStore } from '@/lib/stores/useConnectionStore';
import { useGalleryStore } from '@/lib/stores/useGalleryStore';
import { useJobStore } from '@/lib/stores/useJobStore';

function StatCard({
  href,
  label,
  value,
  sub,
  accent,
}: {
  href: string;
  label: string;
  value: string;
  sub: string;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`card block p-5 transition hover:border-ink-500 ${accent ? 'border-brand-600/50' : ''}`}
    >
      <div className="text-xs font-semibold uppercase tracking-wider text-ink-400">{label}</div>
      <div className="mt-2 font-display text-2xl font-bold text-white">{value}</div>
      <div className="mt-1 text-xs text-ink-500">{sub}</div>
    </Link>
  );
}

export default function DashboardPage() {
  const connection = useConnectionStore();
  const { kits, refresh: refreshBrands, loaded: brandsLoaded } = useBrandStore();
  const { items, refresh: refreshGallery, loaded: galleryLoaded } = useGalleryStore();
  const jobs = useJobStore((s) => s.jobs);

  useEffect(() => {
    if (!brandsLoaded) void refreshBrands();
    if (!galleryLoaded) void refreshGallery();
  }, [brandsLoaded, galleryLoaded, refreshBrands, refreshGallery]);

  const activeJobs = jobs.filter((j) => !isTerminal(j.state));
  const recent = items.slice(0, 6);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Upload a brand package, connect a free GPU, and generate a whole content calendar of on-brand video."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          href="/connect/"
          label="GPU Backend"
          value={
            connection.status === 'connected'
              ? 'Online'
              : connection.status === 'connecting'
                ? 'Connecting'
                : 'Offline'
          }
          sub={
            connection.status === 'connected'
              ? connection.stats?.devices[0]?.name ?? 'ComfyUI ready'
              : 'Tap to connect your Kaggle tunnel'
          }
          accent={connection.status !== 'connected'}
        />
        <StatCard
          href="/brand/"
          label="Brand kits"
          value={String(kits.length)}
          sub={kits[0] ? `Latest: ${kits[0].name}` : 'Import your first brand package'}
        />
        <StatCard
          href="/queue/"
          label="Queue"
          value={String(activeJobs.length)}
          sub={activeJobs.length ? 'jobs in flight' : 'idle'}
        />
        <StatCard
          href="/gallery/"
          label="Gallery"
          value={String(items.length)}
          sub="videos stored locally in your browser"
        />
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        <Link
          href="/brand/"
          className="card group p-6 transition hover:border-brand-500/60"
        >
          <div className="text-3xl">⬢</div>
          <h3 className="mt-3 font-display text-lg font-bold text-white">1 · Upload your brand</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-400">
            Drop a zip with logos, product shots and lifestyle photos. FrameForge extracts your
            palette and builds a reusable brand kit.
          </p>
        </Link>
        <Link href="/connect/" className="card group p-6 transition hover:border-brand-500/60">
          <div className="text-3xl">⌁</div>
          <h3 className="mt-3 font-display text-lg font-bold text-white">2 · Connect a free GPU</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-400">
            Run the one-cell Kaggle notebook, paste the tunnel URL, and you have a T4-powered
            render farm for ~30 hrs/week. Free.
          </p>
        </Link>
        <Link href="/generate/" className="card group p-6 transition hover:border-brand-500/60">
          <div className="text-3xl">⚡</div>
          <h3 className="mt-3 font-display text-lg font-bold text-white">3 · Generate a content pack</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-400">
            Pick campaign types — logo stings, product spotlights, social teasers — and batch-render
            dozens of on-brand clips.
          </p>
        </Link>
      </div>

      {recent.length > 0 && (
        <div className="mt-10">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-bold text-white">Recent renders</h2>
            <Link href="/gallery/" className="text-sm text-accent-400 hover:underline">
              View all →
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {recent.map((item) => (
              <VideoThumb key={item.id} item={item} compact />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
