/**
 * Rehearse (`07-ux.md` section 7.4; WP7.4): one scene played live on the Production stage's
 * scene view, from its set-up, with WP6.4's controls. This joins S2's driver (`Playback`, in
 * `rehearse` mode), its `LiveClock` and a runtime worker; the scene view draws and the Code editor
 * highlights from its state. Rehearse never changes the set-up: Stop loads it again.
 */
import type { NodeId } from '@storystage/ast';
import {
  LiveClock,
  Playback,
  fastForward,
  type Missing,
  type PlaybackEvent,
  type RuntimeWorker,
} from '@storystage/playback';
import type { Production, SceneId } from '@storystage/production';
import type { Stage } from '@storystage/stage';

/** Every run of a scene plays the same way (WP6.5), as the Screening room's does. */
export const REHEARSE_SEED = 1;

export interface RehearsalState {
  /**
   * `idle` before the first run and after Stop (the set-up showing); `playing` and `paused` while
   * it runs; `ended` when the scene finished, went to another scene or stopped at an error, with
   * its last picture still showing until Stop or Restart.
   */
  readonly status: 'idle' | 'starting' | 'playing' | 'paused' | 'ended';
  readonly speed: number;
  /** The blocks running now, for the Code editor's `rehearse` highlight. */
  readonly running: readonly NodeId[];
  /** The error the run stopped at, in plain words, at its block when it has one. */
  readonly error: { readonly node: NodeId | null; readonly words: string } | null;
  /** The run reached a block that goes to another scene: that scene's heading. */
  readonly next: string | null;
  /** What the scene names that this device couldn't find: shown as stand-ins. */
  readonly missing: readonly Missing[];
  /** "Rehearse to here" went to a block that never ran. */
  readonly notReached: boolean;
  /** Every block that has started in this run (the driver's `ran` trace): frames it reached. */
  readonly ran: ReadonlySet<NodeId>;
  /** The run got to the scene's end: finished, or went on to the next scene. Not stopped, no error. */
  readonly reachedEnd: boolean;
  /** What the scene's objects are saying or thinking now, in the set-up's order: the captions. */
  readonly speech: readonly Said[];
}

/** A line on the stage now: said, or thought (shown so it doesn't read as speech). */
export interface Said {
  readonly text: string;
  readonly thought: boolean;
}

export const IDLE: RehearsalState = {
  status: 'idle',
  speed: 1,
  running: [],
  error: null,
  next: null,
  missing: [],
  notReached: false,
  ran: new Set(),
  reachedEnd: false,
  speech: [],
};

export interface RehearsalOptions {
  readonly production: Production;
  readonly scene: SceneId;
  readonly stage: Stage;
  readonly startWorker: () => RuntimeWorker;
  /** Milliseconds, for the clock: `performance.now()` unless a test gives another. */
  readonly wall?: () => number;
}

/**
 * One scene's rehearsals, for as long as the production and scene stay the same: the studio makes
 * a new one (stopping this) when the code changes. Call `tick` every frame.
 */
export class Rehearsal {
  private readonly options: RehearsalOptions;
  private playback: Playback | null = null;
  private clock: LiveClock;
  private busy = false;
  private current: RehearsalState = IDLE;
  private readonly listeners = new Set<() => void>();
  /** Each run's number: events from a run that was replaced are ignored. */
  private run = 0;

  constructor(options: RehearsalOptions) {
    this.options = options;
    this.clock = new LiveClock(options.wall);
  }

  get state(): RehearsalState {
    return this.current;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  /** Whether a run is going, paused or not: what the code changing would stop. */
  get active(): boolean {
    return ['starting', 'playing', 'paused'].includes(this.current.status);
  }

  /** Plays the scene from its set-up, from the start. */
  async start(): Promise<void> {
    const run = await this.begin();
    if (run === null) return;
    this.clock.play();
    this.set({ status: 'playing' });
  }

  /**
   * Rehearse to here: plays from the start without drawing until `node` runs, then pauses there.
   * A block that never runs leaves the run paused where play ended, and says so.
   */
  async toHere(node: NodeId): Promise<void> {
    const run = await this.begin();
    if (run === null || !this.playback) return;
    const playback = this.playback;
    this.busy = true;
    try {
      const { at, reached } = await fastForward(playback, 0, { node });
      if (run !== this.run) return;
      this.clock.setTime(at);
      this.hear();
      // Play may have ended first (the block never ran, or an error): its last picture stays.
      this.set(
        playback.ended() ? { notReached: !reached } : { status: 'paused', notReached: !reached },
      );
    } finally {
      if (run === this.run) this.busy = false;
    }
  }

  pause(): void {
    if (this.current.status !== 'playing') return;
    this.clock.pause();
    this.set({ status: 'paused' });
  }

  play(): void {
    if (this.current.status !== 'paused') return;
    this.clock.play();
    this.set({ status: 'playing', notReached: false });
  }

  setSpeed(speed: number): void {
    this.clock.setSpeed(speed);
    this.set({ speed });
  }

  /** Moves the picture on: call it every frame. Does nothing unless a run is playing. */
  async tick(): Promise<void> {
    if (this.current.status !== 'playing' || this.busy || !this.playback) return;
    this.busy = true;
    const run = this.run;
    try {
      await this.playback.frame(this.clock.time());
      if (run === this.run) this.hear();
    } finally {
      if (run === this.run) this.busy = false;
    }
  }

  /** Stop, which always works (6.3): the run ends and the set-up shows again, as it was. */
  async stop(): Promise<void> {
    const playback = this.playback;
    this.end();
    if (playback && !playback.ended()) {
      // The driver loads the set-up again; its first moment is drawn here.
      await playback.stop();
      this.options.stage.seek(0);
    } else await this.showSetup();
    playback?.dispose();
    this.set({ ...IDLE, speed: this.current.speed });
  }

  /** Lets the worker go: for when the scene view closes. The stage is the view's to dispose. */
  dispose(): void {
    this.end();
    this.playback?.dispose();
    this.playback = null;
    this.listeners.clear();
  }

  /** The scene's set-up on the stage, its first moment drawn. */
  async showSetup(): Promise<void> {
    const { production, scene, stage } = this.options;
    const setup = production.scenes.find((s) => s.id === scene)?.setup;
    if (!setup) return;
    await stage.load(setup);
    stage.seek(0);
  }

  /** A fresh run, loaded and started but with the clock still at 0. `null` if it was replaced. */
  private async begin(): Promise<number | null> {
    this.playback?.dispose();
    this.end();
    const run = ++this.run;
    const { production, scene, stage, startWorker } = this.options;
    const worker = startWorker();
    const playback = new Playback({
      production,
      stage,
      port: worker.port,
      terminate: worker.terminate,
      mode: 'rehearse',
      seed: REHEARSE_SEED,
      from: scene,
      // Every block's exact start (`ran`): Rehearse to here finds a block over in an instant.
      trace: true,
    });
    this.playback = playback;
    playback.on((event) => {
      if (run === this.run) this.event(event);
    });
    const speed = this.current.speed;
    this.clock = new LiveClock(this.options.wall);
    this.clock.setSpeed(speed);
    this.set({ ...IDLE, speed, status: 'starting' });
    await playback.start();
    return run === this.run ? run : null;
  }

  /** What's being said now, from the stage, when it has changed. */
  private hear(): void {
    const { production, scene, stage } = this.options;
    const objects = production.scenes.find((s) => s.id === scene)?.setup.objects ?? [];
    const speech: Said[] = [];
    for (const o of objects) {
      const said = stage.speech(o.id);
      if (said?.text) speech.push({ text: said.text, thought: said.bubble === 'think' });
    }
    const before = this.current.speech;
    const same = (a: Said, b: Said | undefined) => a.text === b?.text && a.thought === b.thought;
    if (speech.length !== before.length || speech.some((s, i) => !same(s, before[i])))
      this.set({ speech });
  }

  /** Ends the run that's going, without touching the stage. */
  private end(): void {
    this.run++;
    this.busy = false;
    this.clock.pause();
  }

  private event(event: PlaybackEvent): void {
    switch (event.kind) {
      case 'running':
        this.set({ running: event.nodes });
        break;
      case 'ran': {
        const ran = this.current.ran;
        const fresh = event.blocks.filter((b) => !ran.has(b.node));
        if (fresh.length > 0) this.set({ ran: new Set([...ran, ...fresh.map((b) => b.node)]) });
        break;
      }
      case 'error':
        this.set({ error: { node: event.error.node, words: event.words } });
        break;
      case 'fault':
        this.set({ error: { node: null, words: event.message } });
        break;
      case 'next':
        this.set({ next: event.heading, reachedEnd: true });
        break;
      case 'missing':
        this.set({ missing: event.missing });
        break;
      case 'ended':
        this.clock.pause();
        this.set({
          status: 'ended',
          running: [],
          speech: [],
          reachedEnd: this.current.reachedEnd || (!event.stopped && this.current.error === null),
        });
        break;
      default:
    }
  }

  private set(change: Partial<RehearsalState>): void {
    this.current = { ...this.current, ...change };
    for (const l of [...this.listeners]) l();
  }
}
