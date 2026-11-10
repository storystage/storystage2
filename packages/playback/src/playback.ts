/**
 * The driver that plays a production, or one scene, on the page (`docs/spec/08-export.md`,
 * section 1). It joins the runtime worker (`serve`), the stage and the production's player, and
 * owns only the wiring between them.
 *
 * The runtime always runs in fixed steps here: each frame, the driver advances it to the
 * picture's time plus a lookahead, so it runs ahead of the picture as spike 1.4's rule 1 asks,
 * and live play, exporting and tests all take the same path. Pause and speed are the clock's
 * (`LiveClock`), not the worker's.
 */
import type { NodeId } from '@storystage/ast';
import {
  ProductionPlayer,
  type PlayerAction,
  type Production,
  type SceneId,
  type Transition,
} from '@storystage/production';
import {
  RUNTIME_PROTOCOL,
  type FromRuntime,
  type Port,
  type RuntimeError,
  type ToRuntime,
} from '@storystage/runtime';
import type { Stage } from '@storystage/stage';

/** Something a scene names that the stage couldn't find. */
export type Missing = ReturnType<Stage['missing']>[number];
import { errorWords } from './words.ts';
import {
  StageError,
  micros,
  type Micros,
  type StageCommand,
  type StageEvent,
} from '@storystage/story-api';

/** What happens while playing. Subscribe with `on`. Times are the film's. */
export type PlaybackEvent =
  /** A scene has started, at film time `at`. `transition` is how it came in, `null` for the first. */
  | {
      readonly kind: 'scene';
      readonly scene: SceneId;
      readonly transition: Transition | null;
      readonly at: Micros;
    }
  /** The runtime's commands for the scene playing, as the stage got them. For measuring. */
  | {
      readonly kind: 'commands';
      readonly scene: SceneId;
      readonly commands: readonly StageCommand[];
    }
  /** With `trace`: blocks that started, on the film's clock, for measuring. */
  | {
      readonly kind: 'ran';
      readonly scene: SceneId;
      readonly blocks: readonly { readonly node: NodeId; readonly at: Micros }[];
    }
  /** The blocks running now, for highlighting (WP7.9). */
  | { readonly kind: 'running'; readonly nodes: readonly NodeId[]; readonly at: Micros }
  /** The scene's script method has finished; listeners may still run. */
  | { readonly kind: 'finished'; readonly scene: SceneId; readonly at: Micros }
  /** The old scene fades out over the new one. The stage draws it (`LoadOptions.crossfade`). */
  | {
      readonly kind: 'crossfade';
      readonly from: SceneId;
      readonly to: SceneId;
      readonly duration: Micros;
    }
  /** Rehearse ended at a block that goes to another scene: show "Next: <heading>". */
  | { readonly kind: 'next'; readonly scene: SceneId; readonly heading: string }
  /** The program stopped with an error. The studio says it in plain words, at `error.node`. */
  | {
      readonly kind: 'error';
      readonly scene: SceneId;
      readonly error: RuntimeError;
      /** What happened and what to do next, for the learner (6.3). */
      readonly words: string;
    }
  /**
   * What the scene just loaded couldn't find (`stage.missing()`, spec 03 section 1.3): models
   * shown as stand-ins, backdrop parts left as the default. Play goes on.
   */
  | { readonly kind: 'missing'; readonly scene: SceneId; readonly missing: readonly Missing[] }
  /** Play can't go on: too many scene starts, or a scene that isn't there. */
  | { readonly kind: 'fault'; readonly code: string; readonly message: string }
  /** Play is over: the film ended (after any fade, which the player sends first), or it was stopped. */
  | { readonly kind: 'ended'; readonly stopped: boolean };

export interface PlaybackOptions {
  readonly production: Production;
  readonly stage: Stage;
  /** A port to a runtime worker (`serve`), which this driver uses alone. */
  readonly port: Port<ToRuntime, FromRuntime>;
  /** `production` plays the running order; `rehearse` plays one scene (WP7.4). */
  readonly mode: 'production' | 'rehearse';
  readonly seed: number;
  /** The scene to start with: Rehearse's scene, or the Screening room's "play from here". */
  readonly from?: SceneId;
  /** Ends the worker: `dispose` calls it (`startRuntimeWorker`'s `terminate`). */
  readonly terminate?: () => void;
  /** Blocks switched off for this run (WP6.4). */
  readonly disabled?: readonly NodeId[];
  /** How far the runtime runs ahead of the picture. Default 100 ms (spike 1.4). */
  readonly lookahead?: Micros;
  /**
   * For a run with no viewer (the export, measuring): a scene that waits on the viewer ends this
   * long after its last stage command (`PlayerOptions.viewerWait`, spec 03 rule 11). Unset, it
   * waits.
   */
  readonly viewerWait?: Micros;
  /** Asks the runtime when each block starts (`ran` events), for measuring. */
  readonly trace?: boolean;
}

/** What `advance` is waiting for. */
interface Waiting {
  readonly until: Micros;
  readonly done: () => void;
}

export class Playback {
  private readonly options: PlaybackOptions;
  private readonly player: ProductionPlayer;
  private readonly lookahead: Micros;
  private readonly listeners = new Set<(event: PlaybackEvent) => void>();
  private readonly stopListening: (() => void)[] = [];
  private scene: SceneId | null = null;
  /** The film time the scene playing started at. */
  private sceneStart: Micros = 0;
  /** The film time of the frame being worked on. */
  private film: Micros = 0;
  /** After a `load`, everything from the worker is the old scene's until `loaded`. */
  private awaitingLoaded = false;
  private waiting: Waiting | null = null;
  /**
   * Whether the scene's code is still running in the worker. A stop, a scene change or an
   * error ends it, and a stopped run never answers `advance`, so the picture carries on alone
   * (a fade out, the rest of a crossfade) until the next scene loads.
   */
  private running = false;
  private over = false;
  private saidEnded = false;

  constructor(options: PlaybackOptions) {
    this.options = options;
    this.lookahead = options.lookahead ?? micros(0.1);
    this.player = new ProductionPlayer(options.production, {
      mode: options.mode,
      seed: options.seed,
      ...(options.from === undefined ? {} : { from: options.from }),
      ...(options.viewerWait === undefined ? {} : { viewerWait: options.viewerWait }),
    });
    this.stopListening.push(
      options.port.listen((message) => this.handle(message)),
      options.stage.onEvent((event) => this.event(event)),
    );
  }

  /** Subscribes to what happens. Returns a function that stops listening. */
  on(listener: (event: PlaybackEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** The scene playing, if any. */
  current(): SceneId | null {
    return this.scene;
  }

  ended(): boolean {
    return this.over;
  }

  /** Loads the first scene, at film time 0. */
  async start(): Promise<void> {
    await this.perform(this.player.start());
  }

  /**
   * Moves the film to time `t`: runs the runtime to the scene's time plus the lookahead, then
   * the stage to the scene's time, then lets the player act. Call it every frame live, or once
   * per frame when exporting. If a scene ends here, the next one starts at `t` and is drawn too.
   */
  async frame(t: Micros): Promise<void> {
    this.film = t;
    for (let loads = 0; loads < 8 && !this.over && this.scene !== null; loads++) {
      const sceneTime = Math.max(0, t - this.sceneStart);
      if (this.running) await this.advance(sceneTime + this.lookahead);
      if (this.over) return;
      this.options.stage.seek(sceneTime);
      const before = this.scene;
      const startedAt = this.sceneStart;
      await this.perform(this.player.now(sceneTime));
      // A new scene started at `t`: draw its first moment in this frame as well.
      if (this.scene === before && this.sceneStart === startedAt) return;
    }
  }

  /** A click or a key, for the runtime's listeners. The stage's own events come here too. */
  event(event: StageEvent): void {
    if (this.over || this.awaitingLoaded || this.scene === null) return;
    this.options.port.post({ type: 'event', event });
  }

  /**
   * Stops at once, from outside: the learner's Stop, or the studio when the code changes. The
   * scene's set-up is loaded again, so the stage is exactly as it started (WP7.4).
   */
  async stop(): Promise<void> {
    if (this.over) return;
    this.over = true;
    this.running = false;
    this.options.port.post({ type: 'stop' });
    this.release();
    const setup = this.options.production.scenes.find((s) => s.id === this.scene)?.setup;
    if (setup) await this.options.stage.load(setup);
    this.finish(true);
  }

  /**
   * Stops listening to the worker and the stage, and ends the worker if `terminate` was given:
   * for when the learner leaves the Production stage or the Screening room.
   */
  dispose(): void {
    for (const stop of this.stopListening.splice(0)) stop();
    this.listeners.clear();
    this.over = true;
    this.release();
    this.options.terminate?.();
  }

  /** Play is over: says so once, whichever way it ended. */
  private finish(stopped: boolean): void {
    this.over = true;
    if (this.saidEnded) return;
    this.saidEnded = true;
    this.emit({ kind: 'ended', stopped });
  }

  private emit(event: PlaybackEvent): void {
    for (const listener of [...this.listeners]) listener(event);
  }

  /** Runs the runtime to scene time `until`, and waits until it has sent everything up to there. */
  private advance(until: Micros): Promise<void> {
    if (this.over) return Promise.resolve();
    return new Promise((done) => {
      this.waiting = { until, done };
      this.options.port.post({ type: 'advance', until });
    });
  }

  private release(): void {
    const waiting = this.waiting;
    this.waiting = null;
    waiting?.done();
  }

  private handle(message: FromRuntime): void {
    if (this.awaitingLoaded) {
      if (message.type === 'loaded') this.awaitingLoaded = false;
      // A load the runtime refused never sends `loaded`.
      else if (message.type === 'error' && message.error.code === 'protocol') this.fail(message);
      return;
    }
    const scene = this.scene;
    if (scene === null) return;
    switch (message.type) {
      case 'commands':
        this.options.stage.schedule(message.commands);
        this.player.runtime(message);
        if (message.commands.length > 0)
          this.emit({ kind: 'commands', scene, commands: message.commands });
        if (this.waiting && message.until >= this.waiting.until) this.release();
        break;
      case 'ask':
        this.answer(message);
        break;
      case 'watch':
        this.options.stage.watch(message.watches);
        break;
      case 'ran':
        this.emit({
          kind: 'ran',
          scene,
          blocks: message.blocks.map((b) => ({ node: b.node, at: this.sceneStart + b.at })),
        });
        break;
      case 'highlight':
        this.emit({ kind: 'running', nodes: message.running, at: this.sceneStart + message.at });
        break;
      case 'finished':
        this.player.runtime(message);
        this.emit({ kind: 'finished', scene, at: this.sceneStart + message.at });
        break;
      case 'sceneChange':
        this.running = false;
        this.player.runtime(message);
        this.release();
        break;
      case 'error':
        this.fail(message);
        break;
      default:
    }
  }

  private answer(message: FromRuntime & { type: 'ask' }): void {
    let reply: ToRuntime;
    try {
      reply = { type: 'answer', id: message.id, result: this.options.stage.answer(message.query) };
    } catch (e) {
      if (!(e instanceof StageError)) throw e;
      reply = { type: 'answer', id: message.id, result: { kind: 'error', code: e.code } };
    }
    this.options.port.post(reply);
  }

  private fail(message: FromRuntime & { type: 'error' }): void {
    const scene = this.scene;
    if (scene !== null)
      this.emit({ kind: 'error', scene, error: message.error, words: errorWords(message.error) });
    this.running = false;
    // The player stops and ends; its `stop` goes to a worker that has already stopped.
    void this.perform(this.player.runtime(message));
    this.over = true;
    this.release();
    this.finish(false);
  }

  private async perform(actions: readonly PlayerAction[]): Promise<void> {
    for (const action of actions) {
      switch (action.kind) {
        case 'load':
          await this.load(action);
          break;
        case 'preload':
          // Only a hint, so not waited for. The stage never rejects one; if it did, the `load`
          // that follows reports a model it can't have.
          this.options.stage.preload(action.setup).catch(() => undefined);
          break;
        case 'stageCommands':
          this.options.stage.schedule(action.commands);
          break;
        case 'crossfade':
          this.emit({
            kind: 'crossfade',
            from: action.from,
            to: action.to,
            duration: action.duration,
          });
          break;
        case 'stop':
          this.running = false;
          this.options.port.post({ type: 'stop' });
          this.release();
          break;
        case 'next':
          this.over = true;
          this.emit({ kind: 'next', scene: action.scene, heading: action.heading });
          this.finish(false);
          break;
        case 'fault':
          // The player sends `end` straight after, which ends play.
          this.emit({ kind: 'fault', code: action.code, message: action.message });
          break;
        case 'end':
          this.finish(false);
          break;
      }
    }
  }

  private async load(action: PlayerAction & { kind: 'load' }): Promise<void> {
    const { stage, port, production } = this.options;
    this.awaitingLoaded = true;
    const fade = action.transition?.kind === 'crossfade' ? action.transition.duration : null;
    try {
      await stage.load(action.setup, fade === null ? undefined : { crossfade: fade });
    } catch (e) {
      if (!(e instanceof StageError)) throw e;
      // A model or backdrop the stage can't find: play stops here, in plain words (6.3).
      this.scene = action.scene;
      this.sceneStart = this.film;
      this.awaitingLoaded = false;
      this.fail({
        type: 'error',
        error: { code: 'stage', node: null, at: 0, stageCode: e.code, detail: e.message },
      });
      return;
    }
    stage.schedule(action.commands);
    this.scene = action.scene;
    this.sceneStart = this.film;
    port.post({
      type: 'load',
      protocol: RUNTIME_PROTOCOL,
      program: production.program,
      scene: action.setup,
      entry: action.entry,
      seed: action.seed,
      disabled: this.options.disabled ?? [],
      scenes: action.scenes,
    });
    port.post({
      type: 'start',
      mode: this.options.trace ? { kind: 'fixed', trace: true } : { kind: 'fixed' },
    });
    this.running = true;
    this.emit({ kind: 'scene', scene: action.scene, transition: action.transition, at: this.film });
    const missing = stage.missing();
    if (missing.length > 0) this.emit({ kind: 'missing', scene: action.scene, missing });
  }
}
