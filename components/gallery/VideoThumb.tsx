'use client';

import { useEffect, useState } from 'react';
import type { GalleryItem } from '@/lib/db';
import { useGalleryStore } from '@/lib/stores/useGalleryStore';

export function VideoThumb({
  item,
  compact,
  onOpen,
}: {
  item: GalleryItem;
  compact?: boolean;
  onOpen?: (item: GalleryItem) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const getObjectUrl = useGalleryStore((s) => s.getObjectUrl);

  useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;
    void getObjectUrl(item.id).then((u) => {
      if (cancelled) {
        if (u) URL.revokeObjectURL(u);
        return;
      }
      revoked = u;
      setUrl(u);
    });
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [item.id, getObjectUrl]);

  const isVideo = item.mime.startsWith('video/');

  return (
    <button
      type="button"
      onClick={() => onOpen?.(item)}
      className="card group relative block w-full overflow-hidden text-left transition hover:border-brand-500/60"
      style={{ aspectRatio: `${item.width} / ${item.height}` }}
    >
      {url ? (
        isVideo ? (
          <video
            src={url}
            className="h-full w-full object-cover"
            muted
            loop
            playsInline
            preload="metadata"
            onMouseEnter={(e) => void (e.target as HTMLVideoElement).play().catch(() => undefined)}
            onMouseLeave={(e) => {
              const v = e.target as HTMLVideoElement;
              v.pause();
              v.currentTime = 0;
            }}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={item.prompt} className="h-full w-full object-cover" />
        )
      ) : (
        <div className="h-full w-full animate-pulse bg-ink-800" />
      )}
      {!compact && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-2.5 pt-8">
          {item.campaignLabel && (
            <div className="text-[11px] font-semibold text-accent-400">{item.campaignLabel}</div>
          )}
          <div className="line-clamp-2 text-xs text-ink-200">{item.prompt}</div>
        </div>
      )}
      {item.favorite && (
        <span className="absolute right-2 top-2 text-sm drop-shadow">★</span>
      )}
    </button>
  );
}
