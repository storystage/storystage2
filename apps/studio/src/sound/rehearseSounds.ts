/**
 * Rehearse's music and sounds in the studio (decision 0076, workplan 7.17; S3's `LiveSounds` and
 * `createSoundOut`, in `@storystage/sound`): one output for the studio, at the film's volumes,
 * made when it's first needed, which the speak lines' voices play through too; and for each run,
 * a player that reads the film's sounds and the scenes' lengths from their last whole Rehearse.
 */
import type { NodeId } from '@storystage/ast';
import type { Production, SceneId, SoundClip, SoundMix } from '@storystage/production';
import {
  createSoundOut,
  LiveSounds,
  type AudioContextLike,
  type SoundOut,
  type SpeechSpan,
} from '@storystage/sound';
import type { RehearsalSounds } from '../production/rehearsal.ts';
import { timingOf, type RunTimings } from '../production/runTiming.ts';
import { sceneSeconds } from '../storyboard/edits.ts';

/** The page's audio, where it has Web Audio. */
const pageAudio = (): AudioContextLike | null =>
  typeof AudioContext === 'undefined' ? null : (new AudioContext() as unknown as AudioContextLike);

/**
 * The studio's one output. Made when first asked for, so no audio starts before the learner has
 * pressed something; it follows the film's volumes from then on.
 */
export class StudioSoundOut {
  #out: SoundOut | null = null;
  #mix: SoundMix;
  readonly #context: () => AudioContextLike | null;

  constructor(mix: SoundMix, context: () => AudioContextLike | null = pageAudio) {
    this.#mix = mix;
    this.#context = context;
  }

  /** The output, made the first time: `null` where there's no Web Audio. */
  get(): SoundOut | null {
    if (!this.#out) {
      const context = this.#context();
      if (context) this.#out = createSoundOut(this.#mix, context);
    }
    return this.#out;
  }

  /** The film's volumes, when they change or another film opens. */
  setMix(mix: SoundMix): void {
    const now = this.#mix;
    if (mix.speech === now.speech && mix.music === now.music && mix.effects === now.effects) return;
    this.#mix = mix;
    this.#out?.setMix(mix);
  }

  /** Lets the audio go; asked for again, a new one is made. */
  close(): void {
    this.#out?.close();
    this.#out = null;
  }
}

/**
 * Only the film's volumes are different (`withMix`): Rehearse plays on, as the studio's audio
 * follows them (the owner's choice, 28 Nov).
 */
export function onlyVolumesChanged(a: Production, b: Production): boolean {
  const same = <T extends object>(x: T, y: T, but: keyof T | null) =>
    Object.keys({ ...x, ...y }).every((k) => k === but || x[k as keyof T] === y[k as keyof T]);
  return same(a, b, 'manifest') && same(a.manifest, b.manifest, 'mix');
}

/**
 * Only scenes' music or the film's sounds are different, so Rehearse stops saying the music
 * changed, not the code.
 */
export function onlyMusicChanged(a: Production, b: Production): boolean {
  return (
    a.program === b.program &&
    a.scenes.length === b.scenes.length &&
    a.scenes.every((s, i) => s.setup === b.scenes[i]!.setup) &&
    // A clip trimmed, renamed or swapped plays differently too: a cue's or a block's (S3).
    (a.scenes.some((s, i) => s.music !== b.scenes[i]!.music) ||
      a.manifest.sounds !== b.manifest.sounds)
  );
}

/** How long each scene is, for the player: from its last whole Rehearse, or else the plan. */
export function lengthsOf(p: Production, timings: RunTimings) {
  return {
    /** As the Sound view draws it, so a cue carried from it is heard as it's drawn. */
    lengthOf: (scene: SceneId): number =>
      timingOf(timings, p, scene)?.timing.length ?? sceneSeconds(p, scene),
    /** A run of the code as it is now: a cue fades out by then. `null` for none. */
    runLength: (scene: SceneId): number | null => {
      const kept = timingOf(timings, p, scene);
      return kept && !kept.changed ? kept.timing.length : null;
    },
  };
}

/**
 * A scene's voiced speak lines in its last whole run of the code as it is now, in seconds from its
 * start, or `null` without one: the music goes down before each (S3's #740). A line without its
 * sound (`voiced`) isn't heard, so it doesn't lower the music.
 */
export function spokenOf(
  p: Production,
  timings: RunTimings,
  voiced: (node: NodeId) => boolean,
): (scene: SceneId) => readonly SpeechSpan[] | null {
  return (scene) => {
    const kept = timingOf(timings, p, scene);
    if (!kept || kept.changed) return null;
    return kept.timing.sounds
      .filter((s) => s.kind === 'speech' && voiced(s.node))
      .map((s) => ({ start: s.start, end: s.start + s.length }));
  };
}

/** What a scene view's player needs from the studio, read each time it's needed. */
export interface SceneSounds {
  readonly out: () => SoundOut | null;
  readonly film: { bytes(clip: SoundClip): Uint8Array | null };
  readonly timings: RunTimings;
}

/** A player for Rehearse of `p`, or `null` without an output. `voiced`: a line has its sound. */
export function rehearseSounds(
  p: Production,
  sounds: () => SceneSounds | undefined,
  voiced: (node: NodeId) => boolean = () => false,
): RehearsalSounds | null {
  const out = sounds()?.out();
  if (!out) return null;
  const lengths = () => lengthsOf(p, sounds()?.timings ?? new Map());
  return new LiveSounds({
    out,
    production: p,
    lengthOf: (scene) => lengths().lengthOf(scene),
    runLength: (scene) => lengths().runLength(scene),
    spoken: (scene) => spokenOf(p, sounds()?.timings ?? new Map(), voiced)(scene),
    bytes: (sound) => {
      const clip = p.manifest.sounds?.find((c) => c.id === sound);
      return clip ? (sounds()?.film.bytes(clip) ?? null) : null;
    },
  });
}
