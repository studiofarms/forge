'use client';

// Brand kit store: CRUD over IndexedDB, plus package import orchestration.

import { create } from 'zustand';
import { db, deleteBrandKit, newId } from '../db';
import { extractPalette } from '../brand/palette';
import {
  importBrandZip,
  importLooseFiles,
  type BrandPackage,
} from '../brand/packageImport';
import type { AssetKind, BrandAssetMeta, BrandKit } from '../brand/types';

interface BrandState {
  kits: BrandKit[];
  assets: BrandAssetMeta[]; // assets for ALL kits (small metadata rows)
  activeKitId: string | null;
  loaded: boolean;
  refresh(): Promise<void>;
  setActiveKit(id: string | null): void;
  createKit(partial?: Partial<BrandKit>): Promise<BrandKit>;
  updateKit(id: string, patch: Partial<BrandKit>): Promise<void>;
  removeKit(id: string): Promise<void>;
  /** Import a zip or loose files into a kit; creates the kit when kitId is null. */
  importPackage(kitId: string | null, files: File[]): Promise<{ kit: BrandKit; warnings: string[] }>;
  addAsset(kitId: string, kind: AssetKind, file: File): Promise<void>;
  removeAsset(assetId: string): Promise<void>;
  getAssetBlob(assetId: string): Promise<Blob | null>;
  assetKindsFor(kitId: string): AssetKind[];
  /** First asset of a kind for a kit (used by i2v campaign templates). */
  firstAssetOf(kitId: string, kind: AssetKind): BrandAssetMeta | undefined;
}

export const useBrandStore = create<BrandState>((set, get) => ({
  kits: [],
  assets: [],
  activeKitId: null,
  loaded: false,

  async refresh() {
    const [kits, assets] = await Promise.all([
      db.brandKits.orderBy('updatedAt').reverse().toArray(),
      db.brandAssets.toArray(),
    ]);
    set((s) => ({
      kits,
      assets,
      loaded: true,
      activeKitId:
        s.activeKitId && kits.some((k) => k.id === s.activeKitId)
          ? s.activeKitId
          : kits[0]?.id ?? null,
    }));
  },

  setActiveKit(id) {
    set({ activeKitId: id });
  },

  async createKit(partial) {
    const now = Date.now();
    const kit: BrandKit = {
      id: newId(),
      name: partial?.name ?? 'Untitled brand',
      tagline: partial?.tagline ?? '',
      description: partial?.description ?? '',
      industry: partial?.industry ?? '',
      voice: partial?.voice ?? 'bold',
      keywords: partial?.keywords ?? [],
      colors: partial?.colors ?? [],
      createdAt: now,
      updatedAt: now,
    };
    await db.brandKits.add(kit);
    set((s) => ({ kits: [kit, ...s.kits], activeKitId: kit.id }));
    return kit;
  },

  async updateKit(id, patch) {
    const updatedAt = Date.now();
    await db.brandKits.update(id, { ...patch, updatedAt });
    set((s) => ({
      kits: s.kits.map((k) => (k.id === id ? { ...k, ...patch, updatedAt } : k)),
    }));
  },

  async removeKit(id) {
    await deleteBrandKit(id);
    set((s) => ({
      kits: s.kits.filter((k) => k.id !== id),
      assets: s.assets.filter((a) => a.kitId !== id),
      activeKitId: s.activeKitId === id ? null : s.activeKitId,
    }));
  },

  async importPackage(kitId, files) {
    let pkg: BrandPackage;
    if (files.length === 1 && /\.zip$/i.test(files[0].name)) {
      pkg = await importBrandZip(files[0]);
    } else {
      pkg = importLooseFiles(files);
    }

    let kit = kitId ? get().kits.find((k) => k.id === kitId) ?? null : null;
    if (!kit) {
      kit = await get().createKit({
        name: pkg.manifest.name ?? files[0]?.name.replace(/\.zip$/i, '') ?? 'Imported brand',
      });
    }
    const m = pkg.manifest;
    const patch: Partial<BrandKit> = {};
    if (m.name) patch.name = m.name;
    if (m.tagline) patch.tagline = m.tagline;
    if (m.description) patch.description = m.description;
    if (m.industry) patch.industry = m.industry;
    if (m.voice) patch.voice = m.voice;
    if (m.keywords?.length) patch.keywords = m.keywords;
    if (m.colors?.length) patch.colors = m.colors;

    const metas: BrandAssetMeta[] = [];
    for (const asset of pkg.assets) {
      const meta: BrandAssetMeta = {
        id: newId(),
        kitId: kit.id,
        kind: asset.kind,
        name: asset.name,
        mime: asset.mime,
        size: asset.blob.size,
        addedAt: Date.now(),
      };
      await db.brandAssets.add(meta);
      await db.brandAssetBlobs.add({ id: meta.id, blob: asset.blob });
      metas.push(meta);
    }

    // Auto-extract a palette from the first logo when none was supplied.
    if (!patch.colors && !kit.colors.length) {
      const logo = pkg.assets.find((a) => a.kind === 'logo') ?? pkg.assets.find((a) => a.kind !== 'font');
      if (logo && logo.mime !== 'image/svg+xml') {
        try {
          const colors = await extractPalette(logo.blob);
          if (colors.length) patch.colors = colors;
        } catch {
          pkg.warnings.push('Could not auto-extract colors from the logo.');
        }
      }
    }

    if (Object.keys(patch).length) await get().updateKit(kit.id, patch);
    set((s) => ({ assets: [...s.assets, ...metas] }));
    const freshKit = get().kits.find((k) => k.id === kit!.id) ?? kit;
    return { kit: freshKit, warnings: pkg.warnings };
  },

  async addAsset(kitId, kind, file) {
    const meta: BrandAssetMeta = {
      id: newId(),
      kitId,
      kind,
      name: file.name,
      mime: file.type || 'application/octet-stream',
      size: file.size,
      addedAt: Date.now(),
    };
    await db.brandAssets.add(meta);
    await db.brandAssetBlobs.add({ id: meta.id, blob: file });
    set((s) => ({ assets: [...s.assets, meta] }));
  },

  async removeAsset(assetId) {
    await db.brandAssets.delete(assetId);
    await db.brandAssetBlobs.delete(assetId);
    set((s) => ({ assets: s.assets.filter((a) => a.id !== assetId) }));
  },

  async getAssetBlob(assetId) {
    const row = await db.brandAssetBlobs.get(assetId);
    return row?.blob ?? null;
  },

  assetKindsFor(kitId) {
    const kinds = new Set<AssetKind>();
    for (const a of get().assets) {
      if (a.kitId === kitId && a.mime.startsWith('image/')) kinds.add(a.kind);
    }
    return [...kinds];
  },

  firstAssetOf(kitId, kind) {
    return get().assets.find(
      (a) => a.kitId === kitId && a.kind === kind && a.mime.startsWith('image/')
    );
  },
}));
