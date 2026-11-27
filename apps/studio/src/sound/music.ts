/**
 * The music timeline's cue changes (`07-ux.md` section 7.7; decision 0076, workplan 7.17): adding,
 * changing, dragging and removing cues. Pure, for the Sound view's timeline and its tests. Where
 * each cue is heard is `@storystage/sound`'s (`heardMusic`), which Rehearse and the export play by.
 */
import {
  SOUND_LIMITS,
  withSceneMusic,
  type MusicCue,
  type Production,
  type SceneId,
  type SoundClip,
} from '@storystage/production';
import { musicOf, SHORTEST_CUE } from '@storystage/sound';

export {
  heardMusic,
  musicOf,
  partOf,
  SHORTEST_CUE,
  type CarriedCue,
  type HeardCue,
  type HeardMusic,
  type SceneLength,
} from '@storystage/sound';

/** The latest a cue can start: a sound's own longest. */
export const LATEST_START = SOUND_LIMITS.seconds;

/** A tenth of a second, as the timeline keeps times. */
export const tenth = (seconds: number) => Math.round(seconds * 10) / 10;
const between = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round = (seconds: number) => Math.round(seconds * 1000) / 1000;

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

/** What a drag on the timeline holds: the bar, its two handles or one of its fades' corners. */
export type CueGrip = 'move' | 'from' | 'to' | 'fadeIn' | 'fadeOut';

/**
 * Cue `index` as a drag of `seconds` (right is later) on `grip` leaves it, from where it was when
 * the drag began: the bar moves the start; the left handle moves the start with Play from, so the
 * part that's left is heard where it was; the right handle moves Play to; a fade's corner lengthens
 * or shortens its fade. Kept as `changeCue` keeps a change.
 */
export function dragCue(
  p: Production,
  scene: SceneId,
  index: number,
  grip: CueGrip,
  seconds: number,
): CueChange {
  const old = musicOf(p, scene)[index];
  if (!old) return { ok: false, reason: 'gone' };
  const by = tenth(seconds);
  switch (grip) {
    case 'move':
      return changeCue(p, scene, index, { start: old.start + by });
    case 'from': {
      const d = round(
        between(by, -Math.min(old.from, old.start), old.to - SHORTEST_CUE - old.from),
      );
      return changeCue(p, scene, index, { start: old.start + d, from: old.from + d });
    }
    case 'to':
      return changeCue(p, scene, index, { to: old.to + by });
    case 'fadeIn':
      return changeCue(p, scene, index, { fadeIn: old.fadeIn + by });
    case 'fadeOut':
      return changeCue(p, scene, index, { fadeOut: old.fadeOut - by });
  }
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
