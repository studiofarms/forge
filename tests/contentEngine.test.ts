import { describe, expect, it } from 'vitest';
import {
  CAMPAIGN_TEMPLATES,
  generateContentPack,
  hashString,
} from '@/lib/brand/contentEngine';
import type { BrandKit } from '@/lib/brand/types';

const kit: BrandKit = {
  id: 'kit-1',
  name: 'Studio Farms',
  tagline: 'Fresh from the valley',
  description: 'Small-batch organic vegetables and flowers grown in the Hudson Valley',
  industry: 'organic farm',
  voice: 'warm',
  keywords: ['organic', 'sun-drenched'],
  colors: [
    { hex: '#2f6b3a', role: 'primary' },
    { hex: '#e8c447', role: 'accent' },
  ],
  createdAt: 0,
  updatedAt: 0,
};

const baseOptions = {
  templateIds: ['logo-sting', 'social-teaser'],
  variantsPerTemplate: 3,
  durationSeconds: 4,
  fps: 24,
  steps: 25,
  cfg: 3,
  baseSeed: 12345,
  availableAssetKinds: [] as const,
};

describe('generateContentPack', () => {
  it('produces variants × templates items', () => {
    const plan = generateContentPack(kit, { ...baseOptions, availableAssetKinds: [] });
    expect(plan).toHaveLength(6);
  });

  it('is deterministic for the same base seed and unique per item', () => {
    const a = generateContentPack(kit, { ...baseOptions, availableAssetKinds: [] });
    const b = generateContentPack(kit, { ...baseOptions, availableAssetKinds: [] });
    expect(a.map((i) => i.seed)).toEqual(b.map((i) => i.seed));
    expect(new Set(a.map((i) => i.seed)).size).toBe(a.length);
  });

  it('folds brand identity into every prompt', () => {
    const plan = generateContentPack(kit, { ...baseOptions, availableAssetKinds: [] });
    for (const item of plan) {
      expect(item.prompt).toContain('Studio Farms');
      expect(item.prompt.length).toBeGreaterThan(80);
    }
    // Warm voice fragment and palette description should appear somewhere.
    expect(plan.some((i) => /golden-hour|warm/i.test(i.prompt))).toBe(true);
    expect(plan.some((i) => i.prompt.includes('#2f6b3a'))).toBe(true);
  });

  it('varies prompts across variants of the same template', () => {
    const plan = generateContentPack(kit, { ...baseOptions, templateIds: ['social-teaser'] });
    const prompts = new Set(plan.map((i) => i.prompt));
    expect(prompts.size).toBe(plan.length);
  });

  it('uses i2v only when the kit has the needed asset kind', () => {
    const without = generateContentPack(kit, {
      ...baseOptions,
      templateIds: ['logo-sting'],
      availableAssetKinds: [],
    });
    expect(without.every((i) => i.mode === 't2v')).toBe(true);

    const withLogo = generateContentPack(kit, {
      ...baseOptions,
      templateIds: ['logo-sting'],
      availableAssetKinds: ['logo'],
    });
    expect(withLogo.every((i) => i.mode === 'i2v' && i.assetKind === 'logo')).toBe(true);
  });

  it('respects aspect ratios per template', () => {
    const plan = generateContentPack(kit, {
      ...baseOptions,
      templateIds: ['social-teaser'],
      variantsPerTemplate: 1,
    });
    expect(plan[0].height).toBeGreaterThan(plan[0].width); // portrait
  });

  it('ignores unknown template ids', () => {
    const plan = generateContentPack(kit, { ...baseOptions, templateIds: ['nope'] });
    expect(plan).toHaveLength(0);
  });
});

describe('campaign templates', () => {
  it('every template builds a non-empty prompt without throwing', () => {
    for (const t of CAMPAIGN_TEMPLATES) {
      for (let v = 0; v < 6; v++) {
        expect(t.buildPrompt(kit, v).trim().length).toBeGreaterThan(40);
      }
    }
  });
});

describe('hashString', () => {
  it('is stable and uint32', () => {
    expect(hashString('abc')).toBe(hashString('abc'));
    expect(hashString('abc')).not.toBe(hashString('abd'));
    expect(hashString('x')).toBeGreaterThanOrEqual(0);
    expect(hashString('x')).toBeLessThan(2 ** 32);
  });
});
