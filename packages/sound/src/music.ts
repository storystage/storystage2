/**
 * Where a scene's music is heard (`07-ux.md` section 7.7; spec 03 section 2.3; decision 0076): each
 * cue's bar, its fades, loops and crossfades, and the cue carried in from an earlier scene. The
 * Sound view draws these, and `musicPlays` plays them by the same rules. Pure. Moved from the
 * studio's `sound/music.ts` (S5's), which keeps the cue changes.
 */
import {
  MUSIC_CROSSFADE_SECONDS,
  type MusicCue,
  type Production,
  type SceneId,
} from '@storystage/production';

/** The shortest part a cue can play, in seconds (as the trim dialog keeps). */
export const SHORTEST_CUE = 0.1;

/** A scene's length, from the storyboard's plan or a whole Rehearse run. */
export interface SceneLength {
  readonly seconds: number;
  readonly from: 'plan' | 'run';
}

/** A cue as the timeline draws it, in seconds from the scene's start. */
export interface HeardCue {
  /** Its place in the scene's music, in start order. */
  readonly index: number;
  readonly cue: MusicCue;
  readonly start: number;
  readonly end: number;
  /** What ends it: its own end, the next cue, or the end of the scene (or the timeline). */
  readonly until: 'own' | 'next' | 'scene';
  /** Where each loop starts again. */
  readonly loops: readonly number[];
  readonly fadeIn: readonly [number, number] | null;
  readonly fadeOut: readonly [number, number] | null;
  /**
   * The crossfade into the next cue: from the next cue's start, for a second (or to this one's own
   * end or the scene's, if sooner). The next cue starts where the learner put it, and this one
   * fades out under it.
   */
  readonly crossfade: readonly [number, number] | null;
  /** The crossfade from the cue before (or the one carried in), as this one comes in under it. */
  readonly crossfadeIn: readonly [number, number] | null;
  /** It starts after a run's end, so it isn't heard yet. Never by a plan. */
  readonly past: boolean;
}

/**
 * A cue carried on from an earlier scene, heard from 0 until this scene's first cue takes over, a
 * second into it as they crossfade (or to the scene's end).
 */
export interface CarriedCue {
  readonly cue: MusicCue;
  readonly scene: SceneId;
  readonly end: number;
  /** The crossfade into this scene's first cue, if one is heard. */
  readonly crossfade: readonly [number, number] | null;
}

export interface HeardMusic {
  readonly cues: readonly HeardCue[];
  readonly carried: CarriedCue | null;
  /** The timeline's length: the scene's, or further to show a cue that starts after it. */
  readonly span: number;
}

/** How long a cue's part plays once. */
export const partOf = (cue: MusicCue) => Math.max(SHORTEST_CUE, cue.to - cue.from);

/** Seconds to a thousandth, as the timeline and the player keep times. */
const round = (seconds: number) => Math.round(seconds * 1000) / 1000;

export const musicOf = (p: Production, scene: SceneId): readonly MusicCue[] =>
  p.scenes.find((s) => s.id === scene)?.music ?? [];

/**
 * A scene's music as it's heard over `length`: a run's length ends every cue there and greys one
 * that starts after it; a plan's draws each to its end. A later cue takes over at its own start,
 * and the one before plays on under it for `MUSIC_CROSSFADE_SECONDS` as they crossfade. A length
 * of `Infinity` (a scene still playing) ends nothing.
 */
export function heardMusic(p: Production, scene: SceneId, length: SceneLength): HeardMusic {
  const music = musicOf(p, scene);
  const sceneEnd = Math.max(0, length.seconds);
  const run = length.from === 'run';
  const span = Math.max(1, sceneEnd, ...music.map((c) => c.start + partOf(c)));
  const last = run ? sceneEnd : span;
  const heard = (c: MusicCue | undefined) => c !== undefined && (!run || c.start < sceneEnd);
  const carried = carriedInto(p, scene);
  const first = heard(music[0]) ? music[0]!.start : Infinity;
  const carriedEnd = round(Math.min(last, first + MUSIC_CROSSFADE_SECONDS));
  const cues: HeardCue[] = [];
  let cutBefore = carried !== null && first < last;
  for (const [index, cue] of music.entries()) {
    const part = partOf(cue);
    const past = !heard(cue);
    const next = heard(music[index + 1]) ? music[index + 1]!.start : Infinity;
    const own = cue.loop ? Infinity : cue.start + part;
    const limit = past ? cue.start + part : last;
    const cut = next < Math.min(own, limit);
    const end = round(Math.min(own, limit, cut ? next + MUSIC_CROSSFADE_SECONDS : Infinity));
    const until = cut ? 'next' : !cue.loop && end === round(own) ? 'own' : 'scene';
    const loops: number[] = [];
    if (cue.loop && Number.isFinite(end))
      for (let t = cue.start + part; t < end - 1e-9; t += part) loops.push(round(t));
    cues.push({
      index,
      cue,
      start: cue.start,
      end,
      until,
      loops,
      fadeIn: cue.fadeIn > 0 ? [cue.start, round(Math.min(end, cue.start + cue.fadeIn))] : null,
      fadeOut:
        until === 'own' && cue.fadeOut > 0
          ? [round(Math.max(cue.start, end - cue.fadeOut)), end]
          : null,
      crossfade: cut ? [round(next), end] : null,
      crossfadeIn:
        cutBefore && !past
          ? [cue.start, round(Math.min(end, cue.start + MUSIC_CROSSFADE_SECONDS))]
          : null,
      past,
    });
    cutBefore = cut;
  }
  return {
    cues,
    carried: carried && {
      cue: carried.cue,
      scene: carried.scene,
      end: carriedEnd,
      crossfade: first < last ? [round(first), carriedEnd] : null,
    },
    span,
  };
}

/**
 * The cue an earlier scene in the running order carries on into `scene`: the last cue of the
 * nearest earlier scene with music, if it carries on.
 */
export function carriedInto(
  p: Production,
  scene: SceneId,
): { readonly cue: MusicCue; readonly scene: SceneId } | null {
  const order = p.manifest.runningOrder.map((r) => r.scene);
  for (let i = order.indexOf(scene) - 1; i >= 0; i--) {
    const music = musicOf(p, order[i]!);
    if (music.length === 0) continue;
    const last = music[music.length - 1]!;
    return last.carriesOn ? { cue: last, scene: order[i]! } : null;
  }
  return null;
}
