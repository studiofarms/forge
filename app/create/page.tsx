'use client';

// Prompt → Video: describe the video once; FrameForge plans a shot list,
// queues every scene on the GPU, then assembles the finished clips into an
// edited timeline (crossfades + title) ready to fine-tune and export.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Field, PageHeader, ProgressBar, SliderField } from '@/components/ui';
import {
  STORY_ASPECT_DIMENSIONS,
  buildStoryboard,
  storyboardTitle,
  type StoryAspect,
} from '@/lib/editor/storyboard';
import { probeDuration } from '@/lib/editor/media';
import { emptyProject, type Project, type TimelineClip } from '@/lib/editor/timeline';
import { newId } from '@/lib/db';
import { useBrandStore } from '@/lib/stores/useBrandStore';
import { useConnectionStore } from '@/lib/stores/useConnectionStore';
import { useCreateStore, type CreatePlan } from '@/lib/stores/useCreateStore';
import { useEditorStore } from '@/lib/stores/useEditorStore';
import { useGalleryStore } from '@/lib/stores/useGalleryStore';
import { useJobStore, type NewJobInput } from '@/lib/stores/useJobStore';

const ASPECTS: { id: StoryAspect; label: string }[] = [
  { id: 'landscape', label: '16:9' },
  { id: 'square', label: '1:1' },
  { id: 'portrait', label: '9:16' },
];

type SceneStatus =
  | { kind: 'done'; galleryItemId: string }
  | { kind: 'running'; progress: number }
  | { kind: 'waiting' }
  | { kind: 'failed'; error?: string }
  | { kind: 'missing' }; // no live job and no matching clip (e.g. after reload)

export default function CreatePage() {
  const router = useRouter();
  const status = useConnectionStore((s) => s.status);
  const { plan, start, setSceneJob, clear } = useCreateStore();
  const jobs = useJobStore((s) => s.jobs);
  const enqueueMany = useJobStore((s) => s.enqueueMany);
  const galleryItems = useGalleryStore((s) => s.items);
  const refreshGallery = useGalleryStore((s) => s.refresh);
  const { kits, activeKitId, setActiveKit, refresh: refreshBrands, loaded: brandsLoaded } = useBrandStore();
  const setProject = useEditorStore((s) => s.setProject);

  const [idea, setIdea] = useState('');
  const [sceneCount, setSceneCount] = useState(4);
  const [sceneSeconds, setSceneSeconds] = useState(4);
  const [aspect, setAspect] = useState<StoryAspect>('landscape');
  const [useBrand, setUseBrand] = useState(true);
  const [assembling, setAssembling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!brandsLoaded) void refreshBrands();
    void refreshGallery();
  }, [brandsLoaded, refreshBrands, refreshGallery]);

  const kit = kits.find((k) => k.id === activeKitId) ?? null;

  // ── Scene status: live job first, else newest gallery item with the prompt ─
  const sceneStatuses = useMemo<SceneStatus[]>(() => {
    if (!plan) return [];
    return plan.scenes.map((scene) => {
      const job = scene.jobId ? jobs.find((j) => j.id === scene.jobId) : undefined;
      if (job?.galleryItemId) return { kind: 'done', galleryItemId: job.galleryItemId };
      const match = galleryItems.find(
        (g) => g.prompt === scene.prompt && g.createdAt >= plan.createdAt
      );
      if (match) return { kind: 'done', galleryItemId: match.id };
      if (!job) return { kind: 'missing' };
      if (job.state === 'running' || job.state === 'downloading')
        return { kind: 'running', progress: job.progress };
      if (job.state === 'failed' || job.state === 'cancelled')
        return { kind: 'failed', error: job.error };
      return { kind: 'waiting' };
    });
  }, [plan, jobs, galleryItems]);

  const doneCount = sceneStatuses.filter((s) => s.kind === 'done').length;
  const overall = plan
    ? sceneStatuses.reduce(
        (acc, s) => acc + (s.kind === 'done' ? 1 : s.kind === 'running' ? s.progress : 0),
        0
      ) / plan.scenes.length
    : 0;

  // ── Actions ────────────────────────────────────────────────────────────────
  function planAndGenerate() {
    setError(null);
    let scenes;
    try {
      scenes = buildStoryboard(idea, { sceneCount, aspect, kit: useBrand ? kit : null });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return;
    }
    const dims = STORY_ASPECT_DIMENSIONS[aspect];
    const newPlan: CreatePlan = {
      idea: idea.trim(),
      title: storyboardTitle(idea, useBrand ? kit : null),
      aspect,
      width: dims.width,
      height: dims.height,
      sceneSeconds,
      fps: 24,
      brandKitId: useBrand && kit ? kit.id : undefined,
      brandKitName: useBrand && kit ? kit.name : undefined,
      createdAt: Date.now(),
      scenes: scenes.map((s) => ({ sceneId: s.id, label: s.label, prompt: s.prompt })),
    };
    const inputs: NewJobInput[] = scenes.map((s) => ({
      prompt: s.prompt,
      negativePrompt: s.negativePrompt,
      mode: 't2v',
      width: dims.width,
      height: dims.height,
      durationSeconds: sceneSeconds,
      fps: 24,
      steps: 25,
      cfg: 3,
      seed: (Math.floor(Math.random() * 2 ** 32)) >>> 0,
      brandKitId: newPlan.brandKitId,
      brandKitName: newPlan.brandKitName,
      campaignLabel: `Film: ${newPlan.title}`,
    }));
    const ids = enqueueMany(inputs);
    newPlan.scenes.forEach((s, i) => (s.jobId = ids[i]));
    start(newPlan);
  }

  function requeueMissing() {
    if (!plan) return;
    const inputs: NewJobInput[] = [];
    const sceneIds: string[] = [];
    plan.scenes.forEach((scene, i) => {
      const st = sceneStatuses[i];
      if (st.kind !== 'missing' && st.kind !== 'failed') return;
      sceneIds.push(scene.sceneId);
      inputs.push({
        prompt: scene.prompt,
        negativePrompt: '',
        mode: 't2v',
        width: plan.width,
        height: plan.height,
        durationSeconds: plan.sceneSeconds,
        fps: plan.fps,
        steps: 25,
        cfg: 3,
        seed: (Math.floor(Math.random() * 2 ** 32)) >>> 0,
        brandKitId: plan.brandKitId,
        brandKitName: plan.brandKitName,
        campaignLabel: `Film: ${plan.title}`,
      });
    });
    const ids = enqueueMany(inputs);
    sceneIds.forEach((sceneId, i) => setSceneJob(sceneId, ids[i]));
  }

  async function assemble() {
    if (!plan) return;
    setAssembling(true);
    setError(null);
    try {
      const clips: TimelineClip[] = [];
      for (let i = 0; i < plan.scenes.length; i++) {
        const st = sceneStatuses[i];
        if (st.kind !== 'done') continue;
        const duration =
          (await probeDuration(st.galleryItemId)) ?? Math.max(0.5, plan.sceneSeconds);
        clips.push({
          id: newId(),
          galleryId: st.galleryItemId,
          label: plan.scenes[i].label,
          sourceDuration: duration,
          inPoint: 0,
          outPoint: duration,
          transitionAfter: 'crossfade',
        });
      }
      if (clips.length < 1) throw new Error('No finished scenes to assemble yet.');
      clips[clips.length - 1].transitionAfter = 'none';
      const project: Project = {
        ...emptyProject(),
        clips,
        overlays: [
          {
            id: newId(),
            text: plan.title,
            start: 0.3,
            end: Math.min(3.3, clips[0].outPoint),
            position: 'lower-third',
            size: 'lg',
            color: '#ffffff',
            backing: true,
          },
        ],
        crossfadeSeconds: 0.5,
        width: plan.width,
        height: plan.height,
        fps: plan.fps,
      };
      setProject(project);
      router.push('/editor/');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAssembling(false);
    }
  }

  // ── UI ─────────────────────────────────────────────────────────────────────
  const statusLabel = (s: SceneStatus): string =>
    s.kind === 'done'
      ? '✓ done'
      : s.kind === 'running'
        ? `rendering ${Math.round(s.progress * 100)}%`
        : s.kind === 'waiting'
          ? 'waiting'
          : s.kind === 'failed'
            ? 'failed'
            : 'not queued';

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Create"
        subtitle="Describe the video once. FrameForge plans the shots, renders every scene, and cuts them together — you polish and export in the Editor."
      />

      {!plan ? (
        <div className="card space-y-5 p-6">
          <Field label="What's the video about?">
            <textarea
              className="input min-h-[110px] resize-y"
              placeholder="A cozy family farm in autumn — pumpkins, tractors, kids picking apples, warm cider by the barn…"
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <SliderField
              label="Scenes"
              value={sceneCount}
              min={2}
              max={6}
              format={(v) => `${v} shots`}
              onChange={setSceneCount}
            />
            <SliderField
              label="Length per scene"
              value={sceneSeconds}
              min={2}
              max={8}
              format={(v) => `${v}s (~${sceneCount * v}s total)`}
              onChange={setSceneSeconds}
            />
          </div>

          <Field label="Aspect">
            <div className="grid max-w-xs grid-cols-3 gap-2">
              {ASPECTS.map((a) => (
                <button
                  key={a.id}
                  className={`${aspect === a.id ? 'btn-primary' : 'btn-secondary'} !px-2 !py-2 text-xs`}
                  onClick={() => setAspect(a.id)}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </Field>

          {kits.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="input !w-auto !py-1.5 text-xs"
                value={activeKitId ?? ''}
                onChange={(e) => setActiveKit(e.target.value || null)}
              >
                {kits.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name}
                  </option>
                ))}
              </select>
              <button
                className={`${useBrand && kit ? 'btn-primary' : 'btn-secondary'} !px-3 !py-1.5 text-xs`}
                onClick={() => setUseBrand((v) => !v)}
              >
                Brand styling {useBrand && kit ? 'on' : 'off'}
              </button>
            </div>
          )}

          <button
            className="btn-primary w-full !py-3.5 text-base"
            disabled={!idea.trim()}
            onClick={planAndGenerate}
          >
            🎬 Plan & generate my video
          </button>
          {status !== 'connected' && (
            <p className="text-center text-xs text-amber-400/90">
              Backend offline — scenes will wait in the{' '}
              <Link href="/queue/" className="underline">
                queue
              </Link>{' '}
              until you connect.
            </p>
          )}
          {error && <p className="text-center text-xs text-red-400">{error}</p>}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="card space-y-4 p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-bold text-white">{plan.title}</h2>
                <p className="mt-0.5 text-xs text-ink-500">
                  {plan.scenes.length} scenes · {plan.width}×{plan.height} ·{' '}
                  {plan.sceneSeconds}s each{plan.brandKitName ? ` · ${plan.brandKitName}` : ''}
                </p>
              </div>
              <button className="btn-ghost !px-3 !py-1.5 text-xs" onClick={clear}>
                ✕ Start over
              </button>
            </div>
            <ProgressBar value={overall} />
            <p className="text-xs text-ink-400">
              {doneCount}/{plan.scenes.length} scenes finished
              {status !== 'connected' && doneCount < plan.scenes.length
                ? ' — backend offline, scenes are parked in the queue'
                : ''}
            </p>
          </div>

          <div className="space-y-2">
            {plan.scenes.map((scene, i) => {
              const st = sceneStatuses[i];
              return (
                <div key={scene.sceneId} className="card flex items-center gap-3 p-4">
                  <span
                    className={`chip shrink-0 border ${
                      st.kind === 'done'
                        ? 'border-emerald-800/60 bg-emerald-950/60 text-emerald-300'
                        : st.kind === 'failed' || st.kind === 'missing'
                          ? 'border-red-800/60 bg-red-950/40 text-red-300'
                          : 'border-ink-700 text-ink-400'
                    }`}
                  >
                    {statusLabel(st)}
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-ink-200">
                      {i + 1}. {scene.label}
                    </div>
                    <p className="truncate text-xs text-ink-500" title={scene.prompt}>
                      {scene.prompt}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              className="btn-primary flex-1 !py-3"
              disabled={doneCount === 0 || assembling}
              onClick={() => void assemble()}
            >
              {assembling
                ? 'Assembling…'
                : doneCount === plan.scenes.length
                  ? '✂ Build my timeline'
                  : `✂ Build with ${doneCount} finished scene${doneCount === 1 ? '' : 's'}`}
            </button>
            {sceneStatuses.some((s) => s.kind === 'failed' || s.kind === 'missing') && (
              <button className="btn-secondary" onClick={requeueMissing}>
                ↻ Re-queue missing
              </button>
            )}
          </div>
          <p className="text-xs text-ink-600">
            Assembling replaces whatever is currently on the Editor timeline.
          </p>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      )}
    </div>
  );
}
