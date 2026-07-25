'use client';

// Left rail of the editor: every gallery video, one tap to append it to the
// timeline. Durations come from gallery metadata, verified against the real
// blob on add (encoded files can differ slightly from the requested length).

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { VideoThumb } from '@/components/gallery/VideoThumb';
import { EmptyState } from '@/components/ui';
import { isEditableMime, probeDuration } from '@/lib/editor/media';
import { useEditorStore } from '@/lib/stores/useEditorStore';
import { useGalleryStore } from '@/lib/stores/useGalleryStore';

export function ClipBin() {
  const items = useGalleryStore((s) => s.items);
  const loaded = useGalleryStore((s) => s.loaded);
  const refresh = useGalleryStore((s) => s.refresh);
  const addGalleryClip = useEditorStore((s) => s.addGalleryClip);
  const [adding, setAdding] = useState<string | null>(null);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const videos = items.filter((i) => isEditableMime(i.mime));

  async function add(id: string, label: string, metaDuration: number) {
    setAdding(id);
    try {
      const real = await probeDuration(id);
      addGalleryClip(id, label, real ?? Math.max(0.5, metaDuration));
    } finally {
      setAdding(null);
    }
  }

  if (loaded && !videos.length) {
    return (
      <EmptyState
        icon="▣"
        title="No clips yet"
        body="Generate some videos first — everything in your gallery shows up here, ready to cut together."
        action={
          <Link href="/generate/" className="btn btn-primary">
            Make some clips
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-500">Tap a clip to add it to the timeline.</p>
      {videos.map((item) => (
        <div key={item.id} className="relative">
          <VideoThumb
            item={item}
            compact
            onOpen={() =>
              void add(item.id, item.campaignLabel || item.prompt.slice(0, 40), item.durationSeconds)
            }
          />
          {adding === item.id && (
            <span className="chip absolute bottom-2 right-2 border border-brand-500 bg-ink-900/80 text-brand-300">
              adding…
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
