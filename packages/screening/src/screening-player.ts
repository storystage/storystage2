/**
 * The rough cut's controller (WP11.1, spec 08 section 2): measures the film on a hidden stage,
 * then plays it live on the shown stage with the driver and a clock. The host calls `tick` on
 * every animation frame and draws `RoughCut` from `state`.
 *
 * The hidden stage lives only while measuring, and a measure still running when the learner
 * leaves is stopped, so a small device never holds more than the shown stage and that one.
 */
import { captionsAt, captionsFor, type Caption } from '@storystage/export';
import {
  LiveClock,
  Playback,
  fastForward,
  measure,
  type PlaybackEvent,
  type RuntimeWorker,
  type Timeline,
} from '@storystage/playback';
import type { Production } from '@storystage/production';
import type { FrameImage, Stage } from '@storystage/stage';
import type { Micros } from '@storystage/story-api';
import type { RoughCutError } from './RoughCut.tsx';
import { sceneAt, segments } from './rough-cut.ts';

export interface ScreeningPlayerOptions {
  readonly production: Production;
  /** The stage the learner sees. The host makes it and disposes of it. */
  readonly stage: Stage;
  /** Makes the hidden stage for measuring, which the player disposes of when it's done. */
  readonly measureStage: () => Stage | Promise<Stage>;
  /** Starts a runtime worker (`startRuntimeWorker`). The player ends every one it starts. */
  readonly startWorker: () => RuntimeWorker;
  readonly seed: number;
  /** Milliseconds, for the clock: `performance.now()` unless a test gives another. */
  readonly wall?: () => number;
}

export interface ScreeningState {
  /** `null` until measured. */
  readonly timeline: Timeline | null;
  /** The film's time. */
  readonly time: Micros;
  readonly playing: boolean;
  readonly error: RoughCutError | null;
  /** The captions showing now, earliest first. */
  readonly captions: readonly string[];
}

export class ScreeningPlayer {
  private readonly options: ScreeningPlayerOptions;
  private readonly clock: LiveClock;
  private readonly listeners = new Set<() => void>();
  private captionList: readonly Caption[] = [];
  private playback: Playback | null = null;
  /** The film time the current driver's time 0 stands for. */
  private offset: Micros = 0;
  private busy: Promise<void> | null = null;
  private disposed = false;
  state: ScreeningState = { timeline: null, time: 0, playing: false, error: null, captions: [] };

  constructor(options: ScreeningPlayerOptions) {
    this.options = options;
    this.clock = new LiveClock(options.wall);
  }

  /** Called whenever `state` changes. Returns a function that stops listening. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Measures the film. `null` if it was cancelled. */
  async prepare(signal?: AbortSignal): Promise<Timeline | null> {
    const stage = await this.options.measureStage();
    const worker = this.options.startWorker();
    try {
      const timeline = await measure({
        production: this.options.production,
        stage,
        port: worker.port,
        terminate: worker.terminate,
        seed: this.options.seed,
        ...(signal ? { signal } : {}),
      });
      if (this.disposed) return null;
      this.captionList = captionsFor(timeline.lines, this.options.production.script);
      // A film that stops with an error says so at once, not only when play gets there.
      const error =
        timeline.end.kind === 'error'
          ? { words: timeline.end.words, node: timeline.end.error.node }
          : null;
      this.set({ timeline, time: 0, error });
      return timeline;
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return null;
      throw e;
    } finally {
      stage.dispose();
    }
  }

  /** Plays from where the film is; from the start again if it had ended. */
  async play(): Promise<void> {
    const timeline = this.state.timeline;
    if (!timeline || this.disposed) return;
    const atEnd = this.state.time >= timeline.length;
    if (!this.playback || this.playback.ended() || atEnd)
      await this.seek(atEnd ? 0 : this.state.time);
    this.clock.play();
    this.set({ playing: true });
  }

  pause(): void {
    this.clock.pause();
    this.set({ playing: false });
  }

  /**
   * Plays from film time `t`: a new driver from the scene playing at `t`, fast-forwarded to it
   * (spec 08, section 1). Playing or paused stays as it was.
   */
  async seek(t: Micros): Promise<void> {
    const timeline = this.state.timeline;
    if (!timeline || this.disposed) return;
    await this.busy;
    const segment = sceneAt(segments(this.options.production, timeline), t);
    if (!segment) return;
    this.busy = (async () => {
      this.playback?.dispose();
      const worker = this.options.startWorker();
      const playback = new Playback({
        production: this.options.production,
        stage: this.options.stage,
        port: worker.port,
        terminate: worker.terminate,
        mode: 'production',
        seed: this.options.seed,
        from: segment.scene,
      });
      playback.on((e) => this.heard(e));
      this.playback = playback;
      this.offset = segment.start;
      await playback.start();
      if (t > segment.start) await fastForward(playback, 0, t - segment.start);
      this.clock.setTime(t);
      this.set({ time: t, error: null, captions: this.captionsAt(t) });
    })();
    await this.busy;
    this.busy = null;
  }

  /**
   * A still of the film at `at` (Compare, spec 08 section 3), `width` × `height`, drawn on the
   * device and never sent anywhere. In the scene on the stage now, it's drawn without moving the
   * film; in another scene, the film moves there first. `null` before the film is measured.
   */
  async still(at: Micros, width: number, height: number): Promise<FrameImage | null> {
    const timeline = this.state.timeline;
    if (!timeline || this.disposed) return null;
    const all = segments(this.options.production, timeline);
    const target = sceneAt(all, at);
    if (!target) return null;
    const now = sceneAt(all, this.state.time);
    if (!this.playback || now !== target) await this.seek(at);
    else await this.busy;
    return this.options.stage.picture(at - target.start, width, height);
  }

  /** On every animation frame: moves the film to the clock's time and draws it. */
  async tick(): Promise<void> {
    const timeline = this.state.timeline;
    const playback = this.playback;
    if (!timeline || !playback || !this.state.playing || this.busy) return;
    const t = Math.min(this.clock.time(), timeline.length);
    await playback.frame(t - this.offset);
    if (this.disposed || this.playback !== playback) return;
    const over = playback.ended() || t >= timeline.length;
    if (over) this.clock.pause();
    this.set({ time: t, playing: !over && this.state.playing, captions: this.captionsAt(t) });
  }

  /** Ends the workers and stops listening. The shown stage is the host's. */
  dispose(): void {
    this.disposed = true;
    this.clock.pause();
    this.playback?.dispose();
    this.playback = null;
    this.listeners.clear();
  }

  private heard(e: PlaybackEvent): void {
    if (e.kind === 'error') {
      this.clock.pause();
      this.set({ playing: false, error: { words: e.words, node: e.error.node } });
    }
  }

  private captionsAt(t: Micros): string[] {
    return captionsAt(this.captionList, t).map((c) => c.text);
  }

  private set(change: Partial<ScreeningState>): void {
    this.state = { ...this.state, ...change };
    for (const listener of this.listeners) listener();
  }
}
