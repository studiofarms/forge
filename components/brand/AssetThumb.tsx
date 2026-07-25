'use client';

import { useEffect, useState } from 'react';
import type { BrandAssetMeta } from '@/lib/brand/types';
import { useBrandStore } from '@/lib/stores/useBrandStore';
import { formatBytes } from '@/components/ui';

export function AssetThumb({ asset }: { asset: BrandAssetMeta }) {
  const [url, setUrl] = useState<string | null>(null);
  const { getAssetBlob, removeAsset } = useBrandStore();

  useEffect(() => {
    let u: string | null = null;
    let cancelled = false;
    if (asset.mime.startsWith('image/')) {
      void getAssetBlob(asset.id).then((blob) => {
        if (!blob || cancelled) return;
        u = URL.createObjectURL(blob);
        setUrl(u);
      });
    }
    return () => {
      cancelled = true;
      if (u) URL.revokeObjectURL(u);
    };
  }, [asset.id, asset.mime, getAssetBlob]);

  return (
    <div className="group relative overflow-hidden rounded-xl border border-ink-700 bg-ink-850">
      <div className="grid aspect-square place-items-center overflow-hidden">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={asset.name} className="h-full w-full object-contain p-1.5" />
        ) : (
          <span className="text-2xl opacity-50">{asset.kind === 'font' ? 'Aa' : '▦'}</span>
        )}
      </div>
      <div className="truncate border-t border-ink-800 px-2 py-1.5 text-[10px] text-ink-500">
        {asset.name} · {formatBytes(asset.size)}
      </div>
      <button
        className="absolute right-1.5 top-1.5 hidden rounded-lg bg-black/70 px-2 py-1 text-xs text-red-300 group-hover:block"
        onClick={() => void removeAsset(asset.id)}
        title="Remove asset"
      >
        ✕
      </button>
    </div>
  );
}
