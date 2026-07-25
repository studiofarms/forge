// Editor timeline domain model. Pure data + pure functions — every mutation
// returns a new Project so the store stays trivial and everything here is
// unit-testable without a DOM.

export type TransitionKind = 'none' | 'crossfade';
export type FilterKind = 'none' | 'warm' | 'cool' | 'mono' | 'vivid';
export type OverlayPosition = 'top' | 'center' | 'lower-third' | 'bottom';
export type LogoCorner = 'tl' | 'tr' | 'bl' | 'br';

export interface TimelineClip {
  id: string;
  /** Gallery item whose blob backs this clip. */
  galleryId: string;
  label: string;
  /** Natural duration of the source video in seconds. */
  sourceDuration: number;
  /** Trim window inside the source, seconds. */
  inPoint: number;
  outPoint: number;
  /** Transition INTO the next clip (ignored on the last clip). */
  transitionAfter: TransitionKind;
}

export interface TextOverlay {
  id: string;
  text: string;
  /** Timeline window, seconds. */
  start: number;
  end: number;
  position: OverlayPosition;
  size: 'sm' | 'md' | 'lg';
  color: string;
  /** Draw a dark backing bar behind the text. */
  backing: boolean;
}

export interface LogoOverlay {
  enabled: boolean;
  /** Brand asset id of the logo image, resolved by the UI. */
  assetId: string | null;
  corner: LogoCorner;
  /** Width relative to frame width (0.05–0.35). */
  scale: number;
  opacity: number;
}

export interface MusicSettings {
  /** File name for display; the blob itself lives in the store (not persisted). */
  name: string;
  volume: number;
  fadeInSeconds: number;
  fadeOutSeconds: number;
}

export interface Project {
  clips: TimelineClip[];
  overlays: TextOverlay[];
  logo: LogoOverlay;
  music: MusicSettings | null;
  filter: FilterKind;
  /** Length of every crossfade, seconds (per-pair effective value is clamped). */
  crossfadeSeconds: number;
  width: number;
  height: number;
  fps: number;
}

export const MIN_CLIP_SECONDS = 0.2;

export function emptyProject(): Project {
  return {
    clips: [],
    overlays: [],
    logo: { enabled: false, assetId: null, corner: 'br', scale: 0.14, opacity: 0.9 },
    music: null,
    filter: 'none',
    crossfadeSeconds: 0.5,
    width: 768,
    height: 512,
    fps: 24,
  };
}

export function clipDuration(clip: TimelineClip): number {
  return clip.outPoint - clip.inPoint;
}

/** Effective crossfade between clip i and i+1 (never longer than half a side). */
export function effectiveCrossfade(project: Project, i: number): number {
  const a = project.clips[i];
  const b = project.clips[i + 1];
  if (!a || !b || a.transitionAfter !== 'crossfade') return 0;
  return Math.min(project.crossfadeSeconds, clipDuration(a) / 2, clipDuration(b) / 2);
}

/** Timeline start time of every clip (crossfades overlap the previous clip). */
export function clipStarts(project: Project): number[] {
  const starts: number[] = [];
  let t = 0;
  for (let i = 0; i < project.clips.length; i++) {
    starts.push(t);
    t += clipDuration(project.clips[i]) - effectiveCrossfade(project, i);
  }
  return starts;
}

export function projectDuration(project: Project): number {
  if (!project.clips.length) return 0;
  const starts = clipStarts(project);
  const last = project.clips.length - 1;
  return starts[last] + clipDuration(project.clips[last]);
}

export interface ActiveSegment {
  /** Index into project.clips. */
  index: number;
  /** Time inside the source file (inPoint offset applied). */
  sourceTime: number;
  /** 0..1 draw opacity (crossfades produce two segments). */
  alpha: number;
}

/** Which clip(s) are visible at timeline time t, with crossfade alphas. */
export function segmentsAt(project: Project, t: number): ActiveSegment[] {
  const starts = clipStarts(project);
  const out: ActiveSegment[] = [];
  for (let i = 0; i < project.clips.length; i++) {
    const clip = project.clips[i];
    const local = t - starts[i];
    if (local < 0 || local >= clipDuration(clip)) continue;
    let alpha = 1;
    // Fading into the next clip?
    const fadeOut = effectiveCrossfade(project, i);
    if (fadeOut > 0) {
      const untilEnd = clipDuration(clip) - local;
      if (untilEnd < fadeOut) alpha = Math.min(alpha, untilEnd / fadeOut);
    }
    // Fading in from the previous clip?
    const fadeIn = i > 0 ? effectiveCrossfade(project, i - 1) : 0;
    if (fadeIn > 0 && local < fadeIn) alpha = Math.min(alpha, local / fadeIn);
    out.push({ index: i, sourceTime: clip.inPoint + local, alpha });
  }
  // Draw bottom (earlier clip) first.
  return out.sort((a, b) => a.index - b.index);
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

// ── Mutations (all return a new Project) ────────────────────────────────────

export function addClip(
  project: Project,
  clip: Omit<TimelineClip, 'inPoint' | 'outPoint' | 'transitionAfter'>
): Project {
  const full: TimelineClip = {
    ...clip,
    inPoint: 0,
    outPoint: Math.max(MIN_CLIP_SECONDS, clip.sourceDuration),
    transitionAfter: 'none',
  };
  return { ...project, clips: [...project.clips, full] };
}

export function removeClip(project: Project, clipId: string): Project {
  return { ...project, clips: project.clips.filter((c) => c.id !== clipId) };
}

export function moveClip(project: Project, clipId: string, delta: -1 | 1): Project {
  const i = project.clips.findIndex((c) => c.id === clipId);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= project.clips.length) return project;
  const clips = [...project.clips];
  [clips[i], clips[j]] = [clips[j], clips[i]];
  return { ...project, clips };
}

export function trimClip(
  project: Project,
  clipId: string,
  inPoint: number,
  outPoint: number
): Project {
  return {
    ...project,
    clips: project.clips.map((c) => {
      if (c.id !== clipId) return c;
      const nextIn = clamp(inPoint, 0, c.sourceDuration - MIN_CLIP_SECONDS);
      const nextOut = clamp(outPoint, nextIn + MIN_CLIP_SECONDS, c.sourceDuration);
      return { ...c, inPoint: nextIn, outPoint: nextOut };
    }),
  };
}

export function setTransition(
  project: Project,
  clipId: string,
  transitionAfter: TransitionKind
): Project {
  return {
    ...project,
    clips: project.clips.map((c) => (c.id === clipId ? { ...c, transitionAfter } : c)),
  };
}

/**
 * Split the clip under timeline time t into two clips at that point.
 * Returns the unchanged project if t doesn't land ≥MIN_CLIP_SECONDS inside a clip.
 */
export function splitAt(project: Project, t: number, newId: string): Project {
  const starts = clipStarts(project);
  for (let i = 0; i < project.clips.length; i++) {
    const clip = project.clips[i];
    const local = t - starts[i];
    if (local < MIN_CLIP_SECONDS || local > clipDuration(clip) - MIN_CLIP_SECONDS) continue;
    const splitSource = clip.inPoint + local;
    const first: TimelineClip = { ...clip, outPoint: splitSource, transitionAfter: 'none' };
    const second: TimelineClip = { ...clip, id: newId, inPoint: splitSource };
    const clips = [...project.clips];
    clips.splice(i, 1, first, second);
    return { ...project, clips };
  }
  return project;
}

// ── Overlay mutations ───────────────────────────────────────────────────────

export function upsertOverlay(project: Project, overlay: TextOverlay): Project {
  const exists = project.overlays.some((o) => o.id === overlay.id);
  const start = Math.max(0, overlay.start);
  const clean: TextOverlay = { ...overlay, start, end: Math.max(start + 0.1, overlay.end) };
  return {
    ...project,
    overlays: exists
      ? project.overlays.map((o) => (o.id === clean.id ? clean : o))
      : [...project.overlays, clean],
  };
}

export function removeOverlay(project: Project, overlayId: string): Project {
  return { ...project, overlays: project.overlays.filter((o) => o.id !== overlayId) };
}

/** Overlays visible at timeline time t. */
export function overlaysAt(project: Project, t: number): TextOverlay[] {
  return project.overlays.filter((o) => t >= o.start && t < o.end);
}
