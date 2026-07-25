'use client';

import Link from 'next/link';
import { EmptyState, PageHeader, ProgressBar, formatAgo } from '@/components/ui';
import { isTerminal, type JobState } from '@/lib/jobs/stateMachine';
import { useConnectionStore } from '@/lib/stores/useConnectionStore';
import { useJobStore, type Job } from '@/lib/stores/useJobStore';

const STATE_STYLE: Record<JobState, { label: string; cls: string }> = {
  draft: { label: 'Waiting', cls: 'border-ink-600 bg-ink-800 text-ink-300' },
  submitted: { label: 'Queued on GPU', cls: 'border-amber-800/60 bg-amber-950/50 text-amber-300' },
  running: { label: 'Rendering', cls: 'border-accent-500/50 bg-accent-500/10 text-accent-400' },
  downloading: { label: 'Downloading', cls: 'border-brand-500/60 bg-brand-600/15 text-brand-400' },
  completed: { label: 'Done', cls: 'border-emerald-800/60 bg-emerald-950/50 text-emerald-300' },
  failed: { label: 'Failed', cls: 'border-red-900/60 bg-red-950/50 text-red-300' },
  cancelled: { label: 'Cancelled', cls: 'border-ink-600 bg-ink-800 text-ink-400' },
};

function JobRow({ job }: { job: Job }) {
  const { cancel, retry } = useJobStore();
  const style = STATE_STYLE[job.state];
  const active = !isTerminal(job.state);

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {job.campaignLabel && (
            <div className="text-xs font-semibold text-accent-400">{job.campaignLabel}</div>
          )}
          <p className="mt-0.5 line-clamp-2 text-sm text-ink-200">{job.prompt}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-ink-500">
            <span className={`chip border ${style.cls}`}>{style.label}</span>
            <span>
              {job.width}×{job.height} · {job.durationSeconds}s · {job.mode.toUpperCase()}
            </span>
            {job.brandKitName && <span className="text-brand-400">{job.brandKitName}</span>}
            <span>{formatAgo(job.createdAt)}</span>
          </div>
          {job.error && <p className="mt-2 text-xs text-red-400">{job.error}</p>}
        </div>
        <div className="flex shrink-0 gap-2">
          {active && (
            <button className="btn-secondary !px-3 !py-1.5 text-xs" onClick={() => cancel(job.id)}>
              Cancel
            </button>
          )}
          {(job.state === 'failed' || job.state === 'cancelled') && (
            <button className="btn-secondary !px-3 !py-1.5 text-xs" onClick={() => retry(job.id)}>
              Retry
            </button>
          )}
          {job.state === 'completed' && (
            <Link className="btn-secondary !px-3 !py-1.5 text-xs" href="/gallery/">
              View
            </Link>
          )}
        </div>
      </div>
      {(job.state === 'running' || job.state === 'downloading') && (
        <div className="mt-3">
          <ProgressBar value={job.state === 'downloading' ? 1 : job.progress} />
          <div className="mt-1 text-right font-mono text-[11px] text-ink-500">
            {job.state === 'downloading'
              ? 'saving to gallery…'
              : `${Math.round(job.progress * 100)}%`}
          </div>
        </div>
      )}
    </div>
  );
}

export default function QueuePage() {
  const jobs = useJobStore((s) => s.jobs);
  const clearFinished = useJobStore((s) => s.clearFinished);
  const status = useConnectionStore((s) => s.status);

  const active = jobs.filter((j) => !isTerminal(j.state));
  const finished = jobs.filter((j) => isTerminal(j.state));

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Queue"
        subtitle="Jobs render one at a time on the free GPU. Leave this tab open — videos land in the gallery automatically."
        actions={
          finished.length > 0 ? (
            <button className="btn-secondary" onClick={clearFinished}>
              Clear finished
            </button>
          ) : undefined
        }
      />

      {status !== 'connected' && active.length > 0 && (
        <div className="mb-4 rounded-xl border border-amber-800/60 bg-amber-950/40 px-4 py-3 text-sm text-amber-300">
          Backend offline — waiting jobs will start once you{' '}
          <Link href="/connect/" className="underline">
            reconnect
          </Link>
          .
        </div>
      )}

      {jobs.length === 0 ? (
        <EmptyState
          icon="≡"
          title="Queue is empty"
          body="Fire a single render from the Studio, or batch dozens with a brand content pack."
          action={
            <div className="flex gap-2">
              <Link href="/studio/" className="btn-secondary">
                Open Studio
              </Link>
              <Link href="/generate/" className="btn-primary">
                Build a content pack
              </Link>
            </div>
          }
        />
      ) : (
        <div className="space-y-3">
          {[...active, ...finished.slice().reverse()].map((job) => (
            <JobRow key={job.id} job={job} />
          ))}
        </div>
      )}
    </div>
  );
}
