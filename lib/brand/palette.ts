// Client-side dominant-color extraction from an uploaded logo/image.
// Downsamples via canvas, buckets colors, returns the top swatches.

import type { BrandColor } from './types';

const SAMPLE_SIZE = 64;
const BUCKET_BITS = 4; // 16 levels per channel

export async function extractPalette(blob: Blob, count = 5): Promise<BrandColor[]> {
  const bitmap = await createImageBitmap(blob).catch(() => null);
  if (!bitmap) return [];
  const canvas = document.createElement('canvas');
  canvas.width = SAMPLE_SIZE;
  canvas.height = SAMPLE_SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(bitmap, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  const { data } = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);

  const buckets = new Map<number, { r: number; g: number; b: number; n: number }>();
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 128) continue; // skip transparency (logo backgrounds)
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    // Skip near-white — usually background, not brand color.
    if (r > 245 && g > 245 && b > 245) continue;
    const key =
      ((r >> BUCKET_BITS) << 8) | ((g >> BUCKET_BITS) << 4) | (b >> BUCKET_BITS);
    const bucket = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0 };
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    bucket.n += 1;
    buckets.set(key, bucket);
  }

  const roles: BrandColor['role'][] = ['primary', 'secondary', 'accent', 'background', 'neutral'];
  return [...buckets.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, count)
    .map((bucket, i) => ({
      hex: toHex(bucket.r / bucket.n, bucket.g / bucket.n, bucket.b / bucket.n),
      role: roles[Math.min(i, roles.length - 1)],
    }));
}

function toHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.round(v).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}
