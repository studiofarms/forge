'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { EmptyState, PageHeader, SliderField } from '@/components/ui';
import {
  ASPECT_DIMENSIONS,
  CAMPAIGN_TEMPLATES,
  generateContentPack,
  hashString,
  type GenerationPlanItem,
} from '@/lib/brand/contentEngine';
import { LIMITS } from '@/lib/comfy/buildWorkflow';
import { useBrandStore } from '@/lib/stores/useBrandStore';
import { useConnectionStore } from '@/lib/stores/useConnectionStore';
import { useJobStore, type NewJobInput } from '@/lib/stores/useJobStore';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';

export default function GeneratePage() {
  const { kits, assets, activeKitId, setActiveKit, loaded, refresh, assetKindsFor, firstAssetOf } =
    useBrandStore();
  const settings = useSettingsStore();
  const enqueueMany = useJobStore((s) => s.enqueueMany);
  const status = useConnectionStore((s) => s.status);

  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(['logo-sting', 'product-spotlight', 'social-teaser'])
  );
  const [variants, setVariants] = useState(2);
  const [duration, setDuration] = useState(settings.defaultDurationSeconds);
  const [fps, setFps] = useState(settings.defaultFps);
  const [steps, setSteps] = useState(settings.defaultSteps);
  const [cfg, setCfg] = useState(settings.defaultCfg);
  const [seedSalt, setSeedSalt] = useState('pack-1');
  const [queued, setQueued] = useState<number | null>(null);

  useEffect(() => {
    if (!loaded) void refresh();
  }, [loaded, refresh]);

  const kit = kits.find((k) => k.id === activeKitId) ?? null;
  const availableKinds = kit ? assetKindsFor(kit.id) : [];

  const plan: GenerationPlanItem[] = useMemo(() => {
    if (!kit) return [];
    return generateContentPack(kit, {
      templateIds: [...selected],
      variantsPerTemplate: variants,
      durationSeconds: duration,
      fps,
      steps,
      cfg,
      baseSeed: hashString(`${kit.id}:${seedSalt}`),
      availableAssetKinds: availableKinds,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kit, selected, variants, duration, fps, steps, cfg, seedSalt, assets]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const queuePack = () => {
    if (!kit || !plan.length) return;
    const inputs: NewJobInput[] = plan.map((item) => ({
      prompt: item.prompt,
      negativePrompt: item.negativePrompt,
      mode: item.mode,
      width: item.width,
      height: item.height,
      durationSeconds: item.durationSeconds,
      fps: item.fps,
      steps: item.steps,
      cfg: item.cfg,
      seed: item.seed,
      assetId:
        item.mode === 'i2v' && item.assetKind
          ? firstAssetOf(kit.id, item.assetKind)?.id
          : undefined,
      imageStrength: 0.85,
      brandKitId: kit.id,
      brandKitName: kit.name,
      campaignLabel: item.label,
    }));
    enqueueMany(inputs);
    setQueued(inputs.length);
    setSeedSalt(`pack-${Math.floor(Math.random() * 100000)}`);
    setTimeout(() => setQueued(null), 4000);
  };

  if (loaded && kits.length === 0) {
    return (
      <div>
        <PageHeader title="Content Packs" subtitle="Batch-generate a library of on-brand video." />
        <EmptyState
          icon="⚡"
          title="You need a brand kit first"
          body="Content packs are generated from a brand kit — its voice, palette, keywords and assets drive every prompt."
          action={
            <Link href="/brand/" className="btn-primary">
              Create a brand kit
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Content Packs"
        subtitle="Pick campaign types, choose how many variants of each, and queue the whole batch in one tap."
        actions={
          <select
            className="input !w-auto"
            value={activeKitId ?? ''}
            onChange={(e) => setActiveKit(e.target.value || null)}
          >
            {kits.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </select>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div>
          <div className="grid gap-3 sm:grid-cols-2">
            {CAMPAIGN_TEMPLATES.map((t) => {
              const on = selected.has(t.id);
              const canI2v = t.assetKind != null && availableKinds.includes(t.assetKind);
              const dims = ASPECT_DIMENSIONS[t.aspect];
              return (
                <button
                  key={t.id}
                  onClick={() => toggle(t.id)}
                  className={`card p-4 text-left transition ${
                    on ? 'border-brand-500/70 bg-brand-600/10' : 'hover:border-ink-500'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-2xl">{t.emoji}</span>
                    <span
                      className={`grid h-5 w-5 place-items-center rounded-md border text-xs ${
                        on ? 'border-brand-500 bg-brand-500 text-white' : 'border-ink-600'
                      }`}
                    >
                      {on ? '✓' : ''}
                    </span>
                  </div>
                  <div className="mt-2 font-display font-bold text-white">{t.label}</div>
                  <p className="mt-1 text-xs leading-relaxed text-ink-400">{t.description}</p>
                  <div className="mt-2.5 flex flex-wrap gap-1.5 text-[10px]">
                    <span className="chip border border-ink-700 bg-ink-850 text-ink-400">
                      {t.aspect} · {dims.width}×{dims.height}
                    </span>
                    {t.assetKind && (
                      <span
                        className={`chip border ${
                          canI2v
                            ? 'border-accent-500/50 bg-accent-500/10 text-accent-400'
                            : 'border-ink-700 bg-ink-850 text-ink-500'
                        }`}
                        title={
                          canI2v
                            ? `Animates your uploaded ${t.assetKind} image`
                            : `Upload a ${t.assetKind} image to animate it directly`
                        }
                      >
                        {canI2v ? `animates your ${t.assetKind} ✓` : `text-only (no ${t.assetKind})`}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-4">
          <div className="card space-y-4 p-5">
            <SliderField
              label="Variants per campaign"
              value={variants}
              min={1}
              max={10}
              onChange={setVariants}
            />
            <SliderField
              label="Clip duration"
              value={duration}
              min={LIMITS.durationSeconds.min}
              max={LIMITS.durationSeconds.max}
              format={(v) => `${v}s`}
              onChange={setDuration}
            />
            <SliderField label="FPS" value={fps} min={LIMITS.fps.min} max={LIMITS.fps.max} onChange={setFps} />
            <SliderField
              label="Steps"
              value={steps}
              min={LIMITS.steps.min}
              max={LIMITS.steps.max}
              onChange={setSteps}
            />
            <SliderField
              label="CFG"
              value={cfg}
              min={LIMITS.cfg.min}
              max={LIMITS.cfg.max}
              step={0.5}
              onChange={setCfg}
            />
          </div>

          <div className="card p-5">
            <div className="flex items-baseline justify-between">
              <span className="label !mb-0">Pack size</span>
              <span className="font-display text-2xl font-bold text-white">{plan.length}</span>
            </div>
            <p className="mt-1 text-xs text-ink-500">
              ≈ {plan.length * duration}s of footage · rendered one clip at a time
            </p>
            <button
              className="btn-primary mt-4 w-full !py-3.5 text-base"
              disabled={!plan.length}
              onClick={queuePack}
            >
              {queued != null ? `✓ ${queued} jobs queued!` : `⚡ Queue ${plan.length} renders`}
            </button>
            {status !== 'connected' && (
              <p className="mt-2 text-center text-xs text-amber-400/90">
                Backend offline — jobs will wait until you{' '}
                <Link href="/connect/" className="underline">
                  connect
                </Link>
                .
              </p>
            )}
          </div>
        </div>
      </div>

      {plan.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 font-display text-lg font-bold text-white">
            Prompt preview <span className="text-sm font-normal text-ink-500">— exactly what each clip will render</span>
          </h2>
          <div className="grid gap-2">
            {plan.map((item) => (
              <div key={item.id} className="card flex items-start gap-3 p-4">
                <span className="chip mt-0.5 shrink-0 border border-ink-700 bg-ink-850 text-ink-300">
                  {item.label}
                </span>
                <p className="min-w-0 text-xs leading-relaxed text-ink-400">{item.prompt}</p>
                <span className="ml-auto shrink-0 font-mono text-[10px] text-ink-600">
                  {item.mode} · {item.width}×{item.height}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
