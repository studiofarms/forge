'use client';

// Runtime media resolution for the editor. Each gallery clip becomes a
// ClipSource: real videos ride an HTMLVideoElement, animated GIFs (what the
// test backend produces) decode frame-accurately through the WebCodecs
// ImageDecoder. The preview and the exporter share these sources.

import { db } from '../db';
import type { Project } from './timeline';

export interface ClipSource {
  duration: number;
  naturalWidth: number;
  naturalHeight: number;
  /** Exact positioning — awaited by the exporter and the paused preview. */
  seek(t: number): Promise<void>;
  /** Best-effort positioning for the live play loop. */
  sync(t: number): void;
  /** Called for sources that are not visible right now. */
  idle(): void;
  /** Draw the frame for source-time t, cover-fitted into w×h. */
  draw(ctx: CanvasRenderingContext2D, t: number, w: number, h: number): void;
  dispose(): void;
}

export interface MediaHandle {
  sources: Map<string, ClipSource>;
  logoImage: HTMLImageElement | null;
  dispose(): void;
}

function coverRect(
  srcW: number,
  srcH: number,
  w: number,
  h: number
): [number, number, number, number] {
  const scale = Math.max(w / Math.max(1, srcW), h / Math.max(1, srcH));
  const dw = srcW * scale;
  const dh = srcH * scale;
  return [(w - dw) / 2, (h - dh) / 2, dw, dh];
}

// ── Video-backed source ─────────────────────────────────────────────────────

class VideoSource implements ClipSource {
  duration: number;
  naturalWidth: number;
  naturalHeight: number;
  private video: HTMLVideoElement;

  constructor(video: HTMLVideoElement) {
    this.video = video;
    this.duration = Number.isFinite(video.duration) ? video.duration : 0;
    this.naturalWidth = video.videoWidth || 0;
    this.naturalHeight = video.videoHeight || 0;
  }

  seek(t: number): Promise<void> {
    const video = this.video;
    return new Promise((resolve) => {
      const target = Math.min(Math.max(0, t), Math.max(0, this.duration - 1 / 60));
      if (Math.abs(video.currentTime - target) < 0.001 && video.readyState >= 2) {
        resolve();
        return;
      }
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        video.removeEventListener('seeked', done);
        resolve();
      };
      video.addEventListener('seeked', done);
      video.currentTime = target;
      setTimeout(done, 500); // some browsers skip 'seeked' on sub-frame moves
    });
  }

  sync(t: number): void {
    if (Math.abs(this.video.currentTime - t) > 0.25) this.video.currentTime = t;
    if (this.video.paused) void this.video.play().catch(() => undefined);
  }

  idle(): void {
    if (!this.video.paused) this.video.pause();
  }

  draw(ctx: CanvasRenderingContext2D, _t: number, w: number, h: number): void {
    if (this.video.readyState < 2) return;
    const [x, y, dw, dh] = coverRect(this.video.videoWidth, this.video.videoHeight, w, h);
    ctx.drawImage(this.video, x, y, dw, dh);
  }

  dispose(): void {
    this.video.pause();
    URL.revokeObjectURL(this.video.src);
    this.video.removeAttribute('src');
  }
}

function loadVideo(blob: Blob): Promise<VideoSource> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = url;
    video.addEventListener('loadedmetadata', () => resolve(new VideoSource(video)), { once: true });
    video.addEventListener(
      'error',
      () => {
        URL.revokeObjectURL(url);
        reject(new Error('Could not load a clip from the gallery'));
      },
      { once: true }
    );
  });
}

// ── Animated-GIF source (WebCodecs ImageDecoder) ────────────────────────────

// Minimal ambient typings — TS's DOM lib doesn't ship ImageDecoder yet.
declare class ImageDecoder {
  constructor(init: { data: ArrayBuffer; type: string });
  decode(options?: { frameIndex?: number }): Promise<{ image: VideoFrame }>;
  readonly tracks: { ready: Promise<void>; selectedTrack?: { frameCount: number } | null };
  close(): void;
}

interface GifFrame {
  bitmap: ImageBitmap;
  /** Start time in seconds. */
  start: number;
}

class GifSource implements ClipSource {
  duration: number;
  naturalWidth: number;
  naturalHeight: number;
  private frames: GifFrame[];

  constructor(frames: GifFrame[], duration: number) {
    this.frames = frames;
    this.duration = duration;
    this.naturalWidth = frames[0]?.bitmap.width ?? 0;
    this.naturalHeight = frames[0]?.bitmap.height ?? 0;
  }

  private frameAt(t: number): GifFrame | null {
    if (!this.frames.length) return null;
    // GIFs loop when a clip outlasts the animation.
    const local = this.duration > 0 ? t % this.duration : 0;
    let lo = 0;
    let hi = this.frames.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.frames[mid].start <= local) lo = mid;
      else hi = mid - 1;
    }
    return this.frames[lo];
  }

  seek(): Promise<void> {
    return Promise.resolve(); // frames are all decoded — nothing to wait for
  }
  sync(): void {}
  idle(): void {}

  draw(ctx: CanvasRenderingContext2D, t: number, w: number, h: number): void {
    const frame = this.frameAt(t);
    if (!frame) return;
    const [x, y, dw, dh] = coverRect(frame.bitmap.width, frame.bitmap.height, w, h);
    ctx.drawImage(frame.bitmap, x, y, dw, dh);
  }

  dispose(): void {
    for (const f of this.frames) f.bitmap.close();
    this.frames = [];
  }
}

async function loadGif(blob: Blob): Promise<GifSource> {
  if (typeof ImageDecoder === 'undefined') {
    throw new Error('This browser cannot decode animated GIFs in the editor.');
  }
  const decoder = new ImageDecoder({ data: await blob.arrayBuffer(), type: 'image/gif' });
  await decoder.tracks.ready;
  const frameCount = decoder.tracks.selectedTrack?.frameCount ?? 1;
  const frames: GifFrame[] = [];
  let clock = 0;
  for (let i = 0; i < frameCount; i++) {
    const { image } = await decoder.decode({ frameIndex: i });
    frames.push({ bitmap: await createImageBitmap(image), start: clock });
    // GIF frame durations come back in microseconds; default to 10 fps if absent.
    clock += (image.duration ?? 100_000) / 1e6;
    image.close();
  }
  decoder.close();
  return new GifSource(frames, clock);
}

// ── Loading ─────────────────────────────────────────────────────────────────

export function isEditableMime(mime: string): boolean {
  return mime.startsWith('video/') || mime === 'image/gif';
}

export async function loadSource(blob: Blob, mime: string): Promise<ClipSource> {
  return mime === 'image/gif' ? loadGif(blob) : loadVideo(blob);
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not load the logo image'));
    };
    img.src = url;
  });
}

/** Load every clip source (and the logo, if enabled) that `project` references. */
export async function loadProjectMedia(project: Project): Promise<MediaHandle> {
  const sources = new Map<string, ClipSource>();
  const ids = [...new Set(project.clips.map((c) => c.galleryId))];
  for (const id of ids) {
    const [row, meta] = await Promise.all([db.galleryBlobs.get(id), db.galleryItems.get(id)]);
    if (!row) continue; // deleted from gallery — clip renders black
    sources.set(id, await loadSource(row.blob, meta?.mime ?? row.blob.type ?? 'video/mp4'));
  }

  let logoImage: HTMLImageElement | null = null;
  if (project.logo.enabled && project.logo.assetId) {
    const row = await db.brandAssetBlobs.get(project.logo.assetId);
    if (row) logoImage = await loadImage(row.blob);
  }

  return {
    sources,
    logoImage,
    dispose() {
      for (const s of sources.values()) s.dispose();
      if (logoImage) URL.revokeObjectURL(logoImage.src);
    },
  };
}

/** Probe a gallery blob's real duration; null if it can't be loaded. */
export async function probeDuration(galleryId: string): Promise<number | null> {
  const [row, meta] = await Promise.all([
    db.galleryBlobs.get(galleryId),
    db.galleryItems.get(galleryId),
  ]);
  if (!row) return null;
  try {
    const source = await loadSource(row.blob, meta?.mime ?? row.blob.type ?? 'video/mp4');
    const d = source.duration || null;
    source.dispose();
    return d;
  } catch {
    return null;
  }
}
