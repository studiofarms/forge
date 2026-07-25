'use client';

// The visual timeline: proportional clip blocks with crossfade wedges, a text
// overlay marker row, a seconds ruler and a draggable playhead.

import { useRef } from 'react';
import {
  clipDuration,
  clipStarts,
  effectiveCrossfade,
  projectDuration,
  type Project,
} from '@/lib/editor/timeline';

const PPS = 48; // pixels per second

export function TimelineStrip({
  project,
  selectedClipId,
  playhead,
  onSelect,
  onSeek,
}: {
  project: Project;
  selectedClipId: string | null;
  playhead: number;
  onSelect: (clipId: string) => void;
  onSeek: (t: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const duration = projectDuration(project);
  const starts = clipStarts(project);
  const width = Math.max(240, duration * PPS + 24);

  function seekFromEvent(e: React.MouseEvent) {
    const box = scrollRef.current;
    if (!box) return;
    const rect = box.getBoundingClientRect();
    const x = e.clientX - rect.left + box.scrollLeft;
    onSeek(Math.max(0, Math.min(duration, x / PPS)));
  }

  return (
    <div
      ref={scrollRef}
      className="card overflow-x-auto p-3"
      onDoubleClick={seekFromEvent}
    >
      <div className="relative" style={{ width }}>
        {/* Ruler */}
        <div
          className="relative mb-1 h-5 cursor-pointer select-none"
          onMouseDown={seekFromEvent}
          title="Click to move the playhead"
        >
          {Array.from({ length: Math.floor(duration) + 1 }, (_, s) => (
            <span
              key={s}
              className="absolute top-0 border-l border-ink-700 pl-1 font-mono text-[10px] text-ink-500"
              style={{ left: s * PPS }}
            >
              {s}s
            </span>
          ))}
        </div>

        {/* Clip row */}
        <div className="relative h-16">
          {project.clips.map((clip, i) => {
            const fade = effectiveCrossfade(project, i);
            const selected = clip.id === selectedClipId;
            return (
              <button
                key={clip.id}
                type="button"
                onClick={() => onSelect(clip.id)}
                className={`absolute top-0 h-16 overflow-hidden rounded-lg border text-left transition ${
                  selected
                    ? 'z-10 border-brand-400 bg-brand-950/70 shadow-lg shadow-brand-600/20'
                    : 'border-ink-600 bg-ink-800 hover:border-ink-400'
                }`}
                style={{ left: starts[i] * PPS, width: Math.max(20, clipDuration(clip) * PPS) }}
                title={clip.label}
              >
                <span className="block truncate px-2 pt-1.5 text-[11px] font-semibold text-ink-100">
                  {i + 1}. {clip.label}
                </span>
                <span className="block px-2 font-mono text-[10px] text-ink-500">
                  {clipDuration(clip).toFixed(1)}s
                  {clip.inPoint > 0 || clip.outPoint < clip.sourceDuration ? ' ✂' : ''}
                </span>
                {fade > 0 && (
                  <span
                    className="absolute bottom-0 right-0 top-0 bg-gradient-to-r from-transparent to-accent-500/40"
                    style={{ width: fade * PPS }}
                    title={`Crossfade ${fade.toFixed(1)}s`}
                  />
                )}
              </button>
            );
          })}
          {!project.clips.length && (
            <div className="grid h-full place-items-center text-xs text-ink-500">
              Add clips from the left to start your timeline
            </div>
          )}
        </div>

        {/* Overlay marker row */}
        {project.overlays.length > 0 && (
          <div className="relative mt-1 h-5">
            {project.overlays.map((o) => (
              <span
                key={o.id}
                className="absolute top-0 flex h-5 items-center overflow-hidden truncate rounded bg-accent-950/80 px-1.5 text-[10px] text-accent-300"
                style={{ left: o.start * PPS, width: Math.max(16, (o.end - o.start) * PPS) }}
                title={o.text}
              >
                T {o.text}
              </span>
            ))}
          </div>
        )}

        {/* Playhead */}
        {duration > 0 && (
          <div
            className="pointer-events-none absolute -top-1 bottom-0 z-20 w-px bg-red-400"
            style={{ left: Math.min(playhead, duration) * PPS }}
          >
            <span className="absolute -left-[5px] -top-1 h-0 w-0 border-x-[5px] border-t-[6px] border-x-transparent border-t-red-400" />
          </div>
        )}
      </div>
    </div>
  );
}
