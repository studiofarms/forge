// buildWorkflow: the single place where workflow JSON templates are
// parameterized. Templates are imported as JSON, deep-cloned, and mutated via
// typed node access — never string-replaced.

import t2vTemplate from './workflows/ltx_t2v.json';
import i2vTemplate from './workflows/ltx_i2v.json';
import type { ComfyWorkflow } from './types';

export type GenerationMode = 't2v' | 'i2v';

export interface WorkflowParams {
  mode: GenerationMode;
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  /** Duration in seconds; converted to LTX's 8n+1 frame count. */
  durationSeconds: number;
  fps: number;
  steps: number;
  cfg: number;
  seed: number;
  /** Required for i2v: server-side filename returned by uploadImage. */
  imageName?: string;
  /** i2v only: how strongly the source image drives the video (0..1). */
  imageStrength?: number;
}

export const DEFAULT_NEGATIVE_PROMPT =
  'low quality, worst quality, deformed, distorted, watermark, text overlay, jittery, flickering';

export const LIMITS = {
  size: { min: 256, max: 1024, step: 32 },
  durationSeconds: { min: 1, max: 10 },
  fps: { min: 8, max: 30 },
  steps: { min: 10, max: 50 },
  cfg: { min: 1, max: 10 },
} as const;

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** Snap a dimension to the nearest multiple of 32 within limits. */
export function snapDimension(v: number): number {
  const snapped = Math.round(v / 32) * 32;
  return clamp(snapped, LIMITS.size.min, LIMITS.size.max);
}

/** LTX-Video requires frame counts of the form 8n+1 (9, 17, ... 97, ...). */
export function toFrameCount(durationSeconds: number, fps: number): number {
  const target = clamp(durationSeconds, LIMITS.durationSeconds.min, LIMITS.durationSeconds.max) *
    clamp(fps, LIMITS.fps.min, LIMITS.fps.max);
  const n = Math.max(1, Math.round((target - 1) / 8));
  return n * 8 + 1;
}

export function buildWorkflow(params: WorkflowParams): ComfyWorkflow {
  if (!params.prompt || !params.prompt.trim()) {
    throw new Error('Prompt must not be empty');
  }
  if (params.mode === 'i2v' && !params.imageName) {
    throw new Error('Image-to-video requires an uploaded image name');
  }

  const template = params.mode === 'i2v' ? i2vTemplate : t2vTemplate;
  const wf = JSON.parse(JSON.stringify(template)) as ComfyWorkflow;

  const width = snapDimension(params.width);
  const height = snapDimension(params.height);
  const fps = clamp(Math.round(params.fps), LIMITS.fps.min, LIMITS.fps.max);
  const frames = toFrameCount(params.durationSeconds, fps);
  const steps = clamp(Math.round(params.steps), LIMITS.steps.min, LIMITS.steps.max);
  const cfg = clamp(params.cfg, LIMITS.cfg.min, LIMITS.cfg.max);
  const seed = Number.isFinite(params.seed)
    ? Math.abs(Math.floor(params.seed)) % 2 ** 32
    : 0;

  wf.positive.inputs.text = params.prompt.trim();
  wf.negative.inputs.text = (params.negativePrompt ?? DEFAULT_NEGATIVE_PROMPT).trim();
  wf.conditioning.inputs.frame_rate = fps;
  wf.scheduler.inputs.steps = steps;
  wf.guider.inputs.cfg = cfg;
  wf.noise.inputs.noise_seed = seed;
  wf.save.inputs.frame_rate = fps;

  if (params.mode === 'i2v') {
    wf.source_image.inputs.image = params.imageName!;
    wf.img_to_video.inputs.width = width;
    wf.img_to_video.inputs.height = height;
    wf.img_to_video.inputs.length = frames;
    wf.img_to_video.inputs.strength = clamp(params.imageStrength ?? 0.9, 0.1, 1);
  } else {
    wf.latent.inputs.width = width;
    wf.latent.inputs.height = height;
    wf.latent.inputs.length = frames;
  }

  return wf;
}
