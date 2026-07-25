import { describe, expect, it } from 'vitest';
import {
  addClip,
  clipStarts,
  effectiveCrossfade,
  emptyProject,
  MIN_CLIP_SECONDS,
  moveClip,
  overlaysAt,
  projectDuration,
  removeClip,
  removeOverlay,
  segmentsAt,
  setTransition,
  splitAt,
  trimClip,
  upsertOverlay,
  type Project,
} from '../lib/editor/timeline';

function projectWith(durations: number[]): Project {
  let p = emptyProject();
  durations.forEach((d, i) => {
    p = addClip(p, { id: `c${i}`, galleryId: `g${i}`, label: `Clip ${i}`, sourceDuration: d });
  });
  return p;
}

describe('timeline basics', () => {
  it('an empty project has zero duration and no segments', () => {
    const p = emptyProject();
    expect(projectDuration(p)).toBe(0);
    expect(segmentsAt(p, 0)).toEqual([]);
  });

  it('clips are appended untrimmed and butt-joined', () => {
    const p = projectWith([4, 6]);
    expect(clipStarts(p)).toEqual([0, 4]);
    expect(projectDuration(p)).toBe(10);
  });

  it('segmentsAt maps timeline time into source time via inPoint', () => {
    let p = projectWith([4, 6]);
    p = trimClip(p, 'c1', 2, 5);
    // c0: 0-4 on timeline; c1: 4-7 on timeline, source window 2-5.
    const seg = segmentsAt(p, 5.5);
    expect(seg).toHaveLength(1);
    expect(seg[0].index).toBe(1);
    expect(seg[0].sourceTime).toBeCloseTo(3.5);
    expect(seg[0].alpha).toBe(1);
  });

  it('time outside the project yields no segments', () => {
    const p = projectWith([4]);
    expect(segmentsAt(p, 4.01)).toEqual([]);
    expect(segmentsAt(p, -0.5)).toEqual([]);
  });
});

describe('trim and reorder', () => {
  it('trim clamps to the source and enforces a minimum length', () => {
    let p = projectWith([4]);
    p = trimClip(p, 'c0', -2, 99);
    expect(p.clips[0].inPoint).toBe(0);
    expect(p.clips[0].outPoint).toBe(4);
    p = trimClip(p, 'c0', 3.95, 4);
    expect(p.clips[0].outPoint - p.clips[0].inPoint).toBeGreaterThanOrEqual(MIN_CLIP_SECONDS);
  });

  it('moveClip swaps neighbours and ignores out-of-range moves', () => {
    let p = projectWith([1, 2, 3]);
    p = moveClip(p, 'c2', -1);
    expect(p.clips.map((c) => c.id)).toEqual(['c0', 'c2', 'c1']);
    p = moveClip(p, 'c0', -1);
    expect(p.clips.map((c) => c.id)).toEqual(['c0', 'c2', 'c1']);
  });

  it('removeClip drops the clip and shortens the project', () => {
    let p = projectWith([4, 6]);
    p = removeClip(p, 'c0');
    expect(projectDuration(p)).toBe(6);
    expect(clipStarts(p)).toEqual([0]);
  });
});

describe('crossfades', () => {
  it('a crossfade overlaps the pair and shortens the total', () => {
    let p = projectWith([4, 6]);
    p = setTransition(p, 'c0', 'crossfade');
    p.crossfadeSeconds = 1;
    expect(effectiveCrossfade(p, 0)).toBe(1);
    expect(clipStarts(p)).toEqual([0, 3]);
    expect(projectDuration(p)).toBe(9);
  });

  it('the crossfade never exceeds half of either neighbour', () => {
    let p = projectWith([0.6, 6]);
    p = setTransition(p, 'c0', 'crossfade');
    p.crossfadeSeconds = 2;
    expect(effectiveCrossfade(p, 0)).toBeCloseTo(0.3);
  });

  it('inside the overlap both clips are visible with ramping alphas', () => {
    let p = projectWith([4, 6]);
    p = setTransition(p, 'c0', 'crossfade');
    p.crossfadeSeconds = 1;
    // Overlap runs 3..4 on the timeline.
    const seg = segmentsAt(p, 3.5);
    expect(seg).toHaveLength(2);
    expect(seg[0].index).toBe(0);
    expect(seg[0].alpha).toBeCloseTo(0.5);
    expect(seg[1].index).toBe(1);
    expect(seg[1].alpha).toBeCloseTo(0.5);
    // Just before the overlap only the first clip shows, fully opaque.
    const before = segmentsAt(p, 2.9);
    expect(before).toHaveLength(1);
    expect(before[0].alpha).toBe(1);
  });
});

describe('split', () => {
  it('splits the clip under the playhead into two contiguous clips', () => {
    let p = projectWith([4, 6]);
    p = splitAt(p, 5.5, 'new');
    expect(p.clips.map((c) => c.id)).toEqual(['c0', 'c1', 'new']);
    expect(p.clips[1].outPoint).toBeCloseTo(1.5);
    expect(p.clips[2].inPoint).toBeCloseTo(1.5);
    expect(projectDuration(p)).toBe(10);
  });

  it('refuses to split too close to a clip edge', () => {
    const p = projectWith([4]);
    expect(splitAt(p, 0.05, 'new')).toBe(p);
    expect(splitAt(p, 3.95, 'new')).toBe(p);
  });

  it('a split preserves total duration even with trims applied', () => {
    let p = projectWith([8]);
    p = trimClip(p, 'c0', 1, 7);
    const before = projectDuration(p);
    p = splitAt(p, 3, 'new');
    expect(projectDuration(p)).toBeCloseTo(before);
    expect(p.clips[0].outPoint).toBeCloseTo(4); // source time: inPoint 1 + local 3
  });
});

describe('overlays', () => {
  it('upsert adds then replaces by id and normalizes the window', () => {
    let p = emptyProject();
    p = upsertOverlay(p, {
      id: 'o1', text: 'Hi', start: -1, end: -5,
      position: 'bottom', size: 'md', color: '#ffffff', backing: true,
    });
    expect(p.overlays[0].start).toBe(0);
    expect(p.overlays[0].end).toBeGreaterThan(0);
    p = upsertOverlay(p, { ...p.overlays[0], text: 'Hello' });
    expect(p.overlays).toHaveLength(1);
    expect(p.overlays[0].text).toBe('Hello');
  });

  it('overlaysAt returns only overlays covering t', () => {
    let p = emptyProject();
    p = upsertOverlay(p, {
      id: 'o1', text: 'A', start: 0, end: 2,
      position: 'top', size: 'sm', color: '#fff', backing: false,
    });
    p = upsertOverlay(p, {
      id: 'o2', text: 'B', start: 1, end: 3,
      position: 'bottom', size: 'lg', color: '#fff', backing: false,
    });
    expect(overlaysAt(p, 1.5).map((o) => o.id)).toEqual(['o1', 'o2']);
    expect(overlaysAt(p, 2.5).map((o) => o.id)).toEqual(['o2']);
    p = removeOverlay(p, 'o2');
    expect(overlaysAt(p, 2.5)).toEqual([]);
  });
});
