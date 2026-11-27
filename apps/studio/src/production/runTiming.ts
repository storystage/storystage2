/**
 * A Rehearse run's timing (`07-ux.md` section 7.7; decision 0076, workplan 7.17): how long the
 * scene ran and where each speak line and `playAudio` block sounded, for the Sound view's ruler.
 * It's built from the driver's trace as the run goes: `ran` says when each block started, and the
 * commands after it say what each one played (S3's `sound` command names its block).
 */
import type { NodeId } from '@storystage/ast';
import type { PlaybackEvent } from '@storystage/playback';
import type { Production, SceneId } from '@storystage/production';
import type { SceneSetup } from '@storystage/story-api';
import type { SpeakLineAt } from '../speech/speakLines.ts';

/** A speak line or a sound, as the run played it, in seconds on the scene's clock. */
export interface TimedSound {
  readonly node: NodeId;
  readonly kind: 'speech' | 'sound';
  readonly start: number;
  readonly length: number;
  /** A speak line's words. */
  readonly text?: string;
  /** A sound's name, as its block gives it: an imported clip's id or a shelf sound's. */
  readonly ref?: string;
  /** A sound the film hasn't got: it played as silence, for no time. */
  readonly missing?: true;
}

export interface RunTiming {
  /** The run got to the scene's end: not stopped, and no error. */
  readonly whole: boolean;
  /** How long the scene ran, in seconds: to its last command's end, or its script's end. */
  readonly length: number;
  /** In the order they started. */
  readonly sounds: readonly TimedSound[];
}

/** A scene's last whole run, with the code and set-up it ran, to tell when they've changed. */
export interface KeptTiming {
  readonly timing: RunTiming;
  readonly program: Production['program'];
  readonly setup: SceneSetup | undefined;
}

/** Each scene's last whole run, while the film is open: never saved. */
export type RunTimings = ReadonlyMap<SceneId, KeptTiming>;

export const NO_TIMINGS: RunTimings = new Map();

const setupOf = (p: Production, scene: SceneId) => p.scenes.find((s) => s.id === scene)?.setup;

/** `timings` with `timing` kept for `scene` if the run was whole; the same map otherwise. */
export function withTiming(
  timings: RunTimings,
  p: Production,
  scene: SceneId,
  timing: RunTiming | null,
): RunTimings {
  if (!timing?.whole || timings.get(scene)?.timing === timing) return timings;
  return new Map([...timings, [scene, { timing, program: p.program, setup: setupOf(p, scene) }]]);
}

/** A scene's last whole run, and whether its code or set-up has changed since. */
export interface SceneTiming {
  readonly timing: RunTiming;
  readonly changed: boolean;
}

export function timingOf(timings: RunTimings, p: Production, scene: SceneId): SceneTiming | null {
  const kept = timings.get(scene);
  if (!kept) return null;
  return {
    timing: kept.timing,
    changed: kept.program !== p.program || kept.setup !== setupOf(p, scene),
  };
}

const seconds = (micros: number) => Math.round(micros / 1000) / 1000;

/** Hears one run's events and keeps its timing. */
export class TimingRecorder {
  private readonly scene: SceneId;
  /** The scene's speak lines, by block. */
  private readonly speakers: ReadonlyMap<NodeId, string>;
  /** Speak lines that started and haven't been matched to their caption yet. */
  private pending: { node: NodeId; object: string; at: number }[] = [];
  private sceneStart = 0;
  private sounds: TimedSound[] = [];
  private end = 0;
  /** The latest block start, on the scene's clock. */
  private lastRan = 0;
  /** Where the scene changed to the next, if it did. */
  private cut: number | null = null;
  private whole = false;
  private failed = false;
  /** The scene's script has finished; listeners may still run. */
  private finished = false;
  private current: RunTiming = { whole: false, length: 0, sounds: [] };

  constructor(scene: SceneId, lines: readonly SpeakLineAt[]) {
    this.scene = scene;
    this.speakers = new Map(lines.filter((l) => l.scene === scene).map((l) => [l.node, l.object]));
  }

  get timing(): RunTiming {
    return this.current;
  }

  /**
   * The run was stopped at `at`, on the film's clock. A scene that waits for the viewer never ends
   * by itself, so a Stop after its script has finished and nothing is still playing makes the run
   * whole, to its last action's end, as the rough cut times it (the owner's choice, 27 Nov). True
   * when that made it whole.
   */
  stopped(at: number): boolean {
    if (this.whole || this.failed || !this.finished || at - this.sceneStart < this.end)
      return false;
    this.whole = true;
    this.current = { ...this.current, whole: true };
    return true;
  }

  /** Hears an event; true when the timing changed. */
  hear(event: PlaybackEvent): boolean {
    const before = this.current;
    switch (event.kind) {
      case 'scene':
        if (event.scene === this.scene) this.sceneStart = event.at;
        break;
      case 'ran':
        if (event.scene !== this.scene) break;
        for (const b of event.blocks) {
          this.lastRan = Math.max(this.lastRan, b.at - this.sceneStart);
          const object = this.speakers.get(b.node);
          if (object !== undefined)
            this.pending.push({ node: b.node, object, at: b.at - this.sceneStart });
        }
        break;
      case 'commands':
        if (event.scene !== this.scene) break;
        for (const c of event.commands) {
          this.end = Math.max(this.end, c.start + c.duration);
          if (c.kind === 'sound' && c.node !== undefined)
            this.sounds.push({
              node: c.node,
              kind: 'sound',
              start: seconds(c.start),
              length: seconds(c.duration),
              ref: c.sound,
              ...(c.missing ? { missing: true as const } : {}),
            });
          else if (c.kind === 'say' && c.bubble === 'caption') {
            // A caption names its block (S3's #717); one that doesn't is its speaker's line that
            // started then, as a caption starts as its block does.
            const i =
              c.node !== undefined
                ? this.pending.findIndex((p) => p.node === c.node)
                : this.pending.findIndex((p) => p.object === c.object && p.at === c.start);
            if (i < 0) continue;
            const [line] = this.pending.splice(i, 1);
            this.sounds.push({
              node: line!.node,
              kind: 'speech',
              start: seconds(c.start),
              length: seconds(c.duration),
              text: c.text,
            });
          }
        }
        break;
      case 'finished':
        if (event.scene !== this.scene) break;
        this.finished = true;
        this.end = Math.max(this.end, event.at - this.sceneStart);
        break;
      case 'error':
      case 'fault':
        this.failed = true;
        break;
      case 'next':
        // The scene ends where it changes, though moves already sent run on (S3's review of
        // #713). The block that changes scene is the last to start, so it's that start, until
        // the driver says when the change came.
        this.cut = this.lastRan;
        if (!this.failed) this.whole = true;
        break;
      case 'ended':
        if (!event.stopped && !this.failed) this.whole = true;
        break;
      default:
        return false;
    }
    const cut = this.cut;
    const length = seconds(cut === null ? this.end : Math.min(this.end, cut));
    if (
      before.whole === this.whole &&
      before.length === length &&
      before.sounds.length === this.sounds.length
    )
      return false;
    // Cut where the scene changed, as `measure` cuts captions there.
    const sounds =
      cut === null
        ? [...this.sounds]
        : this.sounds
            // One starting at the cut, in a do together with the change, isn't heard (S3).
            .filter((s) => s.start < seconds(cut))
            .map((s) =>
              s.start + s.length > seconds(cut)
                ? { ...s, length: Math.round((seconds(cut) - s.start) * 1000) / 1000 }
                : s,
            );
    this.current = { whole: this.whole, length, sounds };
    return true;
  }
}
