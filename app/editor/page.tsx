'use client';

// The Editor: cut gallery clips together on a timeline, add brand overlays and
// music, preview live on a canvas, and export a real MP4 — all local.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, PageHeader, ProgressBar } from '@/components/ui';
import { ClipBin } from '@/components/editor/ClipBin';
import { Inspector } from '@/components/editor/Inspector';
import { TimelineStrip } from '@/components/editor/TimelineStrip';
import { drawFrame, seekSources } from '@/lib/editor/render';
import { loadProjectMedia, type MediaHandle } from '@/lib/editor/media';
import {
  desktopFfmpegAvailable,
  exportProject,
  webCodecsSupported,
  type ExportProgress,
  type ExportResult,
} from '@/lib/editor/exporter';
import { projectDuration, segmentsAt } from '@/lib/editor/timeline';
import { saveGalleryVideo } from '@/lib/db';
import { useEditorStore } from '@/lib/stores/useEditorStore';
import { useGalleryStore } from '@/lib/stores/useGalleryStore';

export default function EditorPage() {
  const project = useEditorStore((s) => s.project);
  const selectedClipId = useEditorStore((s) => s.selectedClipId);
  const select = useEditorStore((s) => s.select);
  const splitAtTime = useEditorStore((s) => s.splitAtTime);
  const musicBlob = useEditorStore((s) => s.musicBlob);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRef = useRef<MediaHandle | null>(null);
  const projectRef = useRef(project);
  projectRef.current = project;

  const [mediaReady, setMediaReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const playingRef = useRef(false);
  const playheadRef = useRef(0);
  const [playhead, setPlayhead] = useState(0);

  const duration = projectDuration(project);

  // ── Load / reload media when the referenced blobs change ──────────────────
  const mediaKey =
    project.clips.map((c) => c.galleryId).join(',') +
    '|' + (project.logo.enabled ? project.logo.assetId ?? '' : '');
  useEffect(() => {
    let cancelled = false;
    setMediaReady(false);
    void loadProjectMedia(projectRef.current).then((handle) => {
      if (cancelled) {
        handle.dispose();
        return;
      }
      mediaRef.current?.dispose();
      mediaRef.current = handle;
      setMediaReady(true);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaKey]);

  useEffect(
    () => () => {
      mediaRef.current?.dispose();
      mediaRef.current = null;
    },
    []
  );

  // ── Paused: seek exactly and draw once (also re-draws on any edit) ────────
  useEffect(() => {
    if (playing || !mediaReady) return;
    const ctx = canvasRef.current?.getContext('2d');
    const media = mediaRef.current;
    if (!ctx || !media) return;
    let cancelled = false;
    void (async () => {
      await seekSources(project, media, playhead);
      if (!cancelled) drawFrame(ctx, project, media, playhead);
    })();
    return () => {
      cancelled = true;
    };
  }, [project, playhead, playing, mediaReady]);

  // ── Play loop ─────────────────────────────────────────────────────────────
  const stop = useCallback(() => {
    playingRef.current = false;
    setPlaying(false);
    const media = mediaRef.current;
    if (media) for (const s of media.sources.values()) s.idle();
  }, []);

  const play = useCallback(() => {
    if (!mediaReady || projectDuration(projectRef.current) <= 0) return;
    if (playheadRef.current >= projectDuration(projectRef.current) - 0.05) {
      playheadRef.current = 0;
    }
    playingRef.current = true;
    setPlaying(true);
    let last = performance.now();
    const tick = (now: number) => {
      if (!playingRef.current) return;
      const p = projectRef.current;
      const media = mediaRef.current;
      const ctx = canvasRef.current?.getContext('2d');
      const total = projectDuration(p);
      let t = playheadRef.current + (now - last) / 1000;
      last = now;
      if (t >= total) {
        playheadRef.current = total;
        setPlayhead(total);
        stop();
        return;
      }
      playheadRef.current = t;
      setPlayhead(t);
      if (media && ctx) {
        const segs = segmentsAt(p, t);
        const activeIds = new Set(segs.map((s) => p.clips[s.index].galleryId));
        for (const seg of segs) {
          media.sources.get(p.clips[seg.index].galleryId)?.sync(seg.sourceTime);
        }
        for (const [id, source] of media.sources) {
          if (!activeIds.has(id)) source.idle();
        }
        drawFrame(ctx, p, media, t);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [mediaReady, stop]);

  const seek = useCallback(
    (t: number) => {
      playheadRef.current = t;
      setPlayhead(t);
    },
    []
  );

  // ── Export ────────────────────────────────────────────────────────────────
  const [exportOpen, setExportOpen] = useState(false);
  const [ffmpegAvail, setFfmpegAvail] = useState(false);
  const [useFfmpeg, setUseFfmpeg] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    if (!exportOpen) return;
    setResult(null);
    setExportError(null);
    setProgress(null);
    void desktopFfmpegAvailable().then((ok) => {
      setFfmpegAvail(ok);
      setUseFfmpeg(ok);
    });
  }, [exportOpen]);

  useEffect(
    () => () => {
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    },
    [resultUrl]
  );

  async function runExport() {
    stop();
    setExportError(null);
    setResult(null);
    setProgress({ value: 0, stage: 'preparing' });
    try {
      const res = await exportProject(projectRef.current, musicBlob, {
        useFfmpeg,
        onProgress: setProgress,
      });
      const p = projectRef.current;
      await saveGalleryVideo(
        {
          prompt: 'Edited in the FrameForge Editor',
          negativePrompt: '',
          mode: 't2v',
          width: p.width,
          height: p.height,
          durationSeconds: Math.round(res.durationSeconds * 10) / 10,
          fps: p.fps,
          seed: 0,
          campaignLabel: 'Editor export',
          mime: 'video/mp4',
        },
        res.blob
      );
      void useGalleryStore.getState().refresh();
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      setResultUrl(URL.createObjectURL(res.blob));
      setResult(res);
      setProgress(null);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : String(e));
      setProgress(null);
    }
  }

  const stageLabel: Record<ExportProgress['stage'], string> = {
    preparing: 'Loading clips…',
    audio: 'Rendering music…',
    video: 'Rendering frames…',
    finalizing: 'Packaging MP4…',
    ffmpeg: 'FFmpeg compatibility pass…',
  };

  return (
    <>
      <PageHeader
        title="Editor"
        subtitle="Cut your generated clips together, add brand text, logo and music, and export a finished MP4 — everything stays on this device."
        actions={
          <button
            type="button"
            className="btn btn-primary"
            disabled={!project.clips.length}
            onClick={() => setExportOpen(true)}
          >
            Export video
          </button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)_300px]">
        {/* Clip bin */}
        <div className="max-h-[75vh] overflow-y-auto pr-1">
          <ClipBin />
        </div>

        {/* Preview + transport + timeline */}
        <div className="space-y-3">
          <div className="card grid place-items-center overflow-hidden bg-black/60 p-2">
            <canvas
              ref={canvasRef}
              width={project.width}
              height={project.height}
              className="max-h-[52vh] w-auto max-w-full rounded"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn btn-primary !px-5"
              disabled={!mediaReady || !project.clips.length}
              onClick={() => (playing ? stop() : play())}
            >
              {playing ? '❚❚ Pause' : '▶ Play'}
            </button>
            <span className="font-mono text-sm text-ink-300">
              {playhead.toFixed(1)}s / {duration.toFixed(1)}s
            </span>
            <input
              type="range"
              className="min-w-32 flex-1"
              min={0}
              max={Math.max(0.1, duration)}
              step={0.05}
              value={Math.min(playhead, duration)}
              onChange={(e) => {
                stop();
                seek(Number(e.target.value));
              }}
            />
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!project.clips.length}
              onClick={() => splitAtTime(playheadRef.current)}
              title="Split the clip under the playhead"
            >
              ✂ Split
            </button>
          </div>

          <TimelineStrip
            project={project}
            selectedClipId={selectedClipId}
            playhead={playhead}
            onSelect={select}
            onSeek={(t) => {
              stop();
              seek(t);
            }}
          />
        </div>

        {/* Inspector */}
        <div className="max-h-[75vh] overflow-y-auto pr-1">
          <Inspector project={project} playhead={playhead} />
        </div>
      </div>

      {/* Export modal */}
      <Modal open={exportOpen} onClose={() => !progress && setExportOpen(false)} title="Export video">
        {!webCodecsSupported() ? (
          <p className="text-sm text-ink-300">
            This browser can&apos;t encode video. Use the desktop app or a Chromium-based
            browser (Chrome / Edge).
          </p>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-ink-400">
              {project.width}×{project.height} · {project.fps} fps · {duration.toFixed(1)}s
              {project.music ? ' · music' : ''} — saved to your Gallery and downloadable.
            </p>
            {project.music && !musicBlob && (
              <p className="rounded-lg border border-amber-800/60 bg-amber-950/40 p-2 text-xs text-amber-300">
                The music file isn&apos;t loaded (files aren&apos;t kept across reloads) — re-pick it
                in the Music panel, or export continues without sound.
              </p>
            )}
            {ffmpegAvail && (
              <button
                type="button"
                className={`chip border ${useFfmpeg ? 'border-brand-500 text-brand-300' : 'border-ink-700 text-ink-400'}`}
                onClick={() => setUseFfmpeg((v) => !v)}
              >
                FFmpeg max-compatibility pass {useFfmpeg ? 'on' : 'off'}
              </button>
            )}
            {progress ? (
              <div className="space-y-2">
                <ProgressBar value={progress.value} />
                <p className="text-xs text-ink-400">{stageLabel[progress.stage]}</p>
              </div>
            ) : result && resultUrl ? (
              <div className="space-y-3">
                <p className="text-sm text-emerald-300">
                  Done — saved to your Gallery{result.usedFfmpeg ? ' (FFmpeg pass applied)' : ''}
                  {result.audio === 'none' && project.music ? ', without audio' : ''}.
                </p>
                <a
                  href={resultUrl}
                  download="frameforge-edit.mp4"
                  className="btn btn-primary block text-center"
                >
                  Download MP4
                </a>
              </div>
            ) : (
              <button type="button" className="btn btn-primary w-full" onClick={() => void runExport()}>
                Start export
              </button>
            )}
            {exportError && (
              <p className="rounded-lg border border-red-800/60 bg-red-950/40 p-2 text-xs text-red-300">
                {exportError}
              </p>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
