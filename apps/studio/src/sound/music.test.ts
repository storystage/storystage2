import {
  exampleProduction,
  SOUND_LIMITS,
  withSceneMusic,
  withSound,
  type MusicCue,
  type Production,
  type SceneId,
} from '@storystage/production';
import { describe, expect, it } from 'vitest';
import { addCue, changeCue, cueFor, dragCue, removeCue, rulerStep } from './music.ts';
import { RAIN } from './testing.ts';

// The music timeline's cue changes (07-ux 7.7). Where each cue is heard is @storystage/sound's.

const p0 = withSound(exampleProduction(), RAIN);
const s1 = p0.manifest.runningOrder[0]!.scene;

const cue = (start: number, more: Partial<MusicCue> = {}): MusicCue => ({
  ...cueFor(RAIN, start),
  ...more,
});
const withCues = (scene: SceneId, cues: MusicCue[], p: Production = p0) =>
  withSceneMusic(p, scene, cues);

describe('the cue changes', () => {
  it('adds the whole trimmed sound at the playhead, at full volume, no fades or loop', () => {
    const added = addCue(p0, s1, RAIN, 4);
    if (!added.ok) throw new Error(added.reason);
    expect(added.production.scenes.find((s) => s.id === s1)!.music).toEqual([
      {
        sound: 'sn1',
        start: 4,
        from: 0,
        to: 3.5,
        fadeIn: 0,
        fadeOut: 0,
        loop: false,
        volume: 1,
        carriesOn: false,
      },
    ]);
    expect(added.index).toBe(0);
  });

  it('refuses a second cue at the same time, and a 21st', () => {
    const p = withCues(s1, [cue(4)]);
    expect(addCue(p, s1, RAIN, 4)).toEqual({ ok: false, reason: 'taken', at: 4 });
    const full = withCues(
      s1,
      Array.from({ length: SOUND_LIMITS.cues }, (_, i) => cue(i)),
    );
    expect(addCue(full, s1, RAIN, 30)).toEqual({ ok: false, reason: 'full' });
  });

  it('moves a cue and follows it into its new place in start order', () => {
    const p = withCues(s1, [cue(1), cue(5)]);
    const moved = changeCue(p, s1, 0, { start: 7 });
    if (!moved.ok) throw new Error(moved.reason);
    expect(moved.production.scenes.find((s) => s.id === s1)!.music!.map((c) => c.start)).toEqual([
      5, 7,
    ]);
    expect(moved.index).toBe(1);
    expect(changeCue(p, s1, 0, { start: 5 })).toEqual({ ok: false, reason: 'taken', at: 5 });
  });

  it('keeps the part played inside the sound, and the fades inside the part', () => {
    const p = withCues(s1, [cue(0)]);
    const music = (r: ReturnType<typeof changeCue>) =>
      r.ok ? r.production.scenes.find((s) => s.id === s1)!.music![0]! : null;
    expect(music(changeCue(p, s1, 0, { to: 9 }))?.to).toBe(3.5);
    expect(music(changeCue(p, s1, 0, { from: 3.5 }))?.from).toBe(3.4);
    expect(music(changeCue(p, s1, 0, { fadeIn: 2, fadeOut: 2 }))).toMatchObject({
      fadeIn: 2,
      fadeOut: 1.5,
    });
    expect(music(changeCue(p, s1, 0, { start: -3 }))?.start).toBe(0);
    expect(music(changeCue(p, s1, 0, { volume: 1.5 }))?.volume).toBe(1);
  });

  it('removes a cue, and the scene’s music with its last', () => {
    const p = withCues(s1, [cue(1)]);
    expect(removeCue(p, s1, 0).scenes.find((s) => s.id === s1)!.music).toBeUndefined();
  });
});

describe('dragCue', () => {
  const music = (r: ReturnType<typeof dragCue>) =>
    r.ok ? r.production.scenes.find((s) => s.id === s1)!.music![r.index]! : null;

  it('moves a bar by the seconds dragged, to a tenth, never before 0', () => {
    const p = withCues(s1, [cue(2)]);
    expect(music(dragCue(p, s1, 0, 'move', 1.04))?.start).toBe(3);
    expect(music(dragCue(p, s1, 0, 'move', -5))?.start).toBe(0);
  });

  it('refuses a bar dragged onto another cue’s start', () => {
    const p = withCues(s1, [cue(2), cue(4)]);
    expect(dragCue(p, s1, 0, 'move', 2)).toEqual({ ok: false, reason: 'taken', at: 4 });
  });

  it('moves the start with Play from, so what’s left is heard where it was', () => {
    const p = withCues(s1, [cue(2, { from: 1 })]);
    expect(music(dragCue(p, s1, 0, 'from', 0.5))).toMatchObject({ start: 2.5, from: 1.5 });
    // Back, as far as the sound or the scene allows.
    expect(music(dragCue(p, s1, 0, 'from', -3))).toMatchObject({ start: 1, from: 0 });
    expect(music(dragCue(withCues(s1, [cue(0.5, { from: 1 })]), s1, 0, 'from', -3))).toMatchObject({
      start: 0,
      from: 0.5,
    });
    // Forward, leaving at least a tenth.
    expect(music(dragCue(p, s1, 0, 'from', 9))).toMatchObject({ start: 4.4, from: 3.4 });
  });

  it('moves Play to alone, inside the trimmed sound', () => {
    const p = withCues(s1, [cue(2)]);
    expect(music(dragCue(p, s1, 0, 'to', -1))).toMatchObject({ start: 2, from: 0, to: 2.5 });
    expect(music(dragCue(p, s1, 0, 'to', 4))?.to).toBe(3.5);
  });

  it('lengthens a fade in by a corner dragged right, and a fade out by one dragged left', () => {
    const p = withCues(s1, [cue(0, { fadeIn: 1, fadeOut: 1 })]);
    expect(music(dragCue(p, s1, 0, 'fadeIn', 0.5))?.fadeIn).toBe(1.5);
    expect(music(dragCue(p, s1, 0, 'fadeOut', -0.5))?.fadeOut).toBe(1.5);
    expect(music(dragCue(p, s1, 0, 'fadeIn', -3))?.fadeIn).toBe(0);
    // The one dragged keeps its length; the other gives way.
    expect(music(dragCue(p, s1, 0, 'fadeOut', -9))).toMatchObject({ fadeIn: 0, fadeOut: 3.5 });
  });
});

describe('rulerStep', () => {
  it('labels the ruler at a step at least 48 px apart', () => {
    expect(rulerStep(80)).toBe(1);
    expect(rulerStep(20)).toBe(5);
    expect(rulerStep(4)).toBe(15);
  });
});
