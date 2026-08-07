'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Field, PageHeader, SliderField } from '@/components/ui';
import { LIMITS, snapDimension, toFrameCount } from '@/lib/comfy/buildWorkflow';
import { CAMERA_MOVES, STYLE_PRESETS, craftPrompt, variationSeeds } from '@/lib/comfy/promptCraft';
import { hashString } from '@/lib/brand/contentEngine';
import { VOICE_STYLE, colorDescription } from '@/lib/brand/types';
import { saveStagedImage } from '@/lib/db';
import { useBrandStore } from '@/lib/stores/useBrandStore';
import { useConnectionStore } from '@/lib/stores/useConnectionStore';
import { useJobStore } from '@/lib/stores/useJobStore';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';

const ASPECTS = [
  { id: 'landscape', label: '16:9', w: 768, h: 512 },
  { id: 'square', label: '1:1', w: 640, h: 640 },
  { id: 'portrait', label: '9:16', w: 512, h: 768 },
];

const VARIATION_CHOICES = [1, 2, 4];

function ChipRow({
  label,
  chips,
  selected,
  onToggle,
}: {
  label: string;
  chips: { id: string; label: string }[];
  selected: string | null;
  onToggle: (id: string | null) => void;
}) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onToggle(selected === c.id ? null : c.id)}
            className={`chip border transition ${
              selected === c.id
                ? 'border-brand-500 bg-brand-950/60 text-brand-300'
                : 'border-ink-700 text-ink-400 hover:border-ink-500'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function StudioPage() {
  const settings = useSettingsStore();
  const status = useConnectionStore((s) => s.status);
  const enqueueMany = useJobStore((s) => s.enqueueMany);
  const { kits, activeKitId, setActiveKit, refresh, loaded } = useBrandStore();

  const [prompt, setPrompt] = useState('');
  const [negative, setNegative] = useState(settings.defaultNegativePrompt);
  const [cameraId, setCameraId] = useState<string | null>(null);
  const [styleId, setStyleId] = useState<string | null>(null);
  const [enhance, setEnhance] = useState(false);
  const [variations, setVariations] = useState(1);
  const [width, setWidth] = useState(settings.defaultWidth);
  const [height, setHeight] = useState(settings.defaultHeight);
  const [duration, setDuration] = useState(settings.defaultDurationSeconds);
  const [fps, setFps] = useState(settings.defaultFps);
  const [steps, setSteps] = useState(settings.defaultSteps);
  const [cfg, setCfg] = useState(settings.defaultCfg);
  const [seedText, setSeedText] = useState('');
  const [brandInfuse, setBrandInfuse] = useState(true);
  const [queuedFlash, setQueuedFlash] = useState(false);

  // Start image (turns the job into image-to-video, like Kling / Runway).
  const [startImage, setStartImage] = useState<{ blob: Blob; url: string; name: string } | null>(null);
  const [imageStrength, setImageStrength] = useState(0.9);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loaded) void refresh();
  }, [loaded, refresh]);

  useEffect(
    () => () => {
      if (startImage) URL.revokeObjectURL(startImage.url);
    },
    [startImage]
  );

  const kit = kits.find((k) => k.id === activeKitId) ?? null;

  const finalPrompt = useMemo(() => {
    const crafted = craftPrompt({ base: prompt, cameraId, styleId, enhance });
    if (!crafted || !brandInfuse || !kit) return crafted;
    const extras = [VOICE_STYLE[kit.voice], colorDescription(kit.colors)]
      .filter(Boolean)
      .join(', ');
    return `${crafted}, ${extras}`;
  }, [prompt, cameraId, styleId, enhance, brandInfuse, kit]);

  const frames = toFrameCount(duration, fps);

  function pickImage(file: File | undefined | null) {
    if (!file || !file.type.startsWith('image/')) return;
    if (startImage) URL.revokeObjectURL(startImage.url);
    setStartImage({ blob: file, url: URL.createObjectURL(file), name: file.name });
  }

  const generate = async () => {
    if (!finalPrompt) return;
    const baseSeed = seedText.trim()
      ? Number.isFinite(Number(seedText))
        ? Number(seedText) >>> 0
        : hashString(seedText)
      : (Math.floor(Math.random() * 2 ** 32)) >>> 0;
    const seeds = variationSeeds(baseSeed, variations);
    const stagedImageId = startImage ? await saveStagedImage(startImage.blob) : undefined;
    enqueueMany(
      seeds.map((seed) => ({
        prompt: finalPrompt,
        negativePrompt: negative,
        mode: stagedImageId ? ('i2v' as const) : ('t2v' as const),
        stagedImageId,
        imageStrength: stagedImageId ? imageStrength : undefined,
        width,
        height,
        durationSeconds: duration,
        fps,
        steps,
        cfg,
        seed,
        brandKitId: brandInfuse && kit ? kit.id : undefined,
        brandKitName: brandInfuse && kit ? kit.name : undefined,
      }))
    );
    setQueuedFlash(true);
    setTimeout(() => setQueuedFlash(false), 2500);
  };

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Studio"
        subtitle="Craft a single shot — from a prompt, or bring a picture to life. For batch brand content, use Content Packs."
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

          {/* Start image → i2v */}
          <div className="rounded-xl border border-ink-700 bg-ink-850 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-ink-200">Start from a picture</div>
                <p className="mt-0.5 text-xs text-ink-500">
                  Upload any image and the video grows out of it (image-to-video).
                </p>
              </div>
              {!startImage && (
                <button className="btn btn-secondary shrink-0" onClick={() => fileInputRef.current?.click()}>
                  Choose image…
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => pickImage(e.target.files?.[0])}
            />
            {startImage && (
              <div className="mt-3 space-y-3">
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={startImage.url}
                    alt={startImage.name}
                    className="h-20 w-28 rounded-lg border border-ink-700 object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs text-ink-300">{startImage.name}</div>
                    <button
                      className="btn-ghost mt-1 !px-2 !py-1 text-xs"
                      onClick={() => {
                        URL.revokeObjectURL(startImage.url);
                        setStartImage(null);
                      }}
                    >
                      ✕ Remove
                    </button>
                  </div>
                </div>
                <SliderField
                  label="Image influence"
                  value={imageStrength}
                  min={0.1}
                  max={1}
                  step={0.05}
                  format={(v) => `${Math.round(v * 100)}%`}
                  onChange={setImageStrength}
                />
              </div>
            )}
          </div>

          <ChipRow label="Camera move" chips={CAMERA_MOVES} selected={cameraId} onToggle={setCameraId} />
          <ChipRow label="Style" chips={STYLE_PRESETS} selected={styleId} onToggle={setStyleId} />

          <button
            type="button"
            onClick={() => setEnhance((v) => !v)}
            className={`chip border transition ${
              enhance
                ? 'border-accent-500 bg-accent-950/50 text-accent-300'
                : 'border-ink-700 text-ink-400 hover:border-ink-500'
            }`}
          >
            ✨ Enhance prompt {enhance ? 'on' : 'off'}
          </button>

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
            <Field label="Variations" hint="Same prompt, different seeds — pick the winner.">
              <div className="grid grid-cols-3 gap-2">
                {VARIATION_CHOICES.map((n) => (
                  <button
                    key={n}
                    className={`${variations === n ? 'btn-primary' : 'btn-secondary'} !px-2 !py-2 text-xs`}
                    onClick={() => setVariations(n)}
                  >
                    ×{n}
                  </button>
                ))}
              </div>
            </Field>
          </div>

          <button
            className="btn-primary w-full !py-3.5 text-base"
            onClick={() => void generate()}
            disabled={!finalPrompt}
          >
            {queuedFlash
              ? `✓ Queued${variations > 1 ? ` ×${variations}` : ''}!`
              : `✦ Generate${variations > 1 ? ` ×${variations}` : ''}`}
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
