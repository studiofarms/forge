'use client';

// Job queue store + runner. Jobs are created as drafts, then the runner
// submits them one at a time to ComfyUI, follows websocket progress, and on
// success downloads the video into the IndexedDB gallery.

import { create } from 'zustand';
import { buildWorkflow, type GenerationMode } from '../comfy/buildWorkflow';
import type { ComfySocketHandle } from '../comfy/client';
import { isTerminal, transition, type JobEvent, type JobState } from '../jobs/stateMachine';
import { db, newId, saveGalleryVideo } from '../db';
import { useConnectionStore } from './useConnectionStore';
import { useGalleryStore } from './useGalleryStore';

export interface Job {
  id: string;
  createdAt: number;
  state: JobState;
  prompt: string;
  negativePrompt: string;
  mode: GenerationMode;
  width: number;
  height: number;
  durationSeconds: number;
  fps: number;
  steps: number;
  cfg: number;
  seed: number;
  imageName?: string; // server-side name for i2v (set after upload)
  /** Brand asset to upload lazily at submit time for i2v jobs. */
  assetId?: string;
  imageStrength?: number;
  brandKitId?: string;
  brandKitName?: string;
  campaignLabel?: string;
  promptId?: string;
  progress: number; // 0..1 while running
  error?: string;
  galleryItemId?: string;
}

export type NewJobInput = Omit<
  Job,
  'id' | 'createdAt' | 'state' | 'progress' | 'promptId' | 'error' | 'galleryItemId'
>;

interface JobStoreState {
  jobs: Job[];
  runnerActive: boolean;
  enqueue(input: NewJobInput): string;
  enqueueMany(inputs: NewJobInput[]): string[];
  cancel(id: string): void;
  clearFinished(): void;
  retry(id: string): void;
  /** Kick the runner (idempotent). Called after enqueue and on reconnect. */
  pump(): void;
}

function applyEvent(jobs: Job[], id: string, event: JobEvent, patch?: Partial<Job>): Job[] {
  return jobs.map((j) => {
    if (j.id !== id) return j;
    let next: JobState | null = null;
    try {
      next = transition(j.state, event);
    } catch {
      next = null;
    }
    return next ? { ...j, ...patch, state: next } : { ...j, ...patch };
  });
}

export const useJobStore = create<JobStoreState>((set, get) => {
  let socket: ComfySocketHandle | null = null;

  function updateJob(id: string, event: JobEvent, patch?: Partial<Job>) {
    set((s) => ({ jobs: applyEvent(s.jobs, id, event, patch) }));
  }

  async function runJob(job: Job): Promise<void> {
    const client = useConnectionStore.getState().getClient();
    if (!client) return; // stay in draft; the loop pauses until reconnect

    // i2v jobs reference a brand asset; upload it now that we have a backend.
    let imageName = job.imageName;
    if (job.mode === 'i2v' && !imageName && job.assetId) {
      try {
        const row = await db.brandAssetBlobs.get(job.assetId);
        if (!row) throw new Error('Brand asset no longer exists.');
        const uploaded = await client.uploadImage(row.blob, `ff-${job.assetId}.png`);
        imageName = uploaded.subfolder
          ? `${uploaded.subfolder}/${uploaded.name}`
          : uploaded.name;
        updateJob(job.id, { type: 'PROGRESS', value: 0, max: 1 }, { imageName });
      } catch (err) {
        updateJob(job.id, { type: 'SUBMIT_FAIL', error: 'upload failed' }, {
          error: `Could not upload brand image: ${(err as Error).message}`,
        });
        return;
      }
    }

    let workflow;
    try {
      workflow = buildWorkflow({
        mode: job.mode,
        prompt: job.prompt,
        negativePrompt: job.negativePrompt,
        width: job.width,
        height: job.height,
        durationSeconds: job.durationSeconds,
        fps: job.fps,
        steps: job.steps,
        cfg: job.cfg,
        seed: job.seed,
        imageName,
        imageStrength: job.imageStrength,
      });
    } catch (err) {
      updateJob(job.id, { type: 'SUBMIT_FAIL', error: 'bad params' }, {
        error: (err as Error).message,
      });
      return;
    }

    let promptId: string;
    try {
      const res = await client.submit(workflow);
      promptId = res.promptId;
    } catch (err) {
      updateJob(job.id, { type: 'SUBMIT_FAIL', error: 'submit failed' }, {
        error: (err as Error).message,
      });
      return;
    }
    updateJob(job.id, { type: 'SUBMIT_OK', promptId }, { promptId });

    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        socket?.close();
        socket = null;
        resolve();
      };

      const timeout = setTimeout(() => {
        updateJob(job.id, { type: 'EXECUTION_ERROR', error: 'timeout' }, {
          error: 'Generation timed out after 20 minutes.',
        });
        finish();
      }, 20 * 60 * 1000);

      socket = client.openSocket(
        async (ev) => {
          const current = get().jobs.find((j) => j.id === job.id);
          if (!current || isTerminal(current.state)) {
            clearTimeout(timeout);
            finish();
            return;
          }
          switch (ev.kind) {
            case 'execution_start':
              if (ev.promptId === promptId) updateJob(job.id, { type: 'EXECUTION_START' });
              break;
            case 'progress':
              if (ev.promptId === null || ev.promptId === promptId) {
                updateJob(
                  job.id,
                  { type: 'PROGRESS', value: ev.value, max: ev.max },
                  { progress: ev.max > 0 ? ev.value / ev.max : 0 }
                );
              }
              break;
            case 'execution_error':
              if (ev.promptId === promptId) {
                clearTimeout(timeout);
                updateJob(job.id, { type: 'EXECUTION_ERROR', error: ev.message }, {
                  error: ev.message,
                });
                finish();
              }
              break;
            case 'execution_interrupted':
              if (ev.promptId === promptId) {
                clearTimeout(timeout);
                updateJob(job.id, { type: 'INTERRUPTED' });
                finish();
              }
              break;
            case 'execution_success':
            case 'executed': {
              if ('promptId' in ev && ev.promptId === promptId) {
                clearTimeout(timeout);
                updateJob(job.id, { type: 'EXECUTION_SUCCESS' }, { progress: 1 });
                await downloadResult(job, promptId);
                finish();
              }
              break;
            }
            default:
              break;
          }
        },
        (clean) => {
          clearTimeout(timeout);
          if (!clean) {
            const current = get().jobs.find((j) => j.id === job.id);
            if (current && !isTerminal(current.state) && current.state !== 'downloading') {
              updateJob(job.id, { type: 'EXECUTION_ERROR', error: 'socket closed' }, {
                error: 'Connection to the backend dropped mid-generation.',
              });
            }
          }
          finish();
        }
      );
    });
  }

  async function downloadResult(job: Job, promptId: string): Promise<void> {
    const client = useConnectionStore.getState().getClient();
    if (!client) {
      updateJob(job.id, { type: 'DOWNLOAD_FAIL', error: 'disconnected' }, {
        error: 'Disconnected before the video could be downloaded.',
      });
      return;
    }
    try {
      // History can lag a beat behind execution_success.
      let refs = await client.historyOutputs(promptId);
      for (let attempt = 0; refs.length === 0 && attempt < 5; attempt++) {
        await new Promise((r) => setTimeout(r, 1500));
        refs = await client.historyOutputs(promptId);
      }
      const video =
        refs.find((r) => /\.(mp4|webm|mov)$/i.test(r.filename)) ??
        refs.find((r) => /\.(webp|gif)$/i.test(r.filename)) ??
        refs[0];
      if (!video) throw new Error('No output file found in history.');
      const blob = await client.downloadOutput(video);
      const mime =
        blob.type ||
        (/\.mp4$/i.test(video.filename) ? 'video/mp4' : 'application/octet-stream');
      const item = await saveGalleryVideo(
        {
          prompt: job.prompt,
          negativePrompt: job.negativePrompt,
          mode: job.mode,
          width: job.width,
          height: job.height,
          durationSeconds: job.durationSeconds,
          fps: job.fps,
          seed: job.seed,
          brandKitId: job.brandKitId,
          brandKitName: job.brandKitName,
          campaignLabel: job.campaignLabel,
          mime,
        },
        blob
      );
      updateJob(job.id, { type: 'DOWNLOAD_OK' }, { galleryItemId: item.id });
      void useGalleryStore.getState().refresh();
    } catch (err) {
      updateJob(job.id, { type: 'DOWNLOAD_FAIL', error: 'download failed' }, {
        error: (err as Error).message,
      });
    }
  }

  async function runLoop() {
    set({ runnerActive: true });
    try {
      for (;;) {
        const nextDraft = get().jobs.find((j) => j.state === 'draft');
        if (!nextDraft) break;
        // Offline: park drafts instead of failing them; reconnect pumps again.
        if (!useConnectionStore.getState().getClient()) break;
        await runJob(nextDraft);
      }
    } finally {
      set({ runnerActive: false });
    }
  }

  return {
    jobs: [],
    runnerActive: false,

    enqueue(input) {
      const id = newId();
      const job: Job = {
        ...input,
        id,
        createdAt: Date.now(),
        state: 'draft',
        progress: 0,
      };
      set((s) => ({ jobs: [...s.jobs, job] }));
      get().pump();
      return id;
    },

    enqueueMany(inputs) {
      const ids = inputs.map((input) => {
        const id = newId();
        const job: Job = {
          ...input,
          id,
          createdAt: Date.now(),
          state: 'draft',
          progress: 0,
        };
        set((s) => ({ jobs: [...s.jobs, job] }));
        return id;
      });
      get().pump();
      return ids;
    },

    cancel(id) {
      const job = get().jobs.find((j) => j.id === id);
      if (!job || isTerminal(job.state)) return;
      const client = useConnectionStore.getState().getClient();
      if (client && job.promptId) {
        if (job.state === 'running') void client.interrupt();
        else void client.cancelQueued(job.promptId);
      }
      updateJob(id, { type: 'CANCEL' });
    },

    clearFinished() {
      set((s) => ({ jobs: s.jobs.filter((j) => !isTerminal(j.state)) }));
    },

    retry(id) {
      const job = get().jobs.find((j) => j.id === id);
      if (!job || !isTerminal(job.state)) return;
      set((s) => ({
        jobs: s.jobs.map((j) =>
          j.id === id
            ? { ...j, state: 'draft', progress: 0, error: undefined, promptId: undefined }
            : j
        ),
      }));
      get().pump();
    },

    pump() {
      if (!get().runnerActive) void runLoop();
    },
  };
});
