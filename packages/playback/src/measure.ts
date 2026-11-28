/**
 * Measuring (spec 08, section 1): a fixed-step run that draws nothing and gives the film's
 * timeline: when each scene starts and how long it lasts, when each block ran, and every line,
 * for captions. The rough cut (11.1) and the export (11.3) start with one. A deterministic run
 * (WP6.5) gives the same timeline every time.
 */
import type { NodeId } from '@storystage/ast';
import { waitsForViewer, type SceneId, type Transition } from '@storystage/production';
import type { RuntimeError } from '@storystage/runtime';
import { micros, type Micros } from '@storystage/story-api';
import { Playback, type Missing, type PlaybackEvent, type PlaybackOptions } from './playback.ts';

/** The longest film (spec 08, section 4): 10 minutes. */
export const FILM_CAP = micros(600);

export interface MeasuredScene {
  readonly scene: SceneId;
  /** How it came in; `null` for the first scene. */
  readonly transition: Transition | null;
  /** On the film's clock. */
  readonly start: Micros;
  /** Up to the next scene's start, or the end of the film. */
  readonly length: Micros;
  /**
   * It waits on the viewer (`waitsForViewer`), so it has no fixed length. Measured, it ends after
   * its last stage command, so its segment shows how long it plays before it waits.
   */
  readonly waits: boolean;
}

/**
 * A `say` or `think` line, or a speak line's `caption` (WP14.3, spec 06 section 4.7), on the film's
 * clock. The export's captions file is written from the captions.
 */
export interface MeasuredLine {
  readonly scene: SceneId;
  readonly object: string;
  readonly text: string;
  readonly kind: 'say' | 'think' | 'caption';
  /** The script line a caption speaks, if it came from one (the production's `LineId`). */
  readonly line?: string;
  readonly start: Micros;
  /** Cut short if the scene ends first. */
  readonly duration: Micros;
  /** The block's own time, never cut: a speak line's sound is fitted to it (spec 06, 4.2). */
  readonly length: Micros;
}

/** A block starting to run, on the film's clock. A block that runs again is here again. */
export interface MeasuredBlock {
  readonly scene: SceneId;
  readonly node: NodeId;
  readonly at: Micros;
}

export type MeasuredEnd =
  | { readonly kind: 'ended' }
  /** The program stopped with an error, in that scene. */
  | {
      readonly kind: 'error';
      readonly scene: SceneId;
      readonly error: RuntimeError;
      readonly words: string;
    }
  /** The player gave up, for example after too many scene starts. */
  | { readonly kind: 'fault'; readonly message: string }
  /** It reached the length cap. */
  | { readonly kind: 'cap' };

/**
 * A sound the film plays (`playAudio`'s `sound` command; decision 0076), on the film's clock:
 * `duration` is how long it plays: the part it uses, cut at its scene's end. One the film hasn't got
 * plays silent, so it isn't here.
 */
export interface MeasuredSound {
  readonly scene: SceneId;
  /** As the block names it: an imported clip's id, or a shelf sound's Backstage id. */
  readonly sound: string;
  readonly start: Micros;
  readonly duration: Micros;
}

export interface Timeline {
  readonly scenes: readonly MeasuredScene[];
  readonly blocks: readonly MeasuredBlock[];
  readonly lines: readonly MeasuredLine[];
  /**
   * Every sound the film plays, in the order played, for the export's mix. `measure` always
   * gives it; optional so a timeline built by hand (the rough cut's empty one, tests) needn't.
   */
  readonly sounds?: readonly MeasuredSound[];
  /** The whole film, without a title card or credits. */
  readonly length: Micros;
  readonly end: MeasuredEnd;
  /** What each scene couldn't find, the first time it loaded; scenes that found everything aren't here. */
  readonly missing: readonly { readonly scene: SceneId; readonly missing: readonly Missing[] }[];
}

export interface MeasureOptions extends Omit<PlaybackOptions, 'mode' | 'trace'> {
  /**
   * How long a scene that waits on the viewer goes on after its last stage command. Default 0, so
   * the rough cut's run goes on; the export measures with its own 5 seconds, so its timeline is
   * the film it makes.
   */
  readonly viewerWait?: Micros;
  /** Frames a second. Default 30. */
  readonly fps?: number;
  /** Default `FILM_CAP`. */
  readonly limit?: Micros;
  /** Stops the run, when the learner leaves the Screening room: `measure` rejects with an `AbortError`. */
  readonly signal?: AbortSignal;
}

/** Plays the running order through in fixed steps, drawing nothing, and says what happened. */
export async function measure(options: MeasureOptions): Promise<Timeline> {
  const { fps = 30, limit = FILM_CAP, signal, viewerWait = 0, ...rest } = options;
  // A scene that waits on the viewer ends after its last command, so the run goes on.
  const playback = new Playback({ ...rest, mode: 'production', viewerWait, trace: true });
  const scenes: { scene: SceneId; transition: Transition | null; start: Micros }[] = [];
  const blocks: MeasuredBlock[] = [];
  const lines: MeasuredLine[] = [];
  const sounds: MeasuredSound[] = [];
  const missing: { scene: SceneId; missing: readonly Missing[] }[] = [];
  let end: MeasuredEnd | null = null;

  const heard = (e: PlaybackEvent) => {
    switch (e.kind) {
      case 'scene':
        scenes.push({ scene: e.scene, transition: e.transition, start: e.at });
        break;
      case 'commands': {
        const start = scenes.at(-1)?.start ?? 0;
        for (const c of e.commands) {
          if (c.kind === 'sound' && !c.missing)
            sounds.push({
              scene: e.scene,
              sound: c.sound,
              start: start + c.start,
              duration: c.duration,
            });
          if (c.kind === 'say')
            lines.push({
              scene: e.scene,
              object: c.object,
              text: c.text,
              kind: c.bubble,
              ...(c.line === undefined ? {} : { line: c.line }),
              start: start + c.start,
              duration: c.duration,
              length: c.duration,
            });
        }
        break;
      }
      case 'ran':
        for (const b of e.blocks) blocks.push({ scene: e.scene, node: b.node, at: b.at });
        break;
      case 'error':
        end = { kind: 'error', scene: e.scene, error: e.error, words: e.words };
        break;
      case 'fault':
        end = { kind: 'fault', message: e.message };
        break;
      case 'missing': {
        // A scene reports again, with the whole list, as missing sounds are named.
        const known = missing.findIndex((m) => m.scene === e.scene);
        if (known < 0) missing.push({ scene: e.scene, missing: e.missing });
        else missing[known] = { scene: e.scene, missing: e.missing };
        break;
      }
      default:
        break;
    }
  };
  const stopListening = playback.on(heard);

  let length: Micros = 0;
  try {
    signal?.throwIfAborted();
    await playback.start();
    for (let frame = 1; !playback.ended(); frame++) {
      signal?.throwIfAborted();
      const t = Math.min(limit, Math.round((frame * 1_000_000) / fps));
      length = t;
      await playback.frame(t);
      if (t >= limit && !playback.ended()) {
        await playback.stop();
        end = { kind: 'cap' };
      }
    }
  } finally {
    stopListening();
    playback.dispose();
  }

  const measured = scenes.map((s, i): MeasuredScene => {
    const until = scenes[i + 1]?.start ?? length;
    return {
      ...s,
      length: until - s.start,
      waits: waitsForViewer(options.production.program, options.production, s.scene),
    };
  });
  const endOf = (scene: SceneId, from: Micros) => {
    const s = measured.find((m) => m.scene === scene && m.start <= from);
    return s ? s.start + s.length : length;
  };
  return {
    scenes: measured,
    blocks,
    lines: lines
      .filter((l) => l.start < endOf(l.scene, l.start))
      .map((l) => ({ ...l, duration: Math.min(l.duration, endOf(l.scene, l.start) - l.start) })),
    // Cut by their scene's end, as lines are (spec 08 section 4).
    sounds: sounds
      .filter((s) => s.start < endOf(s.scene, s.start))
      .map((s) => ({ ...s, duration: Math.min(s.duration, endOf(s.scene, s.start) - s.start) })),
    length,
    end: end ?? { kind: 'ended' },
    missing,
  };
}
