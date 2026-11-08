/**
 * WP8.3: the production player's controller (`docs/spec/03-production-format.md`, section 3.1).
 *
 * A pure state machine. It has no worker, stage or clock of its own: the one-scene driver (S2,
 * WP6.4; the Screening room, WP11.1) tells it what happens, and does what it says. Agreed with S2
 * on 8 Nov 2026.
 *
 * - **In:** `start()`; every `FromRuntime` message (`runtime()`); the picture's scene time,
 *   every frame live and at each `advance` when fixed (`now()`), which is behind the worker's
 *   own time by its lookahead; and the learner's Stop (`stop()`).
 * - **Out:** actions, in the order to do them: `load` a scene into the runtime and the stage,
 *   `stageCommands` for a fade, `crossfade`, `preload` the likely next scene, `stop` the worker,
 *   `next` (Rehearse), `fault`, `end`.
 *
 * It decides everything in section 3.1: when a scene ends on its own (its script method has
 * finished and its last command has ended on screen, unless it waits on the viewer), what each
 * ending leads to (`nextScene`), the scene start limit, each scene's seed, and Rehearse's "Next".
 */
import type { NodeId } from '@storystage/ast';
import type { FromRuntime } from '@storystage/runtime';
import { SCENE, type Micros, type SceneSetup, type StageCommand } from '@storystage/story-api';
import { firstScene, nextScene, waitsForViewer, type SceneEnding } from './playback.ts';
import type { Production, SceneId, Transition } from './types.ts';

export type PlayerAction =
  /**
   * Load a scene: send the runtime its `load` (`entry`, `seed`, `scenes`) and the stage its
   * (`setup`), then schedule `commands` on the stage before its first seek: they fade the new
   * scene in after a fade to black. `transition` is how it came in, `null` for the first scene.
   */
  | {
      readonly kind: 'load';
      readonly scene: SceneId;
      readonly entry: NodeId;
      readonly setup: SceneSetup;
      readonly seed: number;
      readonly scenes: readonly string[];
      readonly transition: Transition | null;
      readonly commands: readonly StageCommand[];
    }
  /** Schedule these on the stage now: a fade to black, on the scene that is ending. */
  | { readonly kind: 'stageCommands'; readonly commands: readonly StageCommand[] }
  /**
   * A crossfade starts. Keep `from`'s picture playing, its timeline carrying on with the commands
   * it already has (its code has stopped), and show it fading out over `to` for `duration`. The
   * next action loads `to`. Only one runtime runs: `to`'s.
   */
  | {
      readonly kind: 'crossfade';
      readonly from: SceneId;
      readonly to: SceneId;
      readonly duration: Micros;
    }
  /**
   * A hint, after each `load` in a production: the running order's next scene is the likely one,
   * so the stage can fetch its models now (`Stage.preload`, S3). Only a guess: a goToScene can go
   * elsewhere, and the `load` that follows reuses whatever was fetched. A failed preload is silent.
   */
  | { readonly kind: 'preload'; readonly scene: SceneId; readonly setup: SceneSetup }
  /** Stop the worker: a scene that ended on its own may still have listeners running. */
  | { readonly kind: 'stop' }
  /** Rehearse: the scene went on to another; show "Next: <heading>" there instead of jumping. */
  | { readonly kind: 'next'; readonly scene: SceneId; readonly heading: string }
  /** Play can't go on: the scene start limit, or a scene the production doesn't have. */
  | {
      readonly kind: 'fault';
      readonly code: 'tooManyScenes' | 'noSuchScene';
      readonly message: string;
    }
  /** The film is over. `fadeOut`: the last scene fades to black over that long first. */
  | { readonly kind: 'end'; readonly fadeOut: Micros | null };

export interface PlayerOptions {
  /** `production` plays the running order; `rehearse` plays one scene and shows "Next". */
  readonly mode: 'production' | 'rehearse';
  /** The run's seed; each scene gets `(seed + start number) | 0`, so a rerun repeats (WP6.5). */
  readonly seed: number;
  /** The scene to start with: Rehearse's scene, or the Screening room's "play from here". */
  readonly from?: SceneId;
  /**
   * For the export, which has no viewer (spec 03, section 3.1, rule 11): a scene that waits on
   * the viewer ends this long after its last stage command, as if it had finished, and goes on
   * with its transition. Unset (the Screening room, Rehearse), it waits until a block ends it.
   */
  readonly viewerWait?: Micros;
}

/** The player's fade commands come after anything the runtime sends at the same moment. */
const FADE_SEQ = 2 ** 30;

type Pending = { readonly at: Micros; readonly ending: SceneEnding };
type Phase =
  | { readonly kind: 'idle' }
  | { readonly kind: 'playing' }
  /** Fading to black until `until`, then loading `next`. */
  | { readonly kind: 'fadingOut'; readonly until: Micros; readonly then: () => PlayerAction[] }
  /** The film fades to black until `until`, then ends. */
  | { readonly kind: 'finishing'; readonly until: Micros }
  | { readonly kind: 'ended' };

export class ProductionPlayer {
  private readonly production: Production;
  private readonly options: PlayerOptions;
  private phase: Phase = { kind: 'idle' };
  private scene: SceneId | null = null;
  private started = 0;
  private lastCommandEnds: Micros = 0;
  private pending: Pending | null = null;
  /** True while `pending` is a waiting scene's `viewerWait` end, which later commands move on. */
  private waitingOut = false;
  private fadeSeq = FADE_SEQ;

  constructor(production: Production, options: PlayerOptions) {
    this.production = production;
    this.options = options;
  }

  /** The scene playing, if any. */
  current(): SceneId | null {
    return this.scene;
  }

  ended(): boolean {
    return this.phase.kind === 'ended';
  }

  /** Loads the first scene. */
  start(): PlayerAction[] {
    if (this.phase.kind !== 'idle') return [];
    const first = this.options.from ?? firstScene(this.production);
    if (first === null) return this.finish(null);
    return this.load(first, null, []);
  }

  /**
   * A message from the runtime worker, for the current scene only: after a `load`, the driver
   * drops whatever the old run still had in flight until that `load`'s `loaded` comes back (S2).
   */
  runtime(message: FromRuntime): PlayerAction[] {
    if (this.phase.kind !== 'playing') return [];
    switch (message.type) {
      case 'commands':
        for (const c of message.commands)
          this.lastCommandEnds = Math.max(this.lastCommandEnds, c.start + c.duration);
        if (this.waitingOut && this.pending)
          this.pending = {
            ...this.pending,
            at: Math.max(this.pending.at, this.lastCommandEnds + this.options.viewerWait!),
          };
        return [];
      case 'finished':
        // A scene that waits on the viewer carries on until a block ends it, or Stop; in an
        // export, until `viewerWait` after its last stage command.
        if (waitsForViewer(this.production.program, this.production, this.scene!)) {
          const wait = this.options.viewerWait;
          if (wait === undefined || this.pending) return [];
          this.waitingOut = true;
          this.pending = {
            at: Math.max(message.at, this.lastCommandEnds) + wait,
            ending: { kind: 'finished' },
          };
          return [];
        }
        this.pending ??= {
          at: Math.max(message.at, this.lastCommandEnds),
          ending: { kind: 'finished' },
        };
        return [];
      case 'sceneChange':
        this.waitingOut = false;
        this.pending = { at: message.at, ending: message.ending };
        return [];
      case 'error':
        // The driver shows the error with its block highlighted; play is over.
        this.phase = { kind: 'ended' };
        return [{ kind: 'stop' }];
      default:
        return [];
    }
  }

  /** The picture's scene time, for the scene playing. Endings happen when the picture gets there. */
  now(t: Micros): PlayerAction[] {
    const phase = this.phase;
    if (phase.kind === 'fadingOut' && t >= phase.until) {
      this.phase = { kind: 'playing' };
      return phase.then();
    }
    if (phase.kind === 'finishing' && t >= phase.until) {
      this.phase = { kind: 'ended' };
      return [{ kind: 'end', fadeOut: null }];
    }
    if (phase.kind !== 'playing' || !this.pending || t < this.pending.at) return [];
    const { at, ending } = this.pending;
    this.pending = null;
    this.waitingOut = false;
    // A scene that ended on its own may still have listeners running; one a block ended has stopped.
    const stop: PlayerAction[] = ending.kind === 'finished' ? [{ kind: 'stop' }] : [];
    return [...stop, ...this.after(at, ending)];
  }

  /** The learner pressed Stop. */
  stop(): PlayerAction[] {
    if (this.phase.kind === 'ended' || this.phase.kind === 'idle') return [];
    this.phase = { kind: 'ended' };
    return [{ kind: 'stop' }, { kind: 'end', fadeOut: null }];
  }

  /** What follows `ending`, which the picture reached at scene time `at`. */
  private after(at: Micros, ending: SceneEnding): PlayerAction[] {
    const p = this.production;
    const next = nextScene(p, this.scene!, ending, this.started);

    if (this.options.mode === 'rehearse') {
      if (next.kind === 'scene' && ending.kind !== 'finished') {
        const heading = p.storyboard.cards.find((c) => c.id === next.scene)?.heading ?? '';
        this.phase = { kind: 'ended' };
        return [
          { kind: 'next', scene: next.scene, heading },
          { kind: 'end', fadeOut: null },
        ];
      }
      if (next.kind !== 'noSuchScene') return this.finish(null);
    }

    switch (next.kind) {
      case 'end':
        return this.finish(next.fadeOut === null ? null : { at, duration: next.fadeOut });
      case 'noSuchScene':
        this.phase = { kind: 'ended' };
        return [
          { kind: 'fault', code: 'noSuchScene', message: `There's no scene called ${next.scene}.` },
          { kind: 'end', fadeOut: null },
        ];
      case 'tooManyScenes':
        this.phase = { kind: 'ended' };
        return [
          {
            kind: 'fault',
            code: 'tooManyScenes',
            message: `This film went to another scene ${next.limit} times, so StoryStage stopped it. Check where your scenes go next.`,
          },
          { kind: 'end', fadeOut: null },
        ];
      case 'scene':
        return this.transition(at, next.scene, next.transition);
    }
  }

  private transition(at: Micros, to: SceneId, transition: Transition): PlayerAction[] {
    switch (transition.kind) {
      case 'cut':
        return this.load(to, transition, []);
      case 'crossfade':
        return [
          { kind: 'crossfade', from: this.scene!, to, duration: transition.duration },
          ...this.load(to, transition, []),
        ];
      case 'fadeToBlack': {
        // Out over the first half on this scene; in over the second half on the next.
        const half = Math.round(transition.duration / 2);
        const fadeIn = [this.fade(0, 0, 1), this.fade(0, half, 0)];
        // The next scene loads only once the fade-out is over, so until then this one is current.
        this.phase = {
          kind: 'fadingOut',
          until: at + half,
          then: () => this.load(to, transition, fadeIn),
        };
        return [{ kind: 'stageCommands', commands: [this.fade(at, half, 1)] }];
      }
    }
  }

  /** Ends the film, after fading to black if `fade` says so. */
  private finish(fade: { at: Micros; duration: Micros } | null): PlayerAction[] {
    if (!fade) {
      this.phase = { kind: 'ended' };
      return [{ kind: 'end', fadeOut: null }];
    }
    const half = Math.round(fade.duration / 2);
    this.phase = { kind: 'finishing', until: fade.at + half };
    return [{ kind: 'stageCommands', commands: [this.fade(fade.at, half, 1)] }];
  }

  private load(
    scene: SceneId,
    transition: Transition | null,
    commands: StageCommand[],
  ): PlayerAction[] {
    const s = this.production.scenes.find((x) => x.id === scene);
    if (!s) {
      this.phase = { kind: 'ended' };
      return [
        { kind: 'fault', code: 'noSuchScene', message: `There's no scene called ${scene}.` },
        { kind: 'end', fadeOut: null },
      ];
    }
    this.started++;
    this.scene = scene;
    this.lastCommandEnds = 0;
    this.pending = null;
    this.waitingOut = false;
    this.phase = { kind: 'playing' };
    return [
      {
        kind: 'load',
        scene,
        entry: s.method,
        setup: s.setup,
        seed: (this.options.seed + this.started) | 0,
        scenes: this.production.scenes.map((x) => x.id),
        transition,
        commands,
      },
      ...this.preload(scene),
    ];
  }

  /** The running order's next scene after `scene`, to preload, in a production only. */
  private preload(scene: SceneId): PlayerAction[] {
    if (this.options.mode !== 'production') return [];
    const order = this.production.manifest.runningOrder;
    const following = order[order.findIndex((r) => r.scene === scene) + 1];
    const next = following && this.production.scenes.find((x) => x.id === following.scene);
    return next && next.id !== scene
      ? [{ kind: 'preload', scene: next.id, setup: next.setup }]
      : [];
  }

  private fade(start: Micros, duration: Micros, to: number): StageCommand {
    return {
      kind: 'fade',
      seq: this.fadeSeq++,
      object: SCENE,
      start,
      duration,
      style: 'beginAndEndAbruptly',
      to,
    };
  }
}
