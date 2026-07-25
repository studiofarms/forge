'use client';

// Right panel of the editor: everything about the current selection and the
// project — trim/transition for the selected clip, text overlays, brand logo
// watermark, music, look (filter + crossfade), and output format.

import { useEffect, useState } from 'react';
import { Field, SliderField, Toggle } from '@/components/ui';
import { db } from '@/lib/db';
import type { BrandAssetMeta } from '@/lib/brand/types';
import {
  clipDuration,
  projectDuration,
  type FilterKind,
  type OverlayPosition,
  type Project,
} from '@/lib/editor/timeline';
import { useEditorStore } from '@/lib/stores/useEditorStore';

const SIZES = [
  { label: 'Landscape 768×512', width: 768, height: 512 },
  { label: 'HD 1280×720', width: 1280, height: 720 },
  { label: 'Square 640×640', width: 640, height: 640 },
  { label: 'Vertical 576×1024', width: 576, height: 1024 },
];

const FILTERS: { value: FilterKind; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'warm', label: 'Warm' },
  { value: 'cool', label: 'Cool' },
  { value: 'mono', label: 'Black & white' },
  { value: 'vivid', label: 'Vivid' },
];

const POSITIONS: { value: OverlayPosition; label: string }[] = [
  { value: 'top', label: 'Top' },
  { value: 'center', label: 'Center' },
  { value: 'lower-third', label: 'Lower third' },
  { value: 'bottom', label: 'Bottom' },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card space-y-3 p-4">
      <h3 className="font-display text-sm font-bold text-white">{title}</h3>
      {children}
    </div>
  );
}

export function Inspector({ project, playhead }: { project: Project; playhead: number }) {
  const store = useEditorStore();
  const selected = project.clips.find((c) => c.id === store.selectedClipId) ?? null;
  const [logoAssets, setLogoAssets] = useState<BrandAssetMeta[]>([]);

  useEffect(() => {
    void db.brandAssets.where('kind').equals('logo').toArray().then(setLogoAssets);
  }, []);

  return (
    <div className="space-y-4">
      {/* ── Selected clip ── */}
      {selected ? (
        <Section title={`Clip: ${selected.label}`}>
          <SliderField
            label="Trim start"
            value={selected.inPoint}
            min={0}
            max={Math.max(0, selected.sourceDuration - 0.2)}
            step={0.1}
            format={(v) => `${v.toFixed(1)}s`}
            onChange={(v) => store.trimClip(selected.id, v, selected.outPoint)}
          />
          <SliderField
            label="Trim end"
            value={selected.outPoint}
            min={0.2}
            max={selected.sourceDuration}
            step={0.1}
            format={(v) => `${v.toFixed(1)}s`}
            onChange={(v) => store.trimClip(selected.id, selected.inPoint, v)}
          />
          <p className="font-mono text-xs text-ink-500">
            plays {clipDuration(selected).toFixed(1)}s of {selected.sourceDuration.toFixed(1)}s
          </p>
          <Toggle
            checked={selected.transitionAfter === 'crossfade'}
            onChange={(v) => store.setTransition(selected.id, v ? 'crossfade' : 'none')}
            label="Crossfade into next clip"
          />
          <div className="flex gap-2">
            <button type="button" className="btn btn-secondary flex-1" onClick={() => store.moveClip(selected.id, -1)}>
              ← Move
            </button>
            <button type="button" className="btn btn-secondary flex-1" onClick={() => store.moveClip(selected.id, 1)}>
              Move →
            </button>
            <button type="button" className="btn btn-danger" onClick={() => store.removeClip(selected.id)}>
              Remove
            </button>
          </div>
        </Section>
      ) : (
        <div className="card p-4 text-xs text-ink-500">Select a clip on the timeline to trim it.</div>
      )}

      {/* ── Text overlays ── */}
      <Section title="Text">
        {project.overlays.map((o) => (
          <div key={o.id} className="space-y-2 rounded-xl border border-ink-700 p-3">
            <input
              className="input"
              value={o.text}
              onChange={(e) => store.upsertOverlay({ ...o, text: e.target.value })}
              placeholder="Overlay text"
            />
            <div className="grid grid-cols-2 gap-2">
              <Field label="From">
                <input
                  type="number" className="input" min={0} step={0.1} value={o.start}
                  onChange={(e) => store.upsertOverlay({ ...o, start: Number(e.target.value) })}
                />
              </Field>
              <Field label="To">
                <input
                  type="number" className="input" min={0} step={0.1} value={o.end}
                  onChange={(e) => store.upsertOverlay({ ...o, end: Number(e.target.value) })}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select
                className="input"
                value={o.position}
                onChange={(e) => store.upsertOverlay({ ...o, position: e.target.value as OverlayPosition })}
              >
                {POSITIONS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
              <select
                className="input"
                value={o.size}
                onChange={(e) => store.upsertOverlay({ ...o, size: e.target.value as 'sm' | 'md' | 'lg' })}
              >
                <option value="sm">Small</option>
                <option value="md">Medium</option>
                <option value="lg">Large</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={o.color}
                onChange={(e) => store.upsertOverlay({ ...o, color: e.target.value })}
                className="h-8 w-10 cursor-pointer rounded border border-ink-700 bg-transparent"
                title="Text color"
              />
              <button
                type="button"
                className={`chip border ${o.backing ? 'border-brand-500 text-brand-300' : 'border-ink-700 text-ink-400'}`}
                onClick={() => store.upsertOverlay({ ...o, backing: !o.backing })}
              >
                backing bar
              </button>
              <button type="button" className="btn-ghost ml-auto !px-2 !py-1 text-xs" onClick={() => store.removeOverlay(o.id)}>
                ✕
              </button>
            </div>
          </div>
        ))}
        <button type="button" className="btn btn-secondary w-full" onClick={() => store.newOverlay(playhead)}>
          + Add text at playhead
        </button>
      </Section>

      {/* ── Logo watermark ── */}
      <Section title="Logo watermark">
        <Toggle
          checked={project.logo.enabled}
          onChange={(v) => store.setLogo({ enabled: v })}
          label="Show brand logo"
        />
        {project.logo.enabled && (
          <>
            {logoAssets.length ? (
              <select
                className="input"
                value={project.logo.assetId ?? ''}
                onChange={(e) => store.setLogo({ assetId: e.target.value || null })}
              >
                <option value="">Pick a logo…</option>
                {logoAssets.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-ink-500">
                No logo assets found — add one to a Brand Kit first.
              </p>
            )}
            <div className="grid grid-cols-4 gap-1.5">
              {(['tl', 'tr', 'bl', 'br'] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => store.setLogo({ corner: c })}
                  className={`chip justify-center border ${project.logo.corner === c ? 'border-brand-500 text-brand-300' : 'border-ink-700 text-ink-400'}`}
                >
                  {c.toUpperCase()}
                </button>
              ))}
            </div>
            <SliderField
              label="Size" value={project.logo.scale} min={0.05} max={0.35} step={0.01}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(v) => store.setLogo({ scale: v })}
            />
            <SliderField
              label="Opacity" value={project.logo.opacity} min={0.1} max={1} step={0.05}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(v) => store.setLogo({ opacity: v })}
            />
          </>
        )}
      </Section>

      {/* ── Music ── */}
      <Section title="Music">
        {project.music ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-xs text-ink-300">♫ {project.music.name}</span>
              <button type="button" className="btn-ghost !px-2 !py-1 text-xs" onClick={() => store.setMusic(null, null)}>
                ✕
              </button>
            </div>
            {!store.musicBlob && (
              <p className="rounded-lg border border-amber-800/60 bg-amber-950/40 p-2 text-xs text-amber-300">
                Pick the file again after a reload — audio files aren&apos;t kept between sessions.
              </p>
            )}
            <SliderField
              label="Volume" value={project.music.volume} min={0} max={1.5} step={0.05}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(v) => store.setMusic({ ...project.music!, volume: v }, store.musicBlob)}
            />
            <SliderField
              label="Fade in" value={project.music.fadeInSeconds} min={0} max={5} step={0.5}
              format={(v) => `${v.toFixed(1)}s`}
              onChange={(v) => store.setMusic({ ...project.music!, fadeInSeconds: v }, store.musicBlob)}
            />
            <SliderField
              label="Fade out" value={project.music.fadeOutSeconds} min={0} max={5} step={0.5}
              format={(v) => `${v.toFixed(1)}s`}
              onChange={(v) => store.setMusic({ ...project.music!, fadeOutSeconds: v }, store.musicBlob)}
            />
          </>
        ) : (
          <label className="btn btn-secondary block w-full cursor-pointer text-center">
            Choose an audio file…
            <input
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  store.setMusic(
                    { name: file.name, volume: 0.9, fadeInSeconds: 1, fadeOutSeconds: 1.5 },
                    file
                  );
                }
              }}
            />
          </label>
        )}
      </Section>

      {/* ── Look & output ── */}
      <Section title="Look & output">
        <Field label="Color filter">
          <select
            className="input"
            value={project.filter}
            onChange={(e) => store.setOutput({ filter: e.target.value as FilterKind })}
          >
            {FILTERS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </Field>
        <SliderField
          label="Crossfade length" value={project.crossfadeSeconds} min={0.2} max={2} step={0.1}
          format={(v) => `${v.toFixed(1)}s`}
          onChange={(v) => store.setOutput({ crossfadeSeconds: v })}
        />
        <Field label="Frame size">
          <select
            className="input"
            value={`${project.width}x${project.height}`}
            onChange={(e) => {
              const size = SIZES.find((s) => `${s.width}x${s.height}` === e.target.value);
              if (size) store.setOutput({ width: size.width, height: size.height });
            }}
          >
            {SIZES.map((s) => (
              <option key={s.label} value={`${s.width}x${s.height}`}>{s.label}</option>
            ))}
          </select>
        </Field>
        <SliderField
          label="Frame rate" value={project.fps} min={24} max={30} step={6}
          format={(v) => `${v} fps`}
          onChange={(v) => store.setOutput({ fps: v })}
        />
        <p className="font-mono text-xs text-ink-500">
          Total: {projectDuration(project).toFixed(1)}s
        </p>
      </Section>
    </div>
  );
}
