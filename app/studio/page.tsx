'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Field, PageHeader, SliderField } from '@/components/ui';
import { LIMITS, snapDimension, toFrameCount } from '@/lib/comfy/buildWorkflow';
import { hashString } from '@/lib/brand/contentEngine';
import { VOICE_STYLE, colorDescription } from '@/lib/brand/types';
import { useBrandStore } from '@/lib/stores/useBrandStore';
import { useConnectionStore } from '@/lib/stores/useConnectionStore';
import { useJobStore } from '@/lib/stores/useJobStore';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';

const ASPECTS = [
  { id: 'landscape', label: '16:9', w: 768, h: 512 },
  { id: 'square', label: '1:1', w: 640, h: 640 },
  { id: 'portrait', label: '9:16', w: 512, h: 768 },
];

export default function StudioPage() {
  const settings = useSettingsStore();
  const status = useConnectionStore((s) => s.status);
  const enqueue = useJobStore((s) => s.enqueue);
  const { kits, activeKitId, setActiveKit, refresh, loaded } = useBrandStore();

  const [prompt, setPrompt] = useState('');
  const [negative, setNegative] = useState(settings.defaultNegativePrompt);
  const [width, setWidth] = useState(settings.defaultWidth);
  const [height, setHeight] = useState(settings.defaultHeight);
  const [duration, setDuration] = useState(settings.defaultDurationSeconds);
  const [fps, setFps] = useState(settings.defaultFps);
  const [steps, setSteps] = useState(settings.defaultSteps);
  const [cfg, setCfg] = useState(settings.defaultCfg);
  const [seedText, setSeedText] = useState('');
  const [brandInfuse, setBrandInfuse] = useState(true);
  const [queuedFlash, setQueuedFlash] = useState(false);

  useEffect(() => {
    if (!loaded) void refresh();
  }, [loaded, refresh]);

  const kit = kits.find((k) => k.id === activeKitId) ?? null;

  const finalPrompt = useMemo(() => {
    const base = prompt.trim();
    if (!base || !brandInfuse || !kit) return base;
    const extras = [VOICE_STYLE[kit.voice], colorDescription(kit.colors)]
      .filter(Boolean)
      .join(', ');
    return `${base}, ${extras}`;
  }, [prompt, brandInfuse, kit]);

  const frames = toFrameCount(duration, fps);

  const generate = () => {
    if (!finalPrompt) return;
    const seed = seedText.trim()
      ? Number.isFinite(Number(seedText))
        ? Number(seedText) >>> 0
        : hashString(seedText)
      : (Math.floor(Math.random() * 2 ** 32)) >>> 0;
    enqueue({
      prompt: finalPrompt,
      negativePrompt: negative,
      mode: 't2v',
      width,
      height,
      durationSeconds: duration,
      fps,
      steps,
      cfg,
      seed,
      brandKitId: brandInfuse && kit ? kit.id : undefined,
      brandKitName: brandInfuse && kit ? kit.name : undefined,
    });
    setQueuedFlash(true);
    setTimeout(() => setQueuedFlash(false), 2500);
  };

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Studio"
        subtitle="Craft a single shot. For batch brand content, use Content Packs."
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="card space-y-5 p-6">
          <Field label="Prompt">
            <textarea
              className="input min-h-[110px] resize-y"
              placeholder="A slow cinematic dolly-in on a farmhouse table at golden hour, fresh produce, steam rising…"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </Field>

          <Field label="Negative prompt">
            <textarea
              className="input min-h-[60px] resize-y"
              value={negative}
              onChange={(e) => setNegative(e.target.value)}
            />
          </Field>

          <div className="rounded-xl border border-ink-700 bg-ink-850 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm font-semibold text-ink-200">Brand infusion</div>
              <div className="flex items-center gap-2">
                <select
                  className="input !w-auto !py-1.5 text-xs"
                  value={activeKitId ?? ''}
                  onChange={(e) => setActiveKit(e.target.value || null)}
                  disabled={!kits.length}
                >
                  {!kits.length && <option value="">No brand kits</option>}
                  {kits.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.name}
                    </option>
                  ))}
                </select>
                <button
                  className={`${brandInfuse && kit ? 'btn-primary' : 'btn-secondary'} !px-3 !py-1.5 text-xs`}
                  onClick={() => setBrandInfuse((v) => !v)}
                  disabled={!kit}
                >
                  {brandInfuse && kit ? 'On' : 'Off'}
                </button>
              </div>
            </div>
            {kit && brandInfuse ? (
              <p className="mt-2 text-xs leading-relaxed text-ink-500">
                Appends <span className="text-ink-300">{kit.name}</span>&apos;s voice (
                {kit.voice}) and palette to your prompt.
              </p>
            ) : (
              <p className="mt-2 text-xs text-ink-600">
                {kits.length
                  ? 'Off — raw prompt only.'
                  : 'Create a brand kit to auto-style your prompts.'}{' '}
                {!kits.length && (
                  <Link href="/brand/" className="text-accent-400 underline">
                    Brand Kits →
                  </Link>
                )}
              </p>
            )}
          </div>

          {finalPrompt && finalPrompt !== prompt.trim() && (
            <div className="rounded-xl border border-brand-600/40 bg-brand-600/10 p-4">
              <div className="label">Final prompt sent to the model</div>
              <p className="text-xs leading-relaxed text-ink-300">{finalPrompt}</p>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="card space-y-4 p-5">
            <Field label="Aspect">
              <div className="grid grid-cols-3 gap-2">
                {ASPECTS.map((a) => (
                  <button
                    key={a.id}
                    className={`${width === a.w && height === a.h ? 'btn-primary' : 'btn-secondary'} !px-2 !py-2 text-xs`}
                    onClick={() => {
                      setWidth(a.w);
                      setHeight(a.h);
                    }}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </Field>
            <SliderField
              label="Width"
              value={width}
              min={LIMITS.size.min}
              max={LIMITS.size.max}
              step={32}
              format={(v) => `${snapDimension(v)}px`}
              onChange={setWidth}
            />
            <SliderField
              label="Height"
              value={height}
              min={LIMITS.size.min}
              max={LIMITS.size.max}
              step={32}
              format={(v) => `${snapDimension(v)}px`}
              onChange={setHeight}
            />
            <SliderField
              label="Duration"
              value={duration}
              min={LIMITS.durationSeconds.min}
              max={LIMITS.durationSeconds.max}
              format={(v) => `${v}s (${frames} frames)`}
              onChange={setDuration}
            />
            <SliderField label="FPS" value={fps} min={LIMITS.fps.min} max={LIMITS.fps.max} onChange={setFps} />
            <SliderField label="Steps" value={steps} min={LIMITS.steps.min} max={LIMITS.steps.max} onChange={setSteps} />
            <SliderField label="CFG" value={cfg} min={LIMITS.cfg.min} max={LIMITS.cfg.max} step={0.5} onChange={setCfg} />
            <Field label="Seed" hint="Blank = random. Any text works too.">
              <input
                className="input font-mono"
                placeholder="random"
                value={seedText}
                onChange={(e) => setSeedText(e.target.value)}
              />
            </Field>
          </div>

          <button
            className="btn-primary w-full !py-3.5 text-base"
            onClick={generate}
            disabled={!finalPrompt}
          >
            {queuedFlash ? '✓ Queued!' : '✦ Generate'}
          </button>
          {status !== 'connected' && (
            <p className="text-center text-xs text-amber-400/90">
              Backend offline — the job will wait in the{' '}
              <Link href="/queue/" className="underline">
                queue
              </Link>{' '}
              until you connect.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
