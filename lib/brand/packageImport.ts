// Brand package import: accepts a .zip (or a set of loose files) and sorts the
// contents into typed brand assets. Optionally reads a brand.json manifest at
// the zip root to prefill kit fields.

import JSZip from 'jszip';
import type { AssetKind, BrandColor, BrandVoice } from './types';

export interface ImportedAsset {
  kind: AssetKind;
  name: string;
  mime: string;
  blob: Blob;
}

export interface ImportedManifest {
  name?: string;
  tagline?: string;
  description?: string;
  industry?: string;
  voice?: BrandVoice;
  keywords?: string[];
  colors?: BrandColor[];
}

export interface BrandPackage {
  manifest: ImportedManifest;
  assets: ImportedAsset[];
  warnings: string[];
}

const IMAGE_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
};

const FONT_EXT: Record<string, string> = {
  ttf: 'font/ttf',
  otf: 'font/otf',
  woff: 'font/woff',
  woff2: 'font/woff2',
};

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i === -1 ? '' : name.slice(i + 1).toLowerCase();
}

/**
 * Classify a file into an asset kind using its path and name. Folder names
 * win (logos/, products/, lifestyle/), then filename hints, then type.
 */
export function classifyAsset(path: string): AssetKind | null {
  const lower = path.toLowerCase();
  const ext = extOf(lower);
  if (FONT_EXT[ext]) return 'font';
  if (!IMAGE_EXT[ext]) return null;
  if (/(^|\/)(logos?|marks?|icons?)\//.test(lower) || /logo|wordmark|icon/.test(lower)) {
    return 'logo';
  }
  if (/(^|\/)(products?|packshots?|items?)\//.test(lower) || /product|packshot|bottle|box|item/.test(lower)) {
    return 'product';
  }
  if (/(^|\/)(lifestyle|photos?|moods?|backgrounds?)\//.test(lower) || /lifestyle|mood|hero|banner/.test(lower)) {
    return 'lifestyle';
  }
  return 'other';
}

export function mimeForName(name: string): string {
  const ext = extOf(name);
  return IMAGE_EXT[ext] ?? FONT_EXT[ext] ?? 'application/octet-stream';
}

function parseManifest(text: string, warnings: string[]): ImportedManifest {
  try {
    const raw = JSON.parse(text) as Record<string, unknown>;
    const manifest: ImportedManifest = {};
    if (typeof raw.name === 'string') manifest.name = raw.name;
    if (typeof raw.tagline === 'string') manifest.tagline = raw.tagline;
    if (typeof raw.description === 'string') manifest.description = raw.description;
    if (typeof raw.industry === 'string') manifest.industry = raw.industry;
    if (typeof raw.voice === 'string') manifest.voice = raw.voice as BrandVoice;
    if (Array.isArray(raw.keywords)) {
      manifest.keywords = raw.keywords.filter((k): k is string => typeof k === 'string');
    }
    if (Array.isArray(raw.colors)) {
      const colors: BrandColor[] = [];
      for (const c of raw.colors) {
        if (typeof c === 'string' && /^#?[0-9a-f]{6}$/i.test(c)) {
          colors.push({ hex: c.startsWith('#') ? c : `#${c}`, role: 'primary' });
        } else if (c && typeof c === 'object' && typeof (c as any).hex === 'string') {
          colors.push({
            hex: (c as any).hex,
            role: ((c as any).role as BrandColor['role']) ?? 'primary',
          });
        }
      }
      if (colors.length) manifest.colors = colors;
    }
    return manifest;
  } catch {
    warnings.push('brand.json found but could not be parsed — ignored.');
    return {};
  }
}

export async function importBrandZip(file: Blob): Promise<BrandPackage> {
  const warnings: string[] = [];
  const zip = await JSZip.loadAsync(file);
  const assets: ImportedAsset[] = [];
  let manifest: ImportedManifest = {};

  const entries = Object.values(zip.files).filter((f) => !f.dir);
  for (const entry of entries) {
    const path = entry.name;
    if (/(^|\/)__macosx\//i.test(path) || /(^|\/)\./.test(path)) continue;
    if (/(^|\/)brand\.json$/i.test(path)) {
      manifest = parseManifest(await entry.async('string'), warnings);
      continue;
    }
    const kind = classifyAsset(path);
    if (!kind) {
      if (!/\.(txt|md|pdf)$/i.test(path)) {
        warnings.push(`Skipped unsupported file: ${path}`);
      }
      continue;
    }
    const blob = await entry.async('blob');
    const name = path.split('/').pop() ?? path;
    assets.push({ kind, name, mime: mimeForName(name), blob });
  }

  if (!assets.length) {
    warnings.push('No usable images or fonts found in the package.');
  }
  return { manifest, assets, warnings };
}

/** Import loose files (non-zip drag & drop). */
export function importLooseFiles(files: File[]): BrandPackage {
  const assets: ImportedAsset[] = [];
  const warnings: string[] = [];
  for (const f of files) {
    const kind = classifyAsset(f.name);
    if (!kind) {
      warnings.push(`Skipped unsupported file: ${f.name}`);
      continue;
    }
    assets.push({ kind, name: f.name, mime: f.type || mimeForName(f.name), blob: f });
  }
  return { manifest: {}, assets, warnings };
}
