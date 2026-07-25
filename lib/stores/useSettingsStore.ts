'use client';

// Generation defaults + app preferences, persisted to localStorage.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_NEGATIVE_PROMPT } from '../comfy/buildWorkflow';

interface SettingsState {
  defaultWidth: number;
  defaultHeight: number;
  defaultDurationSeconds: number;
  defaultFps: number;
  defaultSteps: number;
  defaultCfg: number;
  defaultNegativePrompt: string;
  autoDownloadToGallery: boolean;
  showSessionTimer: boolean;
  update(patch: Partial<Omit<SettingsState, 'update' | 'reset'>>): void;
  reset(): void;
}

const DEFAULTS = {
  defaultWidth: 768,
  defaultHeight: 512,
  defaultDurationSeconds: 4,
  defaultFps: 24,
  defaultSteps: 25,
  defaultCfg: 3,
  defaultNegativePrompt: DEFAULT_NEGATIVE_PROMPT,
  autoDownloadToGallery: true,
  showSessionTimer: true,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      update(patch) {
        set(patch);
      },
      reset() {
        set(DEFAULTS);
      },
    }),
    { name: 'frameforge-settings' }
  )
);
