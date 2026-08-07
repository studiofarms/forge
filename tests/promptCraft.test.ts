import { describe, expect, it } from 'vitest';
import { CAMERA_MOVES, STYLE_PRESETS, craftPrompt, variationSeeds } from '../lib/comfy/promptCraft';

describe('craftPrompt', () => {
  it('returns the trimmed base when nothing else is selected', () => {
    expect(craftPrompt({ base: '  a red barn   at dusk ' })).toBe('a red barn at dusk');
  });

  it('appends camera and style phrases', () => {
    const out = craftPrompt({ base: 'a red barn', cameraId: 'orbit', styleId: 'noir' });
    expect(out).toContain('gentle orbit around the subject');
    expect(out).toContain('film noir');
    expect(out.startsWith('a red barn')).toBe(true);
  });

  it('enhance adds quality terms without duplicating existing ones', () => {
    const out = craftPrompt({ base: 'a red barn, sharp focus', enhance: true });
    expect(out.match(/sharp focus/gi)).toHaveLength(1);
    expect(out).toContain('professional cinematography');
  });

  it('never duplicates a phrase already present in the base', () => {
    const phrase = CAMERA_MOVES[0].phrase;
    const out = craftPrompt({ base: `A shot with ${phrase}`, cameraId: CAMERA_MOVES[0].id });
    expect(out.toLowerCase().split(phrase.toLowerCase()).length - 1).toBe(1);
  });

  it('is stable when re-run on its own output', () => {
    const once = craftPrompt({ base: 'a red barn', cameraId: 'dolly-in', styleId: 'cinematic', enhance: true });
    const twice = craftPrompt({ base: once, cameraId: 'dolly-in', styleId: 'cinematic', enhance: true });
    expect(twice).toBe(once);
  });

  it('unknown ids are ignored and empty base yields empty string', () => {
    expect(craftPrompt({ base: 'x', cameraId: 'nope', styleId: 'nah' })).toBe('x');
    expect(craftPrompt({ base: '   ' })).toBe('');
  });

  it('every preset has a distinct id and phrase', () => {
    const all = [...CAMERA_MOVES, ...STYLE_PRESETS];
    expect(new Set(all.map((c) => c.id)).size).toBe(all.length);
    expect(new Set(all.map((c) => c.phrase)).size).toBe(all.length);
  });
});

describe('variationSeeds', () => {
  it('produces the requested count of distinct stable seeds, first = base', () => {
    const seeds = variationSeeds(1234, 4);
    expect(seeds).toHaveLength(4);
    expect(seeds[0]).toBe(1234);
    expect(new Set(seeds).size).toBe(4);
    expect(variationSeeds(1234, 4)).toEqual(seeds);
  });

  it('clamps count to 1..8', () => {
    expect(variationSeeds(1, 0)).toHaveLength(1);
    expect(variationSeeds(1, 99)).toHaveLength(8);
  });
});
