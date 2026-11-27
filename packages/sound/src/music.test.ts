import { describe, expect, it } from 'vitest';
import { heardMusic, type SceneLength } from './music.ts';
import { cue, s1, s2, s3, withCues } from './testing.ts';

// Where a scene's music is heard (07-ux 7.7, spec 03 2.3): moved from the studio with its tests,
// and the crossfade now falls after the next cue's start (agreed with S2 and S5, 27 Nov).

const PLAN: SceneLength = { seconds: 12, from: 'plan' };

describe('heardMusic', () => {
  it('hears a cue for its part, a second past the next cue’s start, or to the end', () => {
    // Rain plays 3.5 seconds.
    const p = withCues(s1, [cue(1), cue(3), cue(8, { loop: true })]);
    const { cues, span } = heardMusic(p, s1, PLAN);
    expect(span).toBe(12);
    expect(cues.map((c) => [c.start, c.end, c.until])).toEqual([
      [1, 4, 'next'],
      [3, 6.5, 'own'],
      [8, 12, 'scene'],
    ]);
  });

  it('draws the loops, the fades, and the crossfade from the next cue’s start', () => {
    const p = withCues(s1, [cue(0, { loop: true, fadeIn: 1, to: 2 }), cue(5, { fadeOut: 0.5 })]);
    const [first, second] = heardMusic(p, s1, PLAN).cues;
    expect(first!.end).toBe(6);
    expect(first!.loops).toEqual([2, 4]);
    expect(first!.fadeIn).toEqual([0, 1]);
    expect(first!.crossfade).toEqual([5, 6]);
    expect(first!.crossfadeIn).toBeNull();
    expect(second!.fadeOut).toEqual([8, 8.5]);
    expect(second!.crossfade).toBeNull();
    expect(second!.crossfadeIn).toEqual([5, 6]);
  });

  it('cuts a crossfade short at the cue’s own end or the scene’s', () => {
    const own = heardMusic(withCues(s1, [cue(0), cue(3)]), s1, PLAN).cues[0]!;
    expect([own.end, own.until, own.crossfade]).toEqual([3.5, 'next', [3, 3.5]]);
    const run = heardMusic(withCues(s1, [cue(1, { loop: true }), cue(11.5)]), s1, {
      seconds: 12,
      from: 'run',
    }).cues;
    expect(run[0]!.crossfade).toEqual([11.5, 12]);
    expect(run[1]!.crossfadeIn).toEqual([11.5, 12]);
  });

  it('fades a cue out at a run’s end, but not by a plan or when it carries on', () => {
    const RUN: SceneLength = { seconds: 12, from: 'run' };
    const looped = withCues(s1, [cue(1, { loop: true, fadeOut: 2 })]);
    expect(heardMusic(looped, s1, RUN).cues[0]!.fadeOut).toEqual([10, 12]);
    expect(heardMusic(looped, s1, PLAN).cues[0]!.fadeOut).toBeNull();
    const carried = withCues(s1, [cue(1, { loop: true, fadeOut: 2, carriesOn: true })]);
    expect(heardMusic(carried, s1, RUN).cues[0]!.fadeOut).toBeNull();
  });

  it('stretches the timeline to a cue past the planned length, and greys none by a plan', () => {
    const p = withCues(s1, [cue(20)]);
    const { cues, span } = heardMusic(p, s1, PLAN);
    expect(span).toBe(23.5);
    expect(cues[0]!.past).toBe(false);
  });

  it('greys a cue that starts after a run’s end, and nothing crossfades into it', () => {
    const p = withCues(s1, [cue(2), cue(20)]);
    const { cues } = heardMusic(p, s1, { seconds: 12, from: 'run' });
    expect(cues.map((c) => c.past)).toEqual([false, true]);
    expect([cues[0]!.end, cues[0]!.crossfade]).toEqual([5.5, null]);
    expect(cues[1]!.crossfadeIn).toBeNull();
  });

  it('ends nothing while a scene is still playing', () => {
    const { cues } = heardMusic(withCues(s1, [cue(2, { loop: true })]), s1, {
      seconds: Infinity,
      from: 'run',
    });
    expect([cues[0]!.end, cues[0]!.until, cues[0]!.loops]).toEqual([Infinity, 'scene', []]);
  });

  it('carries in the last cue of the scene before that carries on, a second into the first', () => {
    const p = withCues(s3, [cue(4)], withCues(s1, [cue(0), cue(2, { carriesOn: true })]));
    // Scene 2 has no music, so Rain carries through it into scene 3.
    expect(heardMusic(p, s2, PLAN).carried).toEqual({
      cue: cue(2, { carriesOn: true }),
      scene: s1,
      end: 12,
      crossfade: null,
    });
    const into3 = heardMusic(p, s3, PLAN);
    expect(into3.carried).toMatchObject({ end: 5, crossfade: [4, 5] });
    expect(into3.cues[0]!.crossfadeIn).toEqual([4, 5]);
    expect(heardMusic(p, s1, PLAN).carried).toBeNull();
  });

  it('carries nothing past a scene whose last cue stops there', () => {
    const p = withCues(s2, [cue(0)], withCues(s1, [cue(0, { carriesOn: true })]));
    expect(heardMusic(p, s3, PLAN).carried).toBeNull();
    expect(heardMusic(p, s3, PLAN).cues).toEqual([]);
  });
});
