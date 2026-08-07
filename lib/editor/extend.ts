'use client';

// "Extend video": grab the final frame of a gallery clip at native size so an
// i2v job can continue the shot from exactly where it ended.

import { db, saveStagedImage } from '../db';
import { loadSource } from './media';

export interface ExtractedFrame {
  stagedImageId: string;
  width: number;
  height: number;
}

export async function stageLastFrame(galleryId: string): Promise<ExtractedFrame> {
  const [row, meta] = await Promise.all([
    db.galleryBlobs.get(galleryId),
    db.galleryItems.get(galleryId),
  ]);
  if (!row) throw new Error('That clip is no longer in the gallery.');

  const source = await loadSource(row.blob, meta?.mime ?? row.blob.type ?? 'video/mp4');
  try {
    const w = source.naturalWidth || meta?.width || 768;
    const h = source.naturalHeight || meta?.height || 512;
    await source.seek(Math.max(0, source.duration - 0.05));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not create a drawing canvas.');
    source.draw(ctx, Math.max(0, source.duration - 0.05), w, h);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not capture the frame.'))), 'image/png')
    );
    const stagedImageId = await saveStagedImage(blob);
    return { stagedImageId, width: w, height: h };
  } finally {
    source.dispose();
  }
}
