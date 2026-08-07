'use client';

import { useEffect, useMemo, useState } from 'react';
import { EmptyState, Modal, PageHeader, formatAgo, formatBytes } from '@/components/ui';
import { VideoThumb } from '@/components/gallery/VideoThumb';
import { stageLastFrame } from '@/lib/editor/extend';
import { DEFAULT_NEGATIVE_PROMPT } from '@/lib/comfy/buildWorkflow';
import type { GalleryItem } from '@/lib/db';
import { useBrandStore } from '@/lib/stores/useBrandStore';
import { useGalleryStore } from '@/lib/stores/useGalleryStore';
import { useJobStore } from '@/lib/stores/useJobStore';

function Lightbox({ item, onClose }: { item: GalleryItem; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [extendState, setExtendState] = useState<'idle' | 'working' | 'queued' | 'error'>('idle');
  const { getObjectUrl, remove, toggleFavorite } = useGalleryStore();
  const enqueue = useJobStore((s) => s.enqueue);

  // Continue this shot from its final frame (image-to-video), Kling-style.
  const extend = async () => {
    setExtendState('working');
    try {
      const frame = await stageLastFrame(item.id);
      enqueue({
        prompt: `${item.prompt}, seamless continuation of the previous shot, consistent scene and lighting`,
        negativePrompt: item.negativePrompt || DEFAULT_NEGATIVE_PROMPT,
        mode: 'i2v',
        stagedImageId: frame.stagedImageId,
        imageStrength: 0.95,
        width: item.width,
        height: item.height,
        durationSeconds: item.durationSeconds,
        fps: item.fps,
        steps: 25,
        cfg: 3,
        seed: (Math.floor(Math.random() * 2 ** 32)) >>> 0,
        brandKitId: item.brandKitId,
        brandKitName: item.brandKitName,
        campaignLabel: 'Extended shot',
      });
      setExtendState('queued');
      setTimeout(() => setExtendState('idle'), 3000);
    } catch {
      setExtendState('error');
      setTimeout(() => setExtendState('idle'), 3000);
    }
  };

  useEffect(() => {
    let u: string | null = null;
    void getObjectUrl(item.id).then((res) => {
      u = res;
      setUrl(res);
    });
    return () => {
      if (u) URL.revokeObjectURL(u);
    };
  }, [item.id, getObjectUrl]);

  const download = () => {
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    const ext = item.mime.includes('mp4') ? 'mp4' : item.mime.split('/')[1] ?? 'bin';
    a.download = `frameforge-${item.id.slice(0, 8)}.${ext}`;
    a.click();
  };

  return (
    <Modal open onClose={onClose} title={item.campaignLabel ?? 'Render'} wide>
      {url &&
        (item.mime.startsWith('video/') ? (
          <video src={url} className="w-full rounded-xl" controls autoPlay loop playsInline />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={item.prompt} className="w-full rounded-xl" />
        ))}
      <p className="mt-4 text-sm leading-relaxed text-ink-300">{item.prompt}</p>
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-ink-500">
        <span className="chip border border-ink-700 bg-ink-850">
          {item.width}×{item.height}
        </span>
        <span className="chip border border-ink-700 bg-ink-850">{item.durationSeconds}s @ {item.fps}fps</span>
        <span className="chip border border-ink-700 bg-ink-850">seed {item.seed}</span>
        <span className="chip border border-ink-700 bg-ink-850">{formatBytes(item.size)}</span>
        {item.brandKitName && (
          <span className="chip border border-brand-600/50 bg-brand-600/15 text-brand-400">
            {item.brandKitName}
          </span>
        )}
        <span className="chip border border-ink-700 bg-ink-850">{formatAgo(item.createdAt)}</span>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <button className="btn-primary" onClick={download} disabled={!url}>
          ↓ Download
        </button>
        <button className="btn-secondary" onClick={() => void toggleFavorite(item.id)}>
          {item.favorite ? '★ Unfavorite' : '☆ Favorite'}
        </button>
        <button
          className="btn-secondary"
          onClick={() => void extend()}
          disabled={extendState === 'working'}
          title="Generate a new clip that continues from this clip's last frame"
        >
          {extendState === 'working'
            ? '…'
            : extendState === 'queued'
              ? '✓ Queued'
              : extendState === 'error'
                ? 'Could not read clip'
                : '⏩ Extend'}
        </button>
        <button
          className="btn-danger ml-auto"
          onClick={() => {
            void remove(item.id);
            onClose();
          }}
        >
          Delete
        </button>
      </div>
    </Modal>
  );
}

export default function GalleryPage() {
  const { items, loaded, refresh } = useGalleryStore();
  const { kits, refresh: refreshBrands, loaded: brandsLoaded } = useBrandStore();
  const [filterKit, setFilterKit] = useState<string>('all');
  const [favesOnly, setFavesOnly] = useState(false);
  const [openItem, setOpenItem] = useState<GalleryItem | null>(null);

  useEffect(() => {
    if (!loaded) void refresh();
    if (!brandsLoaded) void refreshBrands();
  }, [loaded, refresh, brandsLoaded, refreshBrands]);

  const filtered = useMemo(
    () =>
      items.filter(
        (i) =>
          (filterKit === 'all' || i.brandKitId === filterKit) &&
          (!favesOnly || i.favorite)
      ),
    [items, filterKit, favesOnly]
  );

  // Keep the lightbox item fresh (favorite toggles).
  const liveOpenItem = openItem ? items.find((i) => i.id === openItem.id) ?? null : null;

  return (
    <div>
      <PageHeader
        title="Gallery"
        subtitle="Every render lives in your browser's IndexedDB — nothing is uploaded anywhere."
        actions={
          <>
            <select
              className="input !w-auto"
              value={filterKit}
              onChange={(e) => setFilterKit(e.target.value)}
            >
              <option value="all">All brands</option>
              {kits.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </select>
            <button
              className={favesOnly ? 'btn-primary' : 'btn-secondary'}
              onClick={() => setFavesOnly((v) => !v)}
            >
              ★
            </button>
          </>
        }
      />

      {loaded && filtered.length === 0 ? (
        <EmptyState
          icon="▣"
          title={items.length === 0 ? 'No renders yet' : 'Nothing matches this filter'}
          body={
            items.length === 0
              ? 'Generate your first clip in the Studio, or batch a whole content pack from your brand kit.'
              : 'Try clearing the brand or favorites filter.'
          }
        />
      ) : (
        <div className="columns-2 gap-3 sm:columns-3 lg:columns-4 [&>*]:mb-3">
          {filtered.map((item) => (
            <VideoThumb key={item.id} item={item} onOpen={setOpenItem} />
          ))}
        </div>
      )}

      {liveOpenItem && <Lightbox item={liveOpenItem} onClose={() => setOpenItem(null)} />}
    </div>
  );
}
