// Brand kit domain model. Kits + assets persist in IndexedDB (see lib/db.ts).

export type AssetKind = 'logo' | 'product' | 'lifestyle' | 'font' | 'palette' | 'other';

export interface BrandAssetMeta {
  id: string;
  kitId: string;
  kind: AssetKind;
  name: string;
  mime: string;
  size: number;
  addedAt: number;
}

export interface BrandColor {
  hex: string;
  role: 'primary' | 'secondary' | 'accent' | 'background' | 'neutral';
}

export type BrandVoice =
  | 'bold'
  | 'playful'
  | 'elegant'
  | 'minimal'
  | 'warm'
  | 'technical'
  | 'luxurious'
  | 'earthy';

export interface BrandKit {
  id: string;
  name: string;
  tagline: string;
  description: string;
  industry: string;
  voice: BrandVoice;
  keywords: string[];
  colors: BrandColor[];
  createdAt: number;
  updatedAt: number;
}

export const VOICE_OPTIONS: { value: BrandVoice; label: string; hint: string }[] = [
  { value: 'bold', label: 'Bold', hint: 'high contrast, dynamic, confident' },
  { value: 'playful', label: 'Playful', hint: 'bright, energetic, fun' },
  { value: 'elegant', label: 'Elegant', hint: 'refined, graceful, premium' },
  { value: 'minimal', label: 'Minimal', hint: 'clean, spacious, precise' },
  { value: 'warm', label: 'Warm', hint: 'inviting, human, golden light' },
  { value: 'technical', label: 'Technical', hint: 'sleek, futuristic, exact' },
  { value: 'luxurious', label: 'Luxurious', hint: 'rich textures, dramatic light' },
  { value: 'earthy', label: 'Earthy', hint: 'natural, organic, grounded' },
];

/** Descriptive fragments the content engine folds into prompts per voice. */
export const VOICE_STYLE: Record<BrandVoice, string> = {
  bold: 'bold high-contrast cinematography, dynamic camera movement, confident composition',
  playful: 'bright playful energy, lively motion, saturated cheerful color grading',
  elegant: 'elegant refined aesthetic, graceful slow camera glide, soft premium lighting',
  minimal: 'minimalist composition, generous negative space, clean studio lighting',
  warm: 'warm golden-hour light, inviting atmosphere, gentle handheld motion',
  technical: 'sleek futuristic look, precise geometric composition, cool ambient lighting',
  luxurious: 'luxurious rich textures, dramatic chiaroscuro lighting, cinematic depth of field',
  earthy: 'natural organic textures, earthy tones, soft diffused daylight',
};

export function colorDescription(colors: BrandColor[]): string {
  if (!colors.length) return '';
  const named = colors
    .slice(0, 3)
    .map((c) => `${describeHex(c.hex)} (${c.hex})`)
    .join(', ');
  return `brand color palette of ${named}`;
}

/** Rough human-readable name for a hex color, for prompt building. */
export function describeHex(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 'brand color';
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 510;
  if (max - min < 24) {
    if (lightness > 0.85) return 'white';
    if (lightness > 0.6) return 'light gray';
    if (lightness > 0.3) return 'gray';
    if (lightness > 0.08) return 'charcoal';
    return 'black';
  }
  const hue = (() => {
    const d = max - min;
    let h = 0;
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return ((h * 60) + 360) % 360;
  })();
  const names: [number, string][] = [
    [15, 'red'],
    [40, 'orange'],
    [65, 'yellow'],
    [95, 'lime green'],
    [150, 'green'],
    [195, 'teal'],
    [250, 'blue'],
    [290, 'purple'],
    [330, 'magenta'],
    [360, 'red'],
  ];
  const base = names.find(([limit]) => hue <= limit)?.[1] ?? 'red';
  if (lightness > 0.75) return `light ${base}`;
  if (lightness < 0.28) return `deep ${base}`;
  return base;
}
