// The brand content engine: turns a BrandKit into a batch of ready-to-render
// generation plans ("content packs"). Pure and deterministic given a seed, so
// it is fully unit-testable.

import { DEFAULT_NEGATIVE_PROMPT, type GenerationMode } from '../comfy/buildWorkflow';
import {
  VOICE_STYLE,
  colorDescription,
  type AssetKind,
  type BrandKit,
} from './types';

export interface CampaignTemplate {
  id: string;
  label: string;
  emoji: string;
  description: string;
  /** Which uploaded asset kind this template animates, if any (→ i2v). */
  assetKind?: AssetKind;
  aspect: 'landscape' | 'portrait' | 'square';
  buildPrompt(kit: BrandKit, variantIndex: number): string;
}

export interface GenerationPlanItem {
  id: string;
  templateId: string;
  label: string;
  mode: GenerationMode;
  assetKind?: AssetKind;
  prompt: string;
  negativePrompt: string;
  width: number;
  height: number;
  durationSeconds: number;
  fps: number;
  steps: number;
  cfg: number;
  seed: number;
}

const SCENE_VARIANTS = [
  'slow dolly-in shot',
  'sweeping aerial establishing shot',
  'close-up macro detail shot',
  'smooth lateral tracking shot',
  'gentle orbit around the subject',
  'rack-focus reveal shot',
];

const TIME_VARIANTS = [
  'at golden hour',
  'in soft morning light',
  'under dramatic evening light',
  'in bright airy daylight',
  'at blue hour with city glow',
];

function kw(kit: BrandKit, fallback: string): string {
  return kit.keywords.length ? kit.keywords.join(', ') : fallback;
}

function subject(kit: BrandKit): string {
  return kit.description?.trim() ||
    `${kit.name} — a ${kit.industry || 'modern'} brand`;
}

export const CAMPAIGN_TEMPLATES: CampaignTemplate[] = [
  {
    id: 'logo-sting',
    label: 'Logo sting',
    emoji: '✨',
    description: 'Animated logo reveal for intros and outros.',
    assetKind: 'logo',
    aspect: 'landscape',
    buildPrompt: (kit, i) =>
      `Cinematic logo animation for ${kit.name}: the logo emerges with elegant particle effects and light rays, ${VOICE_STYLE[kit.voice]}, ${colorDescription(kit.colors)}, ${SCENE_VARIANTS[i % SCENE_VARIANTS.length]}, clean background, professional motion graphics`,
  },
  {
    id: 'product-spotlight',
    label: 'Product spotlight',
    emoji: '🎯',
    description: 'Hero product shots brought to life for ads and PDPs.',
    assetKind: 'product',
    aspect: 'square',
    buildPrompt: (kit, i) =>
      `Premium product showcase video for ${kit.name}: ${SCENE_VARIANTS[i % SCENE_VARIANTS.length]} of the product on a styled set, ${VOICE_STYLE[kit.voice]}, ${colorDescription(kit.colors)}, studio quality, commercial advertising, ${kw(kit, 'premium product')}`,
  },
  {
    id: 'social-teaser',
    label: 'Social teaser',
    emoji: '📱',
    description: 'Vertical scroll-stopping clips for Reels / TikTok / Shorts.',
    aspect: 'portrait',
    buildPrompt: (kit, i) =>
      `Eye-catching vertical social media video for ${kit.name} (${kit.tagline || subject(kit)}): ${subject(kit)}, ${SCENE_VARIANTS[(i + 1) % SCENE_VARIANTS.length]} ${TIME_VARIANTS[i % TIME_VARIANTS.length]}, ${VOICE_STYLE[kit.voice]}, ${colorDescription(kit.colors)}, trending short-form aesthetic`,
  },
  {
    id: 'lifestyle-mood',
    label: 'Lifestyle mood film',
    emoji: '🌅',
    description: 'Atmospheric brand-world footage for sites and headers.',
    assetKind: 'lifestyle',
    aspect: 'landscape',
    buildPrompt: (kit, i) =>
      `Atmospheric lifestyle brand film for ${kit.name}: ${subject(kit)}, evocative scene ${TIME_VARIANTS[i % TIME_VARIANTS.length]}, ${SCENE_VARIANTS[(i + 2) % SCENE_VARIANTS.length]}, ${VOICE_STYLE[kit.voice]}, ${colorDescription(kit.colors)}, cinematic film grain, emotional storytelling`,
  },
  {
    id: 'announcement',
    label: 'Announcement backdrop',
    emoji: '📣',
    description: 'Looping backgrounds for launch posts and promos.',
    aspect: 'landscape',
    buildPrompt: (kit, i) =>
      `Abstract animated background for a ${kit.name} announcement: flowing shapes and gradients in the ${colorDescription(kit.colors)}, ${VOICE_STYLE[kit.voice]}, seamless loop feel, ${SCENE_VARIANTS[(i + 3) % SCENE_VARIANTS.length]}, space reserved for overlay text, ${kw(kit, 'modern design')}`,
  },
  {
    id: 'behind-scenes',
    label: 'Behind the scenes',
    emoji: '🎬',
    description: 'Authentic craft/process footage in the brand voice.',
    aspect: 'landscape',
    buildPrompt: (kit, i) =>
      `Documentary behind-the-scenes video for ${kit.name}, a ${kit.industry || 'creative'} brand: hands at work, authentic craft process, ${TIME_VARIANTS[(i + 2) % TIME_VARIANTS.length]}, ${VOICE_STYLE[kit.voice]}, natural textures, ${kw(kit, 'craftsmanship, detail')}`,
  },
  {
    id: 'seasonal-promo',
    label: 'Seasonal promo',
    emoji: '🎁',
    description: 'Holiday / seasonal campaign scenes on brand.',
    aspect: 'square',
    buildPrompt: (kit, i) =>
      `Festive seasonal promotional video for ${kit.name}: ${subject(kit)} styled for a seasonal campaign, celebratory atmosphere, ${SCENE_VARIANTS[(i + 4) % SCENE_VARIANTS.length]}, ${VOICE_STYLE[kit.voice]}, ${colorDescription(kit.colors)}, commercial polish`,
  },
  {
    id: 'testimonial-bg',
    label: 'Quote backdrop',
    emoji: '💬',
    description: 'Calm looping scenes to sit behind quotes/testimonials.',
    aspect: 'portrait',
    buildPrompt: (kit, i) =>
      `Calm slow-motion backdrop video for ${kit.name} customer quotes: softly drifting abstract scene in ${colorDescription(kit.colors)}, ${VOICE_STYLE[kit.voice]}, very gentle motion, ${TIME_VARIANTS[(i + 3) % TIME_VARIANTS.length]}, uncluttered composition for text overlay`,
  },
];

export const ASPECT_DIMENSIONS: Record<
  CampaignTemplate['aspect'],
  { width: number; height: number }
> = {
  landscape: { width: 768, height: 512 },
  portrait: { width: 512, height: 768 },
  square: { width: 640, height: 640 },
};

export interface ContentPackOptions {
  templateIds: string[];
  variantsPerTemplate: number;
  durationSeconds: number;
  fps: number;
  steps: number;
  cfg: number;
  /** Base seed; each item derives a stable unique seed from it. */
  baseSeed: number;
  /** Asset kinds the kit actually has images for — enables i2v templates. */
  availableAssetKinds: AssetKind[];
}

export function generateContentPack(
  kit: BrandKit,
  options: ContentPackOptions
): GenerationPlanItem[] {
  const items: GenerationPlanItem[] = [];
  const variants = Math.max(1, Math.min(10, Math.floor(options.variantsPerTemplate)));
  const templates = CAMPAIGN_TEMPLATES.filter((t) => options.templateIds.includes(t.id));

  for (const template of templates) {
    const canAnimateAsset =
      template.assetKind != null &&
      options.availableAssetKinds.includes(template.assetKind);
    for (let v = 0; v < variants; v++) {
      const dims = ASPECT_DIMENSIONS[template.aspect];
      const seed =
        (options.baseSeed + hashString(`${template.id}:${v}`)) % 2 ** 32;
      items.push({
        id: `${template.id}-${v + 1}`,
        templateId: template.id,
        label: `${template.label} ${variants > 1 ? `#${v + 1}` : ''}`.trim(),
        mode: canAnimateAsset ? 'i2v' : 't2v',
        assetKind: canAnimateAsset ? template.assetKind : undefined,
        prompt: template.buildPrompt(kit, v),
        negativePrompt: DEFAULT_NEGATIVE_PROMPT,
        width: dims.width,
        height: dims.height,
        durationSeconds: options.durationSeconds,
        fps: options.fps,
        steps: options.steps,
        cfg: options.cfg,
        seed: seed >>> 0,
      });
    }
  }
  return items;
}

export function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
