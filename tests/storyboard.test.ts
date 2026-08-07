import { describe, expect, it } from 'vitest';
import { buildStoryboard, storyboardTitle } from '../lib/editor/storyboard';
import type { BrandKit } from '../lib/brand/types';

const kit: BrandKit = {
  id: 'k1',
  name: 'Studio Farms',
  tagline: 'Fresh from the valley',
  description: 'an organic farm collective',
  industry: 'organic farm',
  voice: 'warm',
  keywords: ['organic', 'sun-drenched'],
  colors: [{ hex: '#2f6b3a', role: 'primary' }],
  createdAt: 0,
  updatedAt: 0,
};

describe('buildStoryboard', () => {
  it('plans the requested number of scenes in narrative order', () => {
    const scenes = buildStoryboard('a mountain coffee farm', { sceneCount: 4, aspect: 'landscape' });
    expect(scenes).toHaveLength(4);
    expect(scenes[0].label).toContain('Opening');
    expect(scenes[scenes.length - 1].label).toContain('Closing');
  });

  it('clamps scene count to 2–6', () => {
    expect(buildStoryboard('x y', { sceneCount: 0, aspect: 'square' })).toHaveLength(2);
    expect(buildStoryboard('x y', { sceneCount: 99, aspect: 'square' })).toHaveLength(6);
  });

  it('every prompt contains the idea and prompts are distinct', () => {
    const scenes = buildStoryboard('a neon night market', { sceneCount: 5, aspect: 'portrait' });
    for (const s of scenes) expect(s.prompt).toContain('a neon night market');
    expect(new Set(scenes.map((s) => s.prompt)).size).toBe(scenes.length);
  });

  it('is deterministic for the same idea', () => {
    const a = buildStoryboard('lakeside cabin', { sceneCount: 3, aspect: 'landscape' });
    const b = buildStoryboard('lakeside cabin', { sceneCount: 3, aspect: 'landscape' });
    expect(a).toEqual(b);
  });

  it('folds the brand kit into every scene', () => {
    const scenes = buildStoryboard('harvest season', { sceneCount: 3, aspect: 'landscape', kit });
    for (const s of scenes) {
      expect(s.prompt).toMatch(/warm golden-hour light/);
      expect(s.prompt).toContain('organic, sun-drenched');
    }
  });

  it('rejects an empty idea', () => {
    expect(() => buildStoryboard('   ', { sceneCount: 3, aspect: 'landscape' })).toThrow();
  });
});

describe('storyboardTitle', () => {
  it('prefers the brand tagline, then the idea', () => {
    expect(storyboardTitle('whatever', kit)).toBe('Fresh from the valley');
    expect(storyboardTitle('a cozy bakery at dawn', null)).toBe('a cozy bakery at dawn');
  });

  it('truncates long ideas', () => {
    const long = 'this is a very long idea that keeps going and going far past any title length';
    const title = storyboardTitle(long, null);
    expect(title.length).toBeLessThanOrEqual(48);
    expect(title.endsWith('…')).toBe(true);
  });
});
