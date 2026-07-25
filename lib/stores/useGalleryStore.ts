'use client';

// Gallery store: metadata list lives in memory, blobs stay in IndexedDB and
// are materialized as object URLs on demand.

import { create } from 'zustand';
import { db, deleteGalleryItem, type GalleryItem } from '../db';

interface GalleryState {
  items: GalleryItem[];
  loaded: boolean;
  refresh(): Promise<void>;
  remove(id: string): Promise<void>;
  toggleFavorite(id: string): Promise<void>;
  /** Returns an object URL for the stored blob (caller revokes). */
  getObjectUrl(id: string): Promise<string | null>;
  getBlob(id: string): Promise<Blob | null>;
}

export const useGalleryStore = create<GalleryState>((set, get) => ({
  items: [],
  loaded: false,

  async refresh() {
    const items = await db.galleryItems.orderBy('createdAt').reverse().toArray();
    set({ items, loaded: true });
  },

  async remove(id) {
    await deleteGalleryItem(id);
    set((s) => ({ items: s.items.filter((i) => i.id !== id) }));
  },

  async toggleFavorite(id) {
    const item = get().items.find((i) => i.id === id);
    if (!item) return;
    const favorite = !item.favorite;
    await db.galleryItems.update(id, { favorite });
    set((s) => ({
      items: s.items.map((i) => (i.id === id ? { ...i, favorite } : i)),
    }));
  },

  async getObjectUrl(id) {
    const row = await db.galleryBlobs.get(id);
    return row ? URL.createObjectURL(row.blob) : null;
  },

  async getBlob(id) {
    const row = await db.galleryBlobs.get(id);
    return row?.blob ?? null;
  },
}));
