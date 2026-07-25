'use client';

// Export engine. Renders the timeline deterministically frame-by-frame through
// the same drawFrame() the preview uses, encodes with WebCodecs, muxes to MP4
// (mp4-muxer). Music renders through an OfflineAudioContext (volume + fades)
// and encodes as AAC, falling back to Opus, falling back to silent video.
// In the desktop app an optional FFmpeg pass re-encodes the result for
// maximum social-platform compatibility.

import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import { drawFrame, seekSources } from './render';
import { loadProjectMedia } from './media';
import { projectDuration, type Project } from './timeline';

export interface ExportProgress {
  /** 0..1 across the whole export. */
  value: number;
  stage: 'preparing' | 'audio' | 'video' | 'finalizing' | 'ffmpeg';
}

export interface ExportResult {
  blob: Blob;
  durationSeconds: number;
  usedFfmpeg: boolean;
  audio: 'aac' | 'opus' | 'none';
}

// Exposed by electron/preload.js in the desktop app.
declare global {
  interface Window {
    frameforgeDesktop?: {
      ffmpegAvailable(): Promise<boolean>;
      ffmpegFinalize(mp4: ArrayBuffer): Promise<ArrayBuffer | null>;
    };
  }
}

export function webCodecsSupported(): boolean {
  return typeof window !== 'undefined' && 'VideoEncoder' in window;
}

export async function desktopFfmpegAvailable(): Promise<boolean> {
  try {
    return (await window.frameforgeDesktop?.ffmpegAvailable()) ?? false;
  } catch {
    return false;
  }
}

const AVC_CANDIDATES = ['avc1.640029', 'avc1.4d0029', 'avc1.42e01f'];

async function pickVideoCodec(width: number, height: number, fps: number): Promise<string> {
  for (const codec of AVC_CANDIDATES) {
    const support = await VideoEncoder.isConfigSupported({
      codec,
      width,
      height,
      framerate: fps,
      bitrate: 8_000_000,
    });
    if (support.supported) return codec;
  }
  throw new Error('This browser cannot encode H.264 video — try the desktop app.');
}

async function renderMusicBuffer(
  project: Project,
  musicBlob: Blob,
  duration: number
): Promise<AudioBuffer> {
  const sampleRate = 48000;
  const off = new OfflineAudioContext(2, Math.ceil(duration * sampleRate), sampleRate);
  const decoded = await off.decodeAudioData(await musicBlob.arrayBuffer());
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.loop = decoded.duration < duration;
  const gain = off.createGain();
  const settings = project.music!;
  const vol = Math.min(1.5, Math.max(0, settings.volume));
  const fadeIn = Math.min(settings.fadeInSeconds, duration / 2);
  const fadeOut = Math.min(settings.fadeOutSeconds, duration / 2);
  gain.gain.setValueAtTime(fadeIn > 0 ? 0.0001 : vol, 0);
  if (fadeIn > 0) gain.gain.linearRampToValueAtTime(vol, fadeIn);
  if (fadeOut > 0) {
    gain.gain.setValueAtTime(vol, duration - fadeOut);
    gain.gain.linearRampToValueAtTime(0.0001, duration);
  }
  src.connect(gain).connect(off.destination);
  src.start(0);
  return off.startRendering();
}

interface AudioPlan {
  kind: 'aac' | 'opus' | 'none';
  codecString: string;
}

async function pickAudioCodec(): Promise<AudioPlan> {
  if (typeof AudioEncoder === 'undefined') return { kind: 'none', codecString: '' };
  const base = { sampleRate: 48000, numberOfChannels: 2, bitrate: 192_000 };
  try {
    if ((await AudioEncoder.isConfigSupported({ codec: 'mp4a.40.2', ...base })).supported) {
      return { kind: 'aac', codecString: 'mp4a.40.2' };
    }
  } catch {
    /* fall through */
  }
  try {
    if ((await AudioEncoder.isConfigSupported({ codec: 'opus', ...base })).supported) {
      return { kind: 'opus', codecString: 'opus' };
    }
  } catch {
    /* fall through */
  }
  return { kind: 'none', codecString: '' };
}

export async function exportProject(
  project: Project,
  musicBlob: Blob | null,
  opts: {
    useFfmpeg: boolean;
    onProgress(p: ExportProgress): void;
  }
): Promise<ExportResult> {
  if (!webCodecsSupported()) {
    throw new Error('Video export needs a Chromium-based browser or the desktop app.');
  }
  const duration = projectDuration(project);
  if (duration <= 0) throw new Error('The timeline is empty — add clips first.');

  opts.onProgress({ value: 0, stage: 'preparing' });
  const media = await loadProjectMedia(project);
  try {
    const { width, height, fps } = project;
    const audioPlan = project.music && musicBlob ? await pickAudioCodec() : ({ kind: 'none', codecString: '' } as AudioPlan);

    const muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: { codec: 'avc', width, height },
      ...(audioPlan.kind !== 'none'
        ? {
            audio: {
              codec: audioPlan.kind === 'aac' ? 'aac' : 'opus',
              numberOfChannels: 2,
              sampleRate: 48000,
            },
          }
        : {}),
      fastStart: 'in-memory',
    });

    // ── Audio first (fast) ──────────────────────────────────────────────────
    if (audioPlan.kind !== 'none') {
      opts.onProgress({ value: 0.02, stage: 'audio' });
      const rendered = await renderMusicBuffer(project, musicBlob!, duration);
      const audioEncoder = new AudioEncoder({
        output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
        error: (e) => console.error('[export] audio encoder', e),
      });
      audioEncoder.configure({
        codec: audioPlan.codecString,
        sampleRate: 48000,
        numberOfChannels: 2,
        bitrate: 192_000,
      });
      const chunkFrames = 48000 / 10; // 100ms blocks
      const ch0 = rendered.getChannelData(0);
      const ch1 = rendered.getChannelData(1);
      for (let offset = 0; offset < rendered.length; offset += chunkFrames) {
        const frames = Math.min(chunkFrames, rendered.length - offset);
        const planar = new Float32Array(frames * 2);
        planar.set(ch0.subarray(offset, offset + frames), 0);
        planar.set(ch1.subarray(offset, offset + frames), frames);
        const data = new AudioData({
          format: 'f32-planar',
          sampleRate: 48000,
          numberOfFrames: frames,
          numberOfChannels: 2,
          timestamp: Math.round((offset / 48000) * 1e6),
          data: planar,
        });
        audioEncoder.encode(data);
        data.close();
      }
      await audioEncoder.flush();
      audioEncoder.close();
    }

    // ── Video frames ────────────────────────────────────────────────────────
    const codec = await pickVideoCodec(width, height, fps);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: false });
    if (!ctx) throw new Error('Could not create a drawing canvas.');

    let encoderError: Error | null = null;
    const videoEncoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (e) => {
        encoderError = e instanceof Error ? e : new Error(String(e));
      },
    });
    videoEncoder.configure({
      codec,
      width,
      height,
      framerate: fps,
      bitrate: Math.min(12_000_000, Math.round(width * height * fps * 0.12)),
    });

    const totalFrames = Math.max(1, Math.round(duration * fps));
    const frameMicros = Math.round(1e6 / fps);
    for (let n = 0; n < totalFrames; n++) {
      if (encoderError) throw encoderError;
      const t = n / fps;
      await seekSources(project, media, t);
      drawFrame(ctx, project, media, t);
      const frame = new VideoFrame(canvas, {
        timestamp: n * frameMicros,
        duration: frameMicros,
      });
      videoEncoder.encode(frame, { keyFrame: n % (fps * 2) === 0 });
      frame.close();
      // Backpressure so we don't queue hundreds of raw frames.
      while (videoEncoder.encodeQueueSize > 4) {
        await new Promise((r) => setTimeout(r, 5));
      }
      opts.onProgress({ value: 0.05 + 0.85 * (n / totalFrames), stage: 'video' });
    }
    await videoEncoder.flush();
    videoEncoder.close();
    if (encoderError) throw encoderError;

    opts.onProgress({ value: 0.92, stage: 'finalizing' });
    muxer.finalize();
    const buffer = (muxer.target as ArrayBufferTarget).buffer;
    let blob = new Blob([buffer], { type: 'video/mp4' });
    let usedFfmpeg = false;

    if (opts.useFfmpeg && window.frameforgeDesktop) {
      opts.onProgress({ value: 0.94, stage: 'ffmpeg' });
      try {
        const out = await window.frameforgeDesktop.ffmpegFinalize(buffer);
        if (out && out.byteLength > 0) {
          blob = new Blob([out], { type: 'video/mp4' });
          usedFfmpeg = true;
        }
      } catch (e) {
        console.warn('[export] ffmpeg pass failed, keeping WebCodecs output', e);
      }
    }

    opts.onProgress({ value: 1, stage: 'finalizing' });
    return { blob, durationSeconds: duration, usedFfmpeg, audio: audioPlan.kind };
  } finally {
    media.dispose();
  }
}
