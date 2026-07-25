import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NEGATIVE_PROMPT,
  buildWorkflow,
  snapDimension,
  toFrameCount,
} from '@/lib/comfy/buildWorkflow';

const base = {
  mode: 't2v' as const,
  prompt: 'a cinematic farm at golden hour',
  width: 768,
  height: 512,
  durationSeconds: 4,
  fps: 24,
  steps: 25,
  cfg: 3,
  seed: 42,
};

describe('toFrameCount', () => {
  it('always returns 8n+1 frame counts', () => {
    for (const [dur, fps] of [
      [1, 8],
      [4, 24],
      [10, 30],
      [5, 25],
    ] as const) {
      const frames = toFrameCount(dur, fps);
      expect((frames - 1) % 8).toBe(0);
      expect(frames).toBeGreaterThan(0);
    }
  });

  it('approximates duration * fps', () => {
    expect(toFrameCount(4, 24)).toBe(97); // 96 → 97
  });
});

describe('snapDimension', () => {
  it('snaps to multiples of 32 within limits', () => {
    expect(snapDimension(768)).toBe(768);
    expect(snapDimension(770)).toBe(768);
    expect(snapDimension(100)).toBe(256);
    expect(snapDimension(5000)).toBe(1024);
  });
});

describe('buildWorkflow t2v', () => {
  it('injects prompt, seed and geometry into the right nodes', () => {
    const wf = buildWorkflow(base);
    expect(wf.positive.inputs.text).toBe(base.prompt);
    expect(wf.negative.inputs.text).toBe(DEFAULT_NEGATIVE_PROMPT);
    expect(wf.latent.inputs.width).toBe(768);
    expect(wf.latent.inputs.height).toBe(512);
    expect(wf.latent.inputs.length).toBe(97);
    expect(wf.noise.inputs.noise_seed).toBe(42);
    expect(wf.conditioning.inputs.frame_rate).toBe(24);
    expect(wf.save.inputs.frame_rate).toBe(24);
    expect(wf.scheduler.inputs.steps).toBe(25);
    expect(wf.guider.inputs.cfg).toBe(3);
  });

  it('does not mutate the shared template between calls', () => {
    const a = buildWorkflow({ ...base, prompt: 'first' });
    const b = buildWorkflow({ ...base, prompt: 'second' });
    expect(a.positive.inputs.text).toBe('first');
    expect(b.positive.inputs.text).toBe('second');
  });

  it('clamps out-of-range values instead of failing', () => {
    const wf = buildWorkflow({ ...base, steps: 999, cfg: 99, fps: 1000, width: 9999 });
    expect(wf.scheduler.inputs.steps).toBe(50);
    expect(wf.guider.inputs.cfg).toBe(10);
    expect(wf.conditioning.inputs.frame_rate).toBe(30);
    expect(wf.latent.inputs.width).toBe(1024);
  });

  it('rejects an empty prompt', () => {
    expect(() => buildWorkflow({ ...base, prompt: '   ' })).toThrow(/prompt/i);
  });

  it('wraps negative seeds into uint32 space', () => {
    const wf = buildWorkflow({ ...base, seed: -5 });
    expect(wf.noise.inputs.noise_seed).toBe(5);
  });
});

describe('buildWorkflow i2v', () => {
  it('requires an uploaded image name', () => {
    expect(() => buildWorkflow({ ...base, mode: 'i2v' })).toThrow(/image/i);
  });

  it('wires the source image and strength', () => {
    const wf = buildWorkflow({
      ...base,
      mode: 'i2v',
      imageName: 'logo.png',
      imageStrength: 0.7,
    });
    expect(wf.source_image.inputs.image).toBe('logo.png');
    expect(wf.img_to_video.inputs.strength).toBe(0.7);
    expect(wf.img_to_video.inputs.width).toBe(768);
    expect(wf.img_to_video.inputs.length).toBe(97);
    // t2v-only node must not exist in the i2v graph
    expect(wf.latent).toBeUndefined();
  });
});
