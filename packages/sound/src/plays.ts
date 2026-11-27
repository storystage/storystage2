/**
 * The film's music as it plays (spec 03 section 2.3; decision 0076, workplan 11.7): when each cue
 * starts and stops on the film's clock, which part of its file it plays, and its loudness as
 * points to ramp between. Rehearse's player and the export's mix both play these, so a film
 * sounds as it did in Rehearse and as the Sound view draws it (`heardMusic`'s rules). Pure.
 *
 * The rules, agreed with S2 and S5 (27 Nov 2026):
 * - A later cue starts where the learner put it, and the one before fades out under it over
 *   `MUSIC_CROSSFADE_SECONDS`, both on equal-power curves, so the two together don't dip.
 * - A cue that carries on plays into the next scene played, and on, until another cue starts; it
 *   crossfades there. Every other cue stops at its scene's end, and everything at the last.
 * - A plain fade is a straight ramp. A cue stopped at full loudness (by its scene's end, or its
 *   own end with no fade out) ramps down over `CLICK_FREE_SECONDS`, so nothing clicks.
 * - A cue's loudness is its `volume` and its fades. The music track's volume, and the export
 *   lowering music under speech, are the player's and the mix's (`mixOf`), not these.
 */
import {
  MUSIC_CROSSFADE_SECONDS,
  type MusicCue,
  type Production,
  type SceneId,
  type SoundRef,
} from '@storystage/production';
import { carriedInto, musicOf, partOf } from './music.ts';

const round = (seconds: number) => Math.round(seconds * 1000) / 1000;

/** How long a cue stopped at full loudness takes to go silent, so nothing clicks: 10 ms. */
export const CLICK_FREE_SECONDS = 0.01;
/** The points an equal-power crossfade is sampled at, between its two ends. */
export const CROSSFADE_STEPS = 8;

/** A scene as it plays: its start on the film's clock, and its length (`Infinity` while playing). */
export interface ScenePlace {
  readonly scene: SceneId;
  readonly start: number;
  readonly length: number;
}

/** One cue playing, on the film's clock, in seconds. */
export interface MusicPlay {
  /** The cue: its own scene, and its place in that scene's music. Carried on, it keeps both. */
  readonly scene: SceneId;
  readonly index: number;
  readonly sound: SoundRef;
  /** When it's heard from: the cue's start, or the first scene's for a cue carried in. */
  readonly start: number;
  /** When it stops. `Infinity` when nothing stops it while its scene's length isn't known. */
  readonly end: number;
  /** Where in the file it plays from at `start`, in seconds into the file. */
  readonly offset: number;
  /** The part it plays, in seconds into the file (a clip's trim start added in): its loop. */
  readonly from: number;
  readonly to: number;
  readonly loop: boolean;
  /**
   * Its loudness as `[time, level]` points from `start`, to ramp between in a straight line; the
   * last holds until `end`. A level is the cue's `volume` times its fades, from 0 to 1.
   */
  readonly gain: readonly (readonly [number, number])[];
}

interface Placed {
  readonly scene: SceneId;
  readonly index: number;
  readonly cue: MusicCue;
  /** The cue's own start on the film's clock: before `start` for a cue carried in. */
  readonly cueStart: number;
  readonly start: number;
  /** Its scene's end on the film's clock, or the last scene's for a cue that carries on. */
  readonly limit: number;
  /** The end of the scene it starts in. */
  readonly sceneEnd: number;
}

/**
 * The music of `scenes`, played one after another from their starts, in film order. The cue
 * carried into the first comes from the running order, as the Sound view draws it, placed by
 * `lengthOf` each earlier scene (the studio's last whole run of each, or the storyboard's plan).
 * A cue the film hasn't got is still placed: the player plays it as silence.
 */
export function musicPlays(
  p: Production,
  scenes: readonly ScenePlace[],
  lengthOf: (scene: SceneId) => number,
): MusicPlay[] {
  if (scenes.length === 0) return [];
  const filmEnd = scenes[scenes.length - 1]!.start + scenes[scenes.length - 1]!.length;
  const placed: Placed[] = [];
  const first = scenes[0]!;
  const into = carriedIn(p, first, lengthOf);
  if (into)
    placed.push({
      ...into,
      start: first.start,
      limit: filmEnd,
      sceneEnd: first.start + first.length,
    });
  for (const { scene, start, length } of scenes) {
    const music = musicOf(p, scene);
    const sceneEnd = start + length;
    for (const [index, cue] of music.entries()) {
      if (cue.start >= length) continue;
      const carries = cue.carriesOn && index === music.length - 1;
      const at = start + cue.start;
      placed.push({
        scene,
        index,
        cue,
        cueStart: at,
        start: at,
        limit: carries ? filmEnd : sceneEnd,
        sceneEnd,
      });
    }
  }
  const plays: MusicPlay[] = [];
  let cutBefore = false;
  for (const [i, c] of placed.entries()) {
    const part = partOf(c.cue);
    const own = c.cue.loop ? Infinity : c.cueStart + part;
    const next = placed[i + 1];
    const cut = next !== undefined && next.start < Math.min(own, c.limit);
    const end = Math.min(
      own,
      c.limit,
      cut ? Math.min(next.start + MUSIC_CROSSFADE_SECONDS, next.sceneEnd) : Infinity,
    );
    const crossIn = cutBefore;
    cutBefore = cut;
    if (end <= c.start) continue;
    const trim = p.manifest.sounds?.find((s) => s.id === c.cue.sound)?.trim.start ?? 0;
    const from = trim + c.cue.from;
    const played = c.start - c.cueStart;
    plays.push({
      scene: c.scene,
      index: c.index,
      sound: c.cue.sound,
      start: round(c.start),
      end: Number.isFinite(end) ? round(end) : Infinity,
      offset: round(from + (c.cue.loop ? played % part : played)),
      from: round(from),
      to: round(from + part),
      loop: c.cue.loop,
      gain: gainOf(c, end, own, crossIn, cut ? next.start : null),
    });
  }
  return plays;
}

/** The cue carried into `first` from the running order, placed by the earlier scenes' lengths. */
function carriedIn(
  p: Production,
  first: ScenePlace,
  lengthOf: (scene: SceneId) => number,
): Omit<Placed, 'start' | 'limit' | 'sceneEnd'> | null {
  const from = carriedInto(p, first.scene);
  if (!from) return null;
  const order = p.manifest.runningOrder.map((r) => r.scene);
  let before = 0;
  for (let i = order.indexOf(from.scene) + 1; i < order.indexOf(first.scene); i++)
    before += lengthOf(order[i]!);
  const length = lengthOf(from.scene);
  if (!(from.cue.start < length)) return null;
  const music = musicOf(p, from.scene);
  return {
    scene: from.scene,
    index: music.length - 1,
    cue: from.cue,
    cueStart: first.start - before - length + from.cue.start,
  };
}

type Fade = (t: number) => number;

/** A ramp from silent to full over `[a, b]` (or full to silent, `down`), straight or equal-power. */
function ramp(a: number, b: number, down: boolean, power: boolean): Fade {
  return (t) => {
    const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
    const up = power ? Math.sin((x * Math.PI) / 2) : x;
    const level = down ? (power ? Math.cos((x * Math.PI) / 2) : 1 - x) : up;
    return Math.abs(level) < 1e-9 ? 0 : level;
  };
}

/** A cue's loudness as points: its volume times the quietest of its fades at each. */
function gainOf(
  c: Placed,
  end: number,
  own: number,
  crossIn: boolean,
  next: number | null,
): readonly (readonly [number, number])[] {
  const { cue } = c;
  const fades: Fade[] = [];
  const times = [c.start];
  const add = (a: number, b: number, down: boolean, power: boolean) => {
    fades.push(ramp(a, b, down, power));
    const steps = power ? CROSSFADE_STEPS : 1;
    for (let k = 0; k <= steps; k++) times.push(a + ((b - a) * k) / steps);
  };
  if (cue.fadeIn > 0) add(c.cueStart, c.cueStart + cue.fadeIn, false, false);
  if (crossIn) add(c.start, c.start + MUSIC_CROSSFADE_SECONDS, false, true);
  if (next !== null) add(next, next + MUSIC_CROSSFADE_SECONDS, true, true);
  else if (cue.fadeOut > 0 && end === own) add(own - cue.fadeOut, own, true, false);
  const level = (t: number) => cue.volume * Math.min(1, ...fades.map((f) => f(t)));
  if (Number.isFinite(end)) {
    if (level(end) > 0) add(Math.max(c.start, end - CLICK_FREE_SECONDS), end, true, false);
    times.push(end);
  }
  const kept = [...new Set(times.map(round))]
    .filter((t) => t >= round(c.start) && t <= end + 1e-9)
    .sort((a, b) => a - b);
  return kept.map((t) => [t, round(level(t))] as const);
}
