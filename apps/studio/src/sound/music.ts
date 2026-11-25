/**
 * The music timeline's sums (`07-ux.md` section 7.7; decision 0076, workplan 7.17): where each of
 * a scene's cues is heard, the cue carried in from an earlier scene, and the changes the cue
 * controls make. Pure, for the Sound view's timeline and its tests.
 */
import {
  MUSIC_CROSSFADE_SECONDS,
  SOUND_LIMITS,
  withSceneMusic,
  type MusicCue,
  type Production,
  type SceneId,
  type SoundClip,
} from '@storystage/production';

/** The shortest part a cue can play, in seconds (as the trim dialog keeps). */
export const SHORTEST_CUE = 0.1;
/** The latest a cue can start: a sound's own longest. */
export const LATEST_START = SOUND_LIMITS.seconds;

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
  /** The crossfade into the next cue, drawn as the second before it. */
  readonly crossfade: readonly [number, number] | null;
  /** It starts after a run's end, so it isn't heard yet. Never by a plan. */
  readonly past: boolean;
}

/** A cue carried on from an earlier scene, heard from 0 until this scene's first takes over. */
export interface CarriedCue {
  readonly cue: MusicCue;
  readonly scene: SceneId;
  readonly end: number;
}

export interface HeardMusic {
  readonly cues: readonly HeardCue[];
  readonly carried: CarriedCue | null;
  /** The timeline's length: the scene's, or further to show a cue that starts after it. */
  readonly span: number;
}

/** How long a cue's part plays once. */
export const partOf = (cue: MusicCue) => Math.max(SHORTEST_CUE, cue.to - cue.from);

/** A tenth of a second, as the timeline keeps times. */
export const tenth = (seconds: number) => Math.round(seconds * 10) / 10;
const between = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round = (seconds: number) => Math.round(seconds * 1000) / 1000;

export const musicOf = (p: Production, scene: SceneId): readonly MusicCue[] =>
  p.scenes.find((s) => s.id === scene)?.music ?? [];

export function heardMusic(p: Production, scene: SceneId, length: SceneLength): HeardMusic {
  const music = musicOf(p, scene);
  const sceneEnd = Math.max(0, length.seconds);
  const span = Math.max(1, sceneEnd, ...music.map((c) => c.start + partOf(c)));
  const cues = music.map((cue, index): HeardCue => {
    const part = partOf(cue);
    const next = music[index + 1]?.start ?? Infinity;
    const past = length.from === 'run' && cue.start >= sceneEnd;
    const own = cue.loop ? Infinity : cue.start + part;
    const last = past ? cue.start + part : length.from === 'run' ? sceneEnd : span;
    const end = round(Math.min(own, next, last));
    const until = end === round(own) ? 'own' : end === next ? 'next' : 'scene';
    const loops: number[] = [];
    if (cue.loop) for (let t = cue.start + part; t < end - 1e-9; t += part) loops.push(round(t));
    return {
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
      crossfade:
        until === 'next' ? [round(Math.max(cue.start, end - MUSIC_CROSSFADE_SECONDS)), end] : null,
      past,
    };
  });
  return { cues, carried: carriedInto(p, scene, music[0]?.start ?? span), span };
}

/** The cue an earlier scene carries on into `scene`, if its last music carries on. */
function carriedInto(p: Production, scene: SceneId, end: number): CarriedCue | null {
  const order = p.manifest.runningOrder.map((r) => r.scene);
  for (let i = order.indexOf(scene) - 1; i >= 0; i--) {
    const music = musicOf(p, order[i]!);
    if (music.length === 0) continue;
    const last = music[music.length - 1]!;
    return last.carriesOn ? { cue: last, scene: order[i]!, end } : null;
  }
  return null;
}

/** A new cue: the whole trimmed sound from `start`, at full volume, no fades or loop. */
export const cueFor = (clip: SoundClip, start: number): MusicCue => ({
  sound: clip.id,
  start: tenth(between(start, 0, LATEST_START)),
  from: 0,
  to: trimmedOf(clip),
  fadeIn: 0,
  fadeOut: 0,
  loop: false,
  volume: 1,
  carriesOn: false,
});

export type CueChange =
  | { readonly ok: true; readonly production: Production; readonly index: number }
  | { readonly ok: false; readonly reason: 'taken'; readonly at: number }
  | { readonly ok: false; readonly reason: 'full' | 'gone' };

/** `clip` as a new cue at `start`, unless music starts then or the scene has all it can hold. */
export function addCue(p: Production, scene: SceneId, clip: SoundClip, start: number): CueChange {
  const music = musicOf(p, scene);
  if (music.length >= SOUND_LIMITS.cues) return { ok: false, reason: 'full' };
  const cue = cueFor(clip, start);
  if (music.some((c) => c.start === cue.start))
    return { ok: false, reason: 'taken', at: cue.start };
  return placed(p, scene, [...music, cue], cue);
}

/**
 * Cue `index` changed by `patch`, kept to what it can be: a start from 0, the part inside the
 * trimmed sound and at least a tenth of a second, the fades together no longer than the part, and
 * a volume from 0 to 1. Refused if it would start when another cue does.
 */
export function changeCue(
  p: Production,
  scene: SceneId,
  index: number,
  patch: Partial<Omit<MusicCue, 'sound'>>,
  clipLength?: number,
): CueChange {
  const music = musicOf(p, scene);
  const old = music[index];
  if (!old) return { ok: false, reason: 'gone' };
  const clip = clipOf(p, old);
  const length = clipLength ?? (clip ? trimmedOf(clip) : Math.max(old.to, patch.to ?? 0));
  const start = tenth(between(patch.start ?? old.start, 0, LATEST_START));
  // Each end of the part moves alone, as far as the other allows.
  const from = round(between(patch.from ?? old.from, 0, old.to - SHORTEST_CUE));
  const to = round(between(patch.to ?? old.to, from + SHORTEST_CUE, Math.max(length, from)));
  const part = round(to - from);
  // The fade changed keeps its length if it can; the other gives way.
  let fadeIn = round(between(patch.fadeIn ?? old.fadeIn, 0, part));
  let fadeOut = round(between(patch.fadeOut ?? old.fadeOut, 0, part));
  if (fadeIn + fadeOut > part) {
    if (patch.fadeOut !== undefined && patch.fadeIn === undefined) fadeIn = round(part - fadeOut);
    else fadeOut = round(part - fadeIn);
  }
  const cue: MusicCue = {
    ...old,
    ...patch,
    start,
    from,
    to,
    fadeIn,
    fadeOut,
    volume: between(patch.volume ?? old.volume, 0, 1),
  };
  if (music.some((c, i) => i !== index && c.start === cue.start))
    return { ok: false, reason: 'taken', at: cue.start };
  return placed(
    p,
    scene,
    music.map((c, i) => (i === index ? cue : c)),
    cue,
  );
}

/** The scene without cue `index`; with its last gone, the scene has no music. */
export const removeCue = (p: Production, scene: SceneId, index: number): Production =>
  withSceneMusic(
    p,
    scene,
    musicOf(p, scene).filter((_, i) => i !== index),
  );

/** The production with `cues`, and where `cue` landed in start order. */
function placed(
  p: Production,
  scene: SceneId,
  cues: readonly MusicCue[],
  cue: MusicCue,
): CueChange {
  const production = withSceneMusic(p, scene, cues);
  return { ok: true, production, index: musicOf(production, scene).indexOf(cue) };
}

/** How long a sound plays as trimmed. */
export const trimmedOf = (clip: SoundClip) => round(clip.trim.end - clip.trim.start);

/** The film's sound a cue plays, or `null` when the film hasn't got it. */
export const clipOf = (p: Production, cue: MusicCue): SoundClip | null =>
  p.manifest.sounds?.find((c) => c.id === cue.sound) ?? null;

const RULER_STEPS = [1, 2, 5, 10, 15, 30, 60];

/** Seconds between the ruler's labels at `pxPerSecond`, at least 48 px apart. */
export const rulerStep = (pxPerSecond: number): number =>
  RULER_STEPS.find((s) => s * pxPerSecond >= 48) ?? 60;
