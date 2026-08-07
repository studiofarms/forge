// IndexedDB persistence via Dexie: local gallery (video blobs) and brand kits
// (metadata + asset blobs). Nothing here ever touches a server.

import Dexie, { type Table } from 'dexie';
import type { BrandAssetMeta, BrandKit } from './brand/types';

export interface GalleryItem {
  id: string;
  createdAt: number;
  prompt: string;
  negativePrompt: string;
  mode: 't2v' | 'i2v';
  width: number;
  height: number;
  durationSeconds: number;
  fps: number;
  seed: number;
  brandKitId?: string;
  brandKitName?: string;
  campaignLabel?: string;
  mime: string;
  size: number;
  favorite: boolean;
}

export interface GalleryBlob {
  id: string; // same id as GalleryItem
  blob: Blob;
}

export interface BrandAssetBlob {
  id: string; // same id as BrandAssetMeta
  blob: Blob;
}

/** Start-frame images staged for i2v jobs (uploads, extracted last frames). */
export interface StagedImage {
  id: string;
  createdAt: number;
  blob: Blob;
}

class FrameForgeDB extends Dexie {
  galleryItems!: Table<GalleryItem, string>;
  galleryBlobs!: Table<GalleryBlob, string>;
  brandKits!: Table<BrandKit, string>;
  brandAssets!: Table<BrandAssetMeta, string>;
  brandAssetBlobs!: Table<BrandAssetBlob, string>;
  stagedImages!: Table<StagedImage, string>;

  constructor() {
    super('frameforge');
    this.version(1).stores({
      galleryItems: 'id, createdAt, brandKitId, favorite',
      galleryBlobs: 'id',
      brandKits: 'id, updatedAt',
      brandAssets: 'id, kitId, kind',
      brandAssetBlobs: 'id',
    });
    this.version(2).stores({
      stagedImages: 'id, createdAt',
    });
  }
}

export const db = new FrameForgeDB();

export function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function saveGalleryVideo(
  meta: Omit<GalleryItem, 'id' | 'createdAt' | 'size' | 'favorite'>,
  blob: Blob
): Promise<GalleryItem> {
  const item: GalleryItem = {
    ...meta,
    id: newId(),
    createdAt: Date.now(),
    size: blob.size,
    favorite: false,
  };
  await db.transaction('rw', db.galleryItems, db.galleryBlobs, async () => {
    await db.galleryItems.add(item);
    await db.galleryBlobs.add({ id: item.id, blob });
  });
  return item;
}

/** Stage a start-frame image for an i2v job; old stages are pruned. */
export async function saveStagedImage(blob: Blob): Promise<string> {
  const id = newId();
  await db.stagedImages.add({ id, createdAt: Date.now(), blob });
  // Keep the table from growing forever — stages older than a week are dead.
  const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
  await db.stagedImages.where('createdAt').below(cutoff).delete();
  return id;
}

export async function deleteGalleryItem(id: string): Promise<void> {
  await db.transaction('rw', db.galleryItems, db.galleryBlobs, async () => {
    await db.galleryItems.delete(id);
    await db.galleryBlobs.delete(id);
  });
}

export async function deleteBrandKit(kitId: string): Promise<void> {
  await db.transaction(
    'rw',
    db.brandKits,
    db.brandAssets,
    db.brandAssetBlobs,
    async () => {
      const assets = await db.brandAssets.where('kitId').equals(kitId).toArray();
      await db.brandAssetBlobs.bulkDelete(assets.map((a) => a.id));
      await db.brandAssets.where('kitId').equals(kitId).delete();
      await db.brandKits.delete(kitId);
    }
  );
}
