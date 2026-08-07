// Prompt-crafting toolkit for the Studio: camera moves, style presets, and a
// deterministic "enhance" pass — the controls the big commercial apps (Kling,
// Runway, Pika) put around their prompt boxes, implemented as pure functions.

export interface PromptChip {
  id: string;
  label: string;
  /** Fragment folded into the prompt. */
  phrase: string;
}

export const CAMERA_MOVES: PromptChip[] = [
  { id: 'dolly-in', label: 'Dolly in', phrase: 'slow cinematic dolly-in toward the subject' },
  { id: 'dolly-out', label: 'Pull back', phrase: 'smooth pull-back reveal shot' },
  { id: 'orbit', label: 'Orbit', phrase: 'gentle orbit around the subject' },
  { id: 'tracking', label: 'Tracking', phrase: 'smooth lateral tracking shot' },
  { id: 'crane', label: 'Crane up', phrase: 'rising crane shot lifting over the scene' },
  { id: 'aerial', label: 'Aerial', phrase: 'sweeping aerial drone shot' },
  { id: 'handheld', label: 'Handheld', phrase: 'subtle handheld documentary camera movement' },
  { id: 'static', label: 'Locked', phrase: 'locked-off static camera, composed frame' },
];

export const STYLE_PRESETS: PromptChip[] = [
  { id: 'cinematic', label: 'Cinematic', phrase: 'cinematic film look, anamorphic lens, film grain, dramatic lighting' },
  { id: 'documentary', label: 'Documentary', phrase: 'naturalistic documentary style, available light, authentic detail' },
  { id: 'anime', label: 'Anime', phrase: 'vibrant anime style, expressive 2D animation aesthetic, bold linework' },
  { id: 'noir', label: 'Film noir', phrase: 'black and white film noir, hard shadows, venetian-blind light, moody' },
  { id: 'vintage', label: 'Vintage', phrase: 'vintage 16mm film, faded warm colors, soft focus, nostalgic grain' },
  { id: 'neon', label: 'Neon', phrase: 'neon-soaked cyberpunk palette, glowing signage, wet reflective streets' },
  { id: 'dreamy', label: 'Dreamy', phrase: 'ethereal dreamlike atmosphere, soft glow, floating particles, pastel haze' },
  { id: 'product', label: 'Product ad', phrase: 'premium commercial advertising look, studio lighting, immaculate styling' },
];

/** Quality vocabulary the enhancer appends when it isn't already present. */
const ENHANCE_TERMS = [
  'highly detailed',
  'professional cinematography',
  'smooth natural motion',
  'volumetric light',
  'sharp focus',
];

/**
 * Compose the final prompt: base idea + optional camera move + optional style
 * + (if `enhance`) quality terms not already covered. Deterministic, no LLM —
 * duplicates are skipped case-insensitively so re-running never bloats it.
 */
export function craftPrompt(options: {
  base: string;
  cameraId?: string | null;
  styleId?: string | null;
  enhance?: boolean;
}): string {
  const base = options.base.trim().replace(/\s+/g, ' ');
  if (!base) return '';
  const parts: string[] = [base];
  const seen = new Set<string>([base.toLowerCase()]);

  const push = (phrase: string) => {
    const p = phrase.trim();
    if (!p) return;
    if (base.toLowerCase().includes(p.toLowerCase())) return;
    if (seen.has(p.toLowerCase())) return;
    seen.add(p.toLowerCase());
    parts.push(p);
  };

  const camera = CAMERA_MOVES.find((c) => c.id === options.cameraId);
  if (camera) push(camera.phrase);
  const style = STYLE_PRESETS.find((s) => s.id === options.styleId);
  if (style) push(style.phrase);
  if (options.enhance) {
    for (const term of ENHANCE_TERMS) {
      if (!parts.some((p) => p.toLowerCase().includes(term.toLowerCase()))) push(term);
    }
  }
  return parts.join(', ');
}

/** Derive the seed list for N variations from one base seed. */
export function variationSeeds(baseSeed: number, count: number): number[] {
  const n = Math.max(1, Math.min(8, Math.floor(count)));
  return Array.from({ length: n }, (_, i) => (baseSeed + i * 7919) >>> 0);
}
