'use client';

// Prompt → Video plan tracking. The plan (idea + scene prompts) persists to
// localStorage; job ids are session-only (the queue itself is in-memory), so
// finished scenes are also recognized by matching gallery items on the exact
// scene prompt — that association survives reloads.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { StoryAspect } from '../editor/storyboard';

export interface PlanScene {
  sceneId: string;
  label: string;
  prompt: string;
  /** Session-only queue job id (dangles harmlessly after a reload). */
  jobId?: string;
}

export interface CreatePlan {
  idea: string;
  title: string;
  aspect: StoryAspect;
  width: number;
  height: number;
  sceneSeconds: number;
  fps: number;
  brandKitId?: string;
  brandKitName?: string;
  createdAt: number;
  scenes: PlanScene[];
}

interface CreateState {
  plan: CreatePlan | null;
  start(plan: CreatePlan): void;
  setSceneJob(sceneId: string, jobId: string): void;
  clear(): void;
}

export const useCreateStore = create<CreateState>()(
  persist(
    (set) => ({
      plan: null,
      start(plan) {
        set({ plan });
      },
      setSceneJob(sceneId, jobId) {
        set((s) =>
          s.plan
            ? {
                plan: {
                  ...s.plan,
                  scenes: s.plan.scenes.map((sc) =>
                    sc.sceneId === sceneId ? { ...sc, jobId } : sc
                  ),
                },
              }
            : s
        );
      },
      clear() {
        set({ plan: null });
      },
    }),
    { name: 'frameforge-create' }
  )
);
