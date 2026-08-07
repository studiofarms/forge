// Prompt → Video storyboard engine: expands one idea into an ordered shot
// list a film editor would cut — establish, explore details, hero moment,
// close. Pure and deterministic (seeded off the idea text) so it is fully
// unit-testable, and brand-aware when a kit is supplied.

import { DEFAULT_NEGATIVE_PROMPT } from '../comfy/buildWorkflow';
import { hashString } from '../brand/contentEngine';
import { VOICE_STYLE, colorDescription, type BrandKit } from '../brand/types';

export type StoryAspect = 'landscape' | 'portrait' | 'square';

export interface StoryboardScene {
  id: string;
  /** Short label shown on the scene card and the timeline clip. */
  label: string;
  prompt: string;
  negativePrompt: string;
}

export interface StoryboardOptions {
  /** How many shots to plan (clamped 2–6). */
  sceneCount: number;
  aspect: StoryAspect;
  /** Optional brand kit — folds voice, palette and keywords into every shot. */
  kit?: BrandKit | null;
}

export const STORY_ASPECT_DIMENSIONS: Record<StoryAspect, { width: number; height: number }> = {
  landscape: { width: 768, height: 512 },
  portrait: { width: 512, height: 768 },
  square: { width: 640, height: 640 },
};

const LIGHT = [
  'at golden hour',
  'in soft morning light',
  'under dramatic evening light',
  'in bright airy daylight',
  'at blue hour',
];

/** The shot grammar, in narrative order. Hero and closing always make the cut. */
const SHOTS: { label: string; build(idea: string, light: string): string }[] = [
  {
    label: 'Opening',
    build: (idea, light) =>
      `Sweeping cinematic establishing shot introducing ${idea}, ${light}, wide composition, scene-setting atmosphere`,
  },
  {
    label: 'Detail',
    build: (idea, light) =>
      `Close-up macro detail shot of ${idea}, shallow depth of field, rich textures, ${light}`,
  },
  {
    label: 'Motion',
    build: (idea, light) =>
      `Smooth lateral tracking shot moving through ${idea}, dynamic but graceful camera movement, ${light}`,
  },
  {
    label: 'People',
    build: (idea, light) =>
      `Authentic human moment within ${idea}, candid framing, emotional connection, ${light}`,
  },
  {
    label: 'Hero',
    build: (idea, light) =>
      `Hero shot of ${idea}: slow dolly-in on the main subject, dramatic cinematic composition, ${light}`,
  },
  {
    label: 'Closing',
    build: (idea, light) =>
      `Elegant closing shot of ${idea}: gentle pull-back reveal, settling final frame with room for a title, ${light}`,
  },
];

function brandSuffix(kit: BrandKit | null | undefined): string {
  if (!kit) return 'cinematic color grading, professional videography';
  const parts = [VOICE_STYLE[kit.voice], colorDescription(kit.colors)];
  if (kit.keywords.length) parts.push(kit.keywords.join(', '));
  return parts.filter(Boolean).join(', ');
}

/** Title for the auto-added opening overlay. */
export function storyboardTitle(idea: string, kit?: BrandKit | null): string {
  if (kit?.tagline?.trim()) return kit.tagline.trim();
  if (kit?.name?.trim()) return kit.name.trim();
  const clean = idea.trim().replace(/\s+/g, ' ');
  return clean.length > 48 ? `${clean.slice(0, 45)}…` : clean;
}

export function buildStoryboard(idea: string, options: StoryboardOptions): StoryboardScene[] {
  const cleanIdea = idea.trim().replace(/\s+/g, ' ');
  if (!cleanIdea) throw new Error('Describe your video first.');
  const count = Math.max(2, Math.min(SHOTS.length, Math.floor(options.sceneCount)));

  // Keep narrative order: always open and close, fill the middle in sequence.
  const middle = SHOTS.slice(1, -1).slice(0, count - 2);
  const shots = [SHOTS[0], ...middle, SHOTS[SHOTS.length - 1]].slice(0, count);

  const seed = hashString(cleanIdea);
  const suffix = brandSuffix(options.kit);

  // Label is the bare shot name — the timeline and scene list number clips
  // themselves, so baking an index in here would double up.
  return shots.map((shot, i) => ({
    id: `scene-${i + 1}`,
    label: shot.label,
    prompt: `${shot.build(cleanIdea, LIGHT[(seed + i) % LIGHT.length])}, ${suffix}`,
    negativePrompt: DEFAULT_NEGATIVE_PROMPT,
  }));
}
