'use client';

import { Field, PageHeader, SliderField, Toggle } from '@/components/ui';
import { LIMITS } from '@/lib/comfy/buildWorkflow';
import { useSettingsStore } from '@/lib/stores/useSettingsStore';

export default function SettingsPage() {
  const s = useSettingsStore();

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Settings"
        subtitle="Defaults applied to new generations. Everything is stored locally in your browser."
      />

      <div className="card space-y-5 p-6">
        <div className="grid grid-cols-2 gap-4">
          <SliderField
            label="Default width"
            value={s.defaultWidth}
            min={LIMITS.size.min}
            max={LIMITS.size.max}
            step={32}
            format={(v) => `${v}px`}
            onChange={(v) => s.update({ defaultWidth: v })}
          />
          <SliderField
            label="Default height"
            value={s.defaultHeight}
            min={LIMITS.size.min}
            max={LIMITS.size.max}
            step={32}
            format={(v) => `${v}px`}
            onChange={(v) => s.update({ defaultHeight: v })}
          />
          <SliderField
            label="Duration"
            value={s.defaultDurationSeconds}
            min={LIMITS.durationSeconds.min}
            max={LIMITS.durationSeconds.max}
            format={(v) => `${v}s`}
            onChange={(v) => s.update({ defaultDurationSeconds: v })}
          />
          <SliderField
            label="Frame rate"
            value={s.defaultFps}
            min={LIMITS.fps.min}
            max={LIMITS.fps.max}
            format={(v) => `${v} fps`}
            onChange={(v) => s.update({ defaultFps: v })}
          />
          <SliderField
            label="Sampling steps"
            value={s.defaultSteps}
            min={LIMITS.steps.min}
            max={LIMITS.steps.max}
            onChange={(v) => s.update({ defaultSteps: v })}
          />
          <SliderField
            label="Guidance (CFG)"
            value={s.defaultCfg}
            min={LIMITS.cfg.min}
            max={LIMITS.cfg.max}
            step={0.5}
            onChange={(v) => s.update({ defaultCfg: v })}
          />
        </div>

        <Field label="Default negative prompt">
          <textarea
            className="input min-h-[80px] resize-y"
            value={s.defaultNegativePrompt}
            onChange={(e) => s.update({ defaultNegativePrompt: e.target.value })}
          />
        </Field>

        <div className="space-y-2">
          <Toggle
            label="Auto-save finished videos to the gallery"
            checked={s.autoDownloadToGallery}
            onChange={(v) => s.update({ autoDownloadToGallery: v })}
          />
          <Toggle
            label="Show GPU session timer"
            checked={s.showSessionTimer}
            onChange={(v) => s.update({ showSessionTimer: v })}
          />
        </div>

        <div className="flex justify-end border-t border-ink-800 pt-4">
          <button className="btn-secondary" onClick={s.reset}>
            Reset to defaults
          </button>
        </div>
      </div>
    </div>
  );
}
