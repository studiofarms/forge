'use client';

// Frame compositor shared by the live preview and the exporter: given a
// timeline time and already-seeked <video> elements, draw one finished frame
// (clips + crossfades + filter + text overlays + logo) onto a 2D context.
// Keeping preview and export on this one code path means WYSIWYG output.

import {
  overlaysAt,
  segmentsAt,
  type FilterKind,
  type Project,
  type TextOverlay,
} from './timeline';
import type { MediaHandle } from './media';

const FILTER_CSS: Record<FilterKind, string> = {
  none: 'none',
  warm: 'saturate(1.15) sepia(0.18) contrast(1.03)',
  cool: 'saturate(1.08) hue-rotate(-10deg) brightness(1.02)',
  mono: 'grayscale(1) contrast(1.06)',
  vivid: 'saturate(1.45) contrast(1.08)',
};

function overlayFont(o: TextOverlay, frameHeight: number): { px: number; font: string } {
  const rel = o.size === 'sm' ? 0.045 : o.size === 'lg' ? 0.095 : 0.065;
  const px = Math.round(frameHeight * rel);
  return { px, font: `700 ${px}px system-ui, -apple-system, 'Segoe UI', sans-serif` };
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const attempt = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(attempt).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = attempt;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function drawOverlay(
  ctx: CanvasRenderingContext2D,
  o: TextOverlay,
  w: number,
  h: number
): void {
  const { px, font } = overlayFont(o, h);
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const maxWidth = w * 0.86;
  const lines = wrapText(ctx, o.text, maxWidth);
  const lineHeight = px * 1.25;
  const blockHeight = lines.length * lineHeight;

  const centerY =
    o.position === 'top'
      ? h * 0.12 + blockHeight / 2
      : o.position === 'center'
        ? h / 2
        : o.position === 'lower-third'
          ? h * 0.78
          : h - h * 0.08 - blockHeight / 2;

  if (o.backing) {
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const padX = px * 0.6;
    const padY = px * 0.35;
    ctx.fillStyle = 'rgba(8, 8, 14, 0.62)';
    const bx = w / 2 - widest / 2 - padX;
    const by = centerY - blockHeight / 2 - padY;
    const bw = widest + padX * 2;
    const bh = blockHeight + padY * 2;
    const r = Math.min(px * 0.35, bh / 2);
    ctx.beginPath();
    ctx.moveTo(bx + r, by);
    ctx.arcTo(bx + bw, by, bx + bw, by + bh, r);
    ctx.arcTo(bx + bw, by + bh, bx, by + bh, r);
    ctx.arcTo(bx, by + bh, bx, by, r);
    ctx.arcTo(bx, by, bx + bw, by, r);
    ctx.fill();
  }

  ctx.fillStyle = o.color;
  lines.forEach((l, i) => {
    const y = centerY - blockHeight / 2 + lineHeight * (i + 0.5);
    ctx.fillText(l, w / 2, y);
  });
}

function drawLogo(
  ctx: CanvasRenderingContext2D,
  project: Project,
  img: HTMLImageElement,
  w: number,
  h: number
): void {
  const { corner, scale, opacity } = project.logo;
  const lw = w * scale;
  const lh = (img.naturalHeight / Math.max(1, img.naturalWidth)) * lw;
  const margin = w * 0.03;
  const x = corner === 'tl' || corner === 'bl' ? margin : w - lw - margin;
  const y = corner === 'tl' || corner === 'tr' ? margin : h - lh - margin;
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.drawImage(img, x, y, lw, lh);
  ctx.restore();
}

/** Draw the complete frame for timeline time t. Sources must be pre-seeked. */
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  project: Project,
  media: MediaHandle,
  t: number
): void {
  const w = project.width;
  const h = project.height;
  ctx.save();
  ctx.filter = 'none';
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);

  const filter = FILTER_CSS[project.filter] ?? 'none';
  for (const seg of segmentsAt(project, t)) {
    const clip = project.clips[seg.index];
    const source = media.sources.get(clip.galleryId);
    if (!source) continue;
    ctx.globalAlpha = seg.alpha;
    ctx.filter = filter;
    source.draw(ctx, seg.sourceTime, w, h);
  }
  ctx.filter = 'none';
  ctx.globalAlpha = 1;

  for (const o of overlaysAt(project, t)) drawOverlay(ctx, o, w, h);
  if (project.logo.enabled && media.logoImage) drawLogo(ctx, project, media.logoImage, w, h);
  ctx.restore();
}

/** Await exact positioning of every source visible at time t. */
export async function seekSources(
  project: Project,
  media: MediaHandle,
  t: number
): Promise<void> {
  for (const seg of segmentsAt(project, t)) {
    const source = media.sources.get(project.clips[seg.index].galleryId);
    if (source) await source.seek(seg.sourceTime);
  }
}
