'use client';

// Editor store: the timeline Project persists to localStorage (it only holds
// gallery ids + settings). Media blobs (gallery videos, logo image, music file)
// are resolved at runtime — music is kept in memory only and must be re-picked
// after a reload.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { newId } from '../db';
import {
  addClip,
  emptyProject,
  moveClip,
  removeClip,
  removeOverlay,
  setTransition,
  splitAt,
  trimClip,
  upsertOverlay,
  type LogoOverlay,
  type MusicSettings,
  type Project,
  type TextOverlay,
  type TransitionKind,
} from '../editor/timeline';

interface EditorState {
  project: Project;
  selectedClipId: string | null;
  /** In-memory only. */
  musicBlob: Blob | null;

  setProject(project: Project): void;
  resetProject(): void;
  select(clipId: string | null): void;

  addGalleryClip(galleryId: string, label: string, sourceDuration: number): void;
  removeClip(clipId: string): void;
  moveClip(clipId: string, delta: -1 | 1): void;
  trimClip(clipId: string, inPoint: number, outPoint: number): void;
  setTransition(clipId: string, t: TransitionKind): void;
  splitAtTime(t: number): void;

  upsertOverlay(overlay: TextOverlay): void;
  removeOverlay(overlayId: string): void;
  newOverlay(atTime: number): TextOverlay;

  setLogo(patch: Partial<LogoOverlay>): void;
  setMusic(settings: MusicSettings | null, blob: Blob | null): void;
  setOutput(patch: Partial<Pick<Project, 'width' | 'height' | 'fps' | 'filter' | 'crossfadeSeconds'>>): void;
}

export const useEditorStore = create<EditorState>()(
  persist(
    (set, get) => ({
      project: emptyProject(),
      selectedClipId: null,
      musicBlob: null,

      setProject(project) {
        set({ project });
      },
      resetProject() {
        set({ project: emptyProject(), selectedClipId: null, musicBlob: null });
      },
      select(clipId) {
        set({ selectedClipId: clipId });
      },

      addGalleryClip(galleryId, label, sourceDuration) {
        const id = newId();
        set((s) => ({
          project: addClip(s.project, { id, galleryId, label, sourceDuration }),
          selectedClipId: id,
        }));
      },
      removeClip(clipId) {
        set((s) => ({
          project: removeClip(s.project, clipId),
          selectedClipId: s.selectedClipId === clipId ? null : s.selectedClipId,
        }));
      },
      moveClip(clipId, delta) {
        set((s) => ({ project: moveClip(s.project, clipId, delta) }));
      },
      trimClip(clipId, inPoint, outPoint) {
        set((s) => ({ project: trimClip(s.project, clipId, inPoint, outPoint) }));
      },
      setTransition(clipId, t) {
        set((s) => ({ project: setTransition(s.project, clipId, t) }));
      },
      splitAtTime(t) {
        set((s) => ({ project: splitAt(s.project, t, newId()) }));
      },

      upsertOverlay(overlay) {
        set((s) => ({ project: upsertOverlay(s.project, overlay) }));
      },
      removeOverlay(overlayId) {
        set((s) => ({ project: removeOverlay(s.project, overlayId) }));
      },
      newOverlay(atTime) {
        const overlay: TextOverlay = {
          id: newId(),
          text: 'Your text',
          start: Math.max(0, atTime),
          end: Math.max(0, atTime) + 2,
          position: 'lower-third',
          size: 'md',
          color: '#ffffff',
          backing: true,
        };
        get().upsertOverlay(overlay);
        return overlay;
      },

      setLogo(patch) {
        set((s) => ({ project: { ...s.project, logo: { ...s.project.logo, ...patch } } }));
      },
      setMusic(settings, blob) {
        set((s) => ({ project: { ...s.project, music: settings }, musicBlob: blob }));
      },
      setOutput(patch) {
        set((s) => ({ project: { ...s.project, ...patch } }));
      },
    }),
    {
      name: 'frameforge-editor',
      partialize: (s) => ({ project: { ...s.project, music: null } }),
    }
  )
);
