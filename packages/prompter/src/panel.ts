/**
 * The Prompter panel's logic (`docs/spec/04-prompter.md` section 4.5, WP13c). The studio draws
 * the panel (spec 07, section 2.4); this is what it runs on: which state it is in, what the
 * learner has asked and been told, the plan and the learner's edits to it, and the request's one
 * undo step.
 */
import { indexProgram, type NodeId } from '@storystage/ast';
import type { Catalogue } from '@storystage/backstage';
import {
  isFramePlan,
  type FrameId,
  type FramePlan,
  type ProductionSession,
  type SceneId,
} from '@storystage/production';
import { backstageCandidates } from './backstage-data.ts';
import { productionData, storyboardData } from './context.ts';
import { modesAt, type PrompterLevel } from './levels.ts';
import { outcomeMessage, type OutcomeAction } from './outcomes.ts';
import type { PlanProblem, PlanStep } from './plans.ts';
import { releaseSystem, releaseTools } from './pins.ts';
import { PrompterRunner, type Plan, type RunnerSetup } from './runner.ts';
import {
  addRepeat as addRepeatStep,
  canRepeat,
  deleteStep as deleteSteps,
  heldBy,
  moveStep as moveSteps,
  repeatFits,
  stepsInsideMax,
  type AddRepeat,
  type PlanEdit,
  type StepsEdit,
} from './repeats.ts';
import { PrompterSession, type AskOutcome, type SessionEvent } from './session.ts';
import { SHIPPED_CATALOGUE } from './shipped-catalogue.ts';
import type { Json, PrompterMode, PrompterTransport, TransportErrorCode } from './transport.ts';

export type PanelPhase =
  | 'absent'
  | 'off'
  | 'notSetUp'
  | 'ready'
  | 'working'
  | 'planned'
  | 'building'
  | 'built'
  | 'limit'
  | 'problem';

/** One thing in the conversation, as the panel shows it. */
export type PanelEntry =
  | { readonly kind: 'asked'; readonly text: string }
  /** The Prompter's reply. While it streams, `done` is false and `text` grows. */
  | { readonly kind: 'reply'; readonly text: string; readonly done: boolean }
  | { readonly kind: 'explain'; readonly text: string }
  /**
   * A change that landed, with its plan step, for the narration queue. `nodes` are the blocks it
   * added, the step's comment among them, for the editor's `highlight`. Empty for a change to the
   * scene's set-up alone.
   */
  | {
      readonly kind: 'change';
      readonly text: string;
      readonly step?: number;
      readonly nodes: readonly NodeId[];
    }
  | { readonly kind: 'fresh' };

/** The plan on show: as the Prompter made it, and as the learner has edited it. */
export interface PanelPlan {
  readonly plan: string;
  readonly frame: string | null;
  readonly shown: readonly PlanStep[];
  readonly steps: readonly PlanStep[];
  /** Problems with the learner's version, by step from 1. Build waits until there are none. */
  readonly problems: readonly PlanProblem[];
  /**
   * Plan only (section 6.6): one flag a step of `steps`, set when what the learner built matches
   * it. All false at the other levels, where the Prompter builds.
   */
  readonly done: readonly boolean[];
  /**
   * Repeating several steps (section 6.8), one entry a step of `steps`: the index of the repeat
   * step that holds it, or null.
   */
  readonly heldBy: readonly (number | null)[];
  /** For a repeat step, the most its Steps inside can be; null for any other step. */
  readonly stepsInsideMax: readonly (number | null)[];
  /** Whether Add a step › Repeat… is offered. */
  readonly canRepeat: boolean;
}

export interface PanelState {
  readonly phase: PanelPhase;
  /** The modes the level allows, for the panel to offer. */
  readonly modes: readonly PrompterMode[];
  readonly mode: PrompterMode;
  readonly entries: readonly PanelEntry[];
  readonly plan: PanelPlan | null;
  /** Whether Build these steps is offered: a plan with no problems, at a level that builds. */
  readonly canBuild: boolean;
  /** Whether Undo this request is offered. */
  readonly canUndo: boolean;
  /**
   * Whether Try again is offered: a problem whose action is `tryAgain`, from a request that changed
   * nothing. A build that stopped part-way is undone first, not built again on top.
   */
  readonly canRetry: boolean;
  /** What went wrong, in plain words, and what to do about it. */
  readonly message: { readonly text: string; readonly action?: OutcomeAction } | null;
}

export interface PanelSetup<S extends string = string> {
  readonly prompter: PrompterSession;
  readonly runner: PrompterRunner<S>;
  readonly transport: PrompterTransport;
  /** The open production and its undo history, which the runner changes too. */
  readonly production: ProductionSession<S>;
  /** The history's name for the Prompter's changes: the runner's `source`. */
  readonly source: S;
  readonly level: () => PrompterLevel;
  readonly scene: () => SceneId;
  readonly openMethod?: () => NodeId | null;
  readonly checkResult?: (frame: FrameId) => Json | null;
  /** False in the browser version, where there is no panel at all. Default true. */
  readonly inBuild?: boolean;
  /** The clock, for when a Plan only plan's first step was ticked. Default: now. */
  readonly now?: () => Date;
  /** The catalogue `<backstage_data>` is chosen from: this release's (section 2.7). Tests may give another. */
  readonly catalogue?: Catalogue;
}

/** A plan's repeats as the panel draws them (section 6.8). */
const repeatState = (steps: readonly PlanStep[]) => ({
  heldBy: heldBy(steps),
  stepsInsideMax: stepsInsideMax(steps),
  canRepeat: canRepeat(steps),
});

/** The modes that place models, so their requests carry Backstage's lines (section 2.7). */
const PLACING: readonly PrompterMode[] = ['explain', 'showMeHow', 'buildIt'];

export const BUILD_REQUEST = 'Build these steps.';

type RequestExtra = {
  readonly frame?: FrameId;
  /** The check item asked about, by its id in the frame's check result. */
  readonly item?: string;
  readonly agreedPlan?: Json;
};

/** What a question is about: a frame, and one item of its check (11.6). */
export interface AskAbout {
  readonly frame?: FrameId;
  /**
   * A check item's id. The check result then says `asked`, so the question needn't quote the
   * item's words: they come from the file, and belong in the data, not in the learner's request.
   */
  readonly item?: string;
}
const BUILDS: readonly PrompterMode[] = ['showMeHow', 'buildIt'];
const BLOCKED: Partial<Record<TransportErrorCode, PanelPhase>> = {
  prompter_off: 'off',
  refused_by_policy: 'off',
  no_key: 'notSetUp',
};

export class PrompterPanel<S extends string = string> {
  readonly #setup: PanelSetup<S>;
  readonly #listeners = new Set<(state: PanelState) => void>();
  #state: PanelState;
  #stop: AbortController | null = null;
  /** The history's length just after this panel's last build, while Undo this request stands. */
  #built: number | null = null;
  /** The last request, as it was sent, for Try again. */
  #last: { readonly text: string; readonly extra: RequestExtra } | null = null;
  /** Whether the last request may be sent again: it changed nothing. */
  #retryable = false;
  /** The program's blocks when the plan on show was shown, for Plan only's ticks (6.6). */
  #before: ReadonlySet<NodeId> | null = null;
  /** What was last kept with the plan's frame in Plan only, and when its first step was ticked. */
  #kept: { readonly agreedAt: string; readonly key: string } | null = null;
  readonly #unsubscribe: () => void;

  constructor(setup: PanelSetup<S>) {
    this.#setup = setup;
    // Plan only's ticks follow the program, whatever changes it: the learner, Undo, or Redo.
    this.#unsubscribe = setup.production.subscribe(() => this.#progress());
    const modes = modesAt(setup.level());
    this.#state = {
      phase: setup.inBuild === false ? 'absent' : 'ready',
      modes,
      mode: modes[0] ?? 'explain',
      entries: [],
      plan: null,
      canBuild: false,
      canUndo: false,
      canRetry: false,
      message: null,
    };
  }

  get state(): PanelState {
    return this.#state;
  }

  /** Stops following the production, when the studio is done with this panel. */
  dispose(): void {
    this.#unsubscribe();
  }

  subscribe(listener: (state: PanelState) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #set(change: Partial<PanelState>): void {
    const next = { ...this.#state, ...change };
    const builds = this.#setup.level() !== 'planOnly' && BUILDS.includes(next.mode);
    this.#state = {
      ...next,
      canBuild:
        builds &&
        next.plan !== null &&
        next.plan.steps.length > 0 &&
        next.plan.problems.length === 0 &&
        next.phase === 'planned',
      canUndo: next.phase === 'planned' || this.#undoable(),
      canRetry:
        this.#retryable &&
        this.#last !== null &&
        next.phase === 'problem' &&
        next.message?.action === 'tryAgain',
    };
    for (const listener of this.#listeners) listener(this.#state);
  }

  #undoable(): boolean {
    if (this.#built === null) return false;
    const history = this.#setup.production.history().filter((h) => h.done);
    const last = history.at(-1);
    return history.length === this.#built && last?.source === this.#setup.source;
  }

  #add(entry: PanelEntry): void {
    this.#set({ entries: [...this.#state.entries, entry] });
  }

  /** More of the reply streaming in: the reply being written grows, or a new one starts. */
  #reply(text: string): void {
    const entries = this.#state.entries;
    const last = entries.at(-1);
    if (last?.kind === 'reply' && !last.done)
      this.#set({ entries: [...entries.slice(0, -1), { ...last, text: last.text + text }] });
    else this.#add({ kind: 'reply', text, done: false });
  }

  /** The reply being written is complete, for a screen reader to read once. */
  #endReply(): void {
    const entries = this.#state.entries;
    const last = entries.at(-1);
    if (last?.kind === 'reply' && !last.done)
      this.#set({ entries: [...entries.slice(0, -1), { ...last, done: true }] });
  }

  /**
   * Reads the level and the native layer's status again: on opening, and when either changes. A
   * level that is now Off (a teacher's lock, or a study task, spec 14 section 6.5) stops any
   * request in flight.
   */
  async refresh(): Promise<void> {
    if (this.#state.phase === 'absent') return;
    const modes = modesAt(this.#setup.level());
    const mode = modes.includes(this.#state.mode) ? this.#state.mode : (modes[0] ?? 'explain');
    if (modes.length === 0) {
      this.#stop?.abort();
      this.#set({ modes, mode, phase: 'off', message: null });
      return;
    }
    const status = await this.#setup.transport.status();
    if (status.available) {
      // Limit reached keeps the class's words until the next request (spec 07, section 2.4):
      // the studio refreshes there only so the modes drop what the lowered level leaves out.
      const idle = ['off', 'notSetUp', 'problem'].includes(this.#state.phase);
      this.#set({ modes, mode, ...(idle ? { phase: 'ready', message: null } : {}) });
      return;
    }
    const blocked = BLOCKED[status.reason];
    if (blocked) this.#set({ modes, mode, phase: blocked, message: null });
    else
      this.#set({
        modes,
        mode,
        phase: 'problem',
        message: outcomeMessage({
          status: 'error',
          code: status.reason,
          toolCalls: 0,
          changes: 0,
          fresh: false,
        }),
      });
  }

  setMode(mode: PrompterMode): void {
    if (this.#state.modes.includes(mode)) this.#set({ mode });
  }

  get #busy(): boolean {
    return this.#state.phase === 'working' || this.#state.phase === 'building';
  }

  /**
   * Ask, in the current mode. `about.frame` sends that frame's check result with the request
   * (the studio's `checkResult`), as the frame card's Ask the Prompter does for a flag (11.6).
   */
  ask(text: string, about: AskAbout = {}): Promise<void> {
    if (about.frame === undefined) return this.#run(text, {});
    return this.#run(text, {
      frame: about.frame,
      ...(about.item === undefined ? {} : { item: about.item }),
    });
  }

  /** Code this frame: a plan for frame `frame`. */
  codeFrame(frame: FrameId): Promise<void> {
    return this.#run(`Code frame ${frame}.`, { frame });
  }

  /** Build these steps: the learner's version of the plan, as agreed. */
  async build(): Promise<void> {
    const plan = this.#state.plan;
    if (!this.#state.canBuild || !plan) return;
    await this.#run(BUILD_REQUEST, {
      agreedPlan: { plan: plan.plan, frame: plan.frame, steps: plan.steps } as unknown as Json,
    });
  }

  stop(): void {
    this.#stop?.abort();
  }

  /**
   * Undo this request. In Planned, nothing is built yet, so it drops the plan. Otherwise it
   * undoes the request's one step, while that is still the latest in the history.
   */
  undoRequest(): void {
    if (this.#busy) return;
    if (this.#state.phase === 'planned') {
      this.#set({ phase: 'ready', plan: null, message: null });
      return;
    }
    if (!this.#undoable()) return;
    this.#setup.production.undo();
    this.#built = null;
    this.#set({ phase: 'ready', message: null });
  }

  /** New conversation: the learner's button. */
  restart(): void {
    if (this.#busy) return;
    this.#setup.prompter.reset();
    this.#last = null;
    this.#built = null;
    this.#set({ entries: [], plan: null, phase: 'ready', message: null });
  }

  // ---- Editing the plan (section 6.1, step 5) -----------------------------------------------

  /** An edit to the learner's plan: the new steps, or none when it's refused (6.8's words). */
  #edit(change: (steps: PlanStep[]) => StepsEdit | PlanStep[]): PlanEdit {
    const plan = this.#state.plan;
    if (!plan || this.#busy) return { ok: false };
    const made = change([...plan.steps]);
    const { steps, words } = Array.isArray(made) ? { steps: made, words: undefined } : made;
    if (steps === null) return words ? { ok: false, words } : { ok: false };
    this.#set({
      plan: {
        ...plan,
        ...repeatState(steps),
        steps,
        problems: this.#setup.runner.checkSteps(steps, plan.frame),
        done: this.#ticks(steps, plan.frame),
      },
    });
    this.#keep();
    return words ? { ok: true, words } : { ok: true };
  }

  // ---- Plan only's ticks (section 6.6) ------------------------------------------------------

  #ticks(steps: readonly PlanStep[], frame: string | null): boolean[] {
    if (this.#setup.level() !== 'planOnly' || this.#before === null) return steps.map(() => false);
    return this.#setup.runner.progress(steps, frame, this.#before);
  }

  /** Works the ticks out again after the production changed. */
  #progress(): void {
    const plan = this.#state.plan;
    if (!plan || this.#busy) return;
    const done = this.#ticks(plan.steps, plan.frame);
    if (done.length === plan.done.length && done.every((d, i) => d === plan.done[i])) return;
    this.#set({ plan: { ...plan, done } });
    this.#keep();
  }

  /**
   * Keeps a Plan only plan with its frame, outside undo (`keepPlans`), from its first tick, and
   * again whenever its steps or ticks change. A plan with no frame, or one the format wouldn't
   * keep, isn't kept.
   */
  #keep(): void {
    const plan = this.#state.plan;
    if (!plan?.frame || this.#setup.level() !== 'planOnly') return;
    const done = plan.done.flatMap((d, i) => (d ? [i + 1] : []));
    if (this.#kept === null && done.length === 0) return;
    const key = JSON.stringify([plan.shown, plan.steps, done]);
    if (this.#kept?.key === key) return;
    const agreedAt = this.#kept?.agreedAt ?? (this.#setup.now?.() ?? new Date()).toISOString();
    const kept: FramePlan = { agreedAt, shown: plan.shown, agreed: plan.steps, done };
    if (!isFramePlan(kept)) return;
    const result = this.#setup.production.keepPlans(new Map([[plan.frame as FrameId, kept]]));
    if (result.ok) this.#kept = { agreedAt, key };
  }

  /**
   * Moves a step to `to`, its place after the move. A repeat moves with the steps it holds; a
   * step can't be moved inside a repeat unless it's a block (section 6.8).
   */
  moveStep(from: number, to: number): PlanEdit {
    return this.#edit((steps) =>
      to >= steps.length && steps[from]?.kind !== 'repeat'
        ? { steps: null }
        : moveSteps(steps, from, to),
    );
  }

  /** Deletes a step. A repeat that holds nothing then goes too, and the result says so. */
  deleteStep(index: number): PlanEdit {
    return this.#edit((steps) => deleteSteps(steps, index));
  }

  /** Repeat…: "Repeat 2 times:" before the last step, holding it (section 6.8). */
  addRepeat(): AddRepeat {
    const before = this.#state.plan?.steps.length ?? 0;
    const edit = this.#edit((steps) => {
      const made = addRepeatStep(steps);
      if (!made.steps) return made;
      const at = made.steps.length - 2;
      made.steps[at] = this.#worded(made.steps[at]!, false);
      return made;
    });
    return edit.ok ? { ...edit, index: before - 1 } : edit;
  }

  /**
   * Changes a step's values. Its words are written again from what it now does (`stepWords`),
   * unless the change gives words of its own, so the plan never describes a different step.
   */
  changeStep(index: number, change: Partial<PlanStep>): PlanEdit {
    return this.#edit((steps) => {
      const s = steps[index];
      if (s === undefined) return { steps: null };
      const next = { ...s, ...change };
      // A repeat's How many times and Steps inside stay within their limits (section 6.8).
      if (!repeatFits(steps, index, next)) return { steps: null };
      // A change that changes nothing, such as Save with nothing changed, keeps the words.
      const same = (Object.keys(change) as (keyof PlanStep)[]).every(
        (k) => JSON.stringify(next[k]) === JSON.stringify(s[k]),
      );
      return steps.map((step, i) =>
        i !== index ? step : same ? s : this.#worded(next, 'words' in change),
      );
    });
  }

  /** Adds a step. One with no words gets them from what it does. */
  addStep(step: PlanStep, at = Infinity): PlanEdit {
    return this.#edit((steps) => {
      steps.splice(Math.min(at, steps.length), 0, this.#worded(step, step.words.trim() !== ''));
      return steps;
    });
  }

  #worded(step: PlanStep, keep: boolean): PlanStep {
    if (keep) return step;
    const frame = this.#state.plan?.frame ?? null;
    return { ...step, words: this.#setup.runner.stepWords(step, frame) };
  }

  /**
   * Try again: the last request, as it was sent (Ask, Code this frame, or Build these steps with
   * the plan as it stands now). Only while `canRetry`.
   */
  retry(): Promise<void> {
    const last = this.#last;
    if (!this.#state.canRetry || !last) return Promise.resolve();
    if (last.extra.agreedPlan === undefined) return this.#run(last.text, last.extra);
    const plan = this.#state.plan;
    if (!plan || plan.problems.length > 0) return Promise.resolve();
    return this.#run(last.text, {
      agreedPlan: { plan: plan.plan, frame: plan.frame, steps: plan.steps } as unknown as Json,
    });
  }

  // ---- Running a request --------------------------------------------------------------------

  async #run(text: string, extra: RequestExtra): Promise<void> {
    const phase = this.#state.phase;
    if (this.#busy || ['absent', 'off', 'notSetUp'].includes(phase)) return;
    this.#last = { text, extra };
    this.#retryable = false;
    const level = this.#setup.level();
    const building = extra.agreedPlan !== undefined;
    const shownBefore = this.#setup.runner.latestPlan();
    this.#stop = new AbortController();
    this.#add({ kind: 'asked', text });
    this.#set({ phase: building ? 'building' : 'working', message: null });

    const production = this.#setup.production.production();
    const place = { scene: this.#setup.scene(), open: this.#setup.openMethod?.() ?? null };
    const found = extra.frame ? this.#setup.checkResult?.(extra.frame) : undefined;
    // Which item the question is about goes with the result, as data.
    const checkResult =
      found && extra.item !== undefined && typeof found === 'object' && !Array.isArray(found)
        ? { ...found, asked: extra.item }
        : found;
    const catalogue = this.#setup.catalogue ?? SHIPPED_CATALOGUE;
    const planFrame = (extra.agreedPlan as { frame?: unknown } | undefined)?.frame;
    const backstage = PLACING.includes(this.#state.mode)
      ? {
          catalogue,
          candidates: backstageCandidates(catalogue, production, {
            scene: place.scene,
            frame: extra.frame ?? (typeof planFrame === 'string' ? (planFrame as FrameId) : null),
            request: text,
          }),
        }
      : undefined;
    const nodesNow = () => new Set(indexProgram(this.#setup.production.program()).keys());
    let known = nodesNow();
    const onEvent = (event: SessionEvent) => {
      if (event.type === 'text') {
        this.#reply(event.text);
        return;
      }
      this.#endReply();
      if (event.type === 'fresh') this.#add({ kind: 'fresh' });
      else if (event.type === 'explain') this.#add({ kind: 'explain', text: event.text });
      else {
        // The runner has made the change by now: what's new in the program is what landed.
        const now = nodesNow();
        const nodes = [...now].filter((id) => !known.has(id));
        known = now;
        this.#add({
          kind: 'change',
          text: event.text,
          ...(event.step === undefined ? {} : { step: event.step }),
          nodes,
        });
      }
    };

    let outcome: AskOutcome;
    try {
      outcome = await this.#setup.prompter.ask(text, {
        mode: this.#state.mode,
        level,
        production: productionData(production, place),
        storyboard: storyboardData(production, place),
        ...(backstage === undefined ? {} : { backstage }),
        ...(checkResult === undefined || checkResult === null ? {} : { checkResult }),
        ...(building ? { agreedPlan: extra.agreedPlan } : {}),
        signal: this.#stop.signal,
        onEvent,
      });
    } catch {
      outcome = { status: 'error', code: 'internal', toolCalls: 0, changes: 0, fresh: false };
    }
    this.#endReply();
    this.#stop = null;
    this.#finish(outcome, shownBefore, building);
  }

  #finish(outcome: AskOutcome, shownBefore: Plan | undefined, building: boolean): void {
    this.#retryable = outcome.changes === 0;
    if (outcome.changes > 0)
      this.#built = this.#setup.production.history().filter((h) => h.done).length;
    const shown = this.#setup.runner.latestPlan();
    const newPlan = shown !== undefined && shown !== shownBefore;
    if (newPlan) {
      // What's there now is from before the plan, so it ticks nothing (6.6).
      this.#before = new Set(indexProgram(this.#setup.production.program()).keys());
      this.#kept = null;
    }
    const plan: PanelPlan | null = newPlan
      ? {
          plan: shown.plan,
          frame: shown.frame,
          shown: shown.steps,
          steps: shown.steps,
          problems: [],
          done: shown.steps.map(() => false),
          ...repeatState(shown.steps),
        }
      : building && outcome.changes > 0
        ? null
        : this.#state.plan;
    const message = outcomeMessage(outcome);

    // Turned off while it ran: it stays off, whatever the request ended with.
    if (modesAt(this.#setup.level()).length === 0) {
      this.#set({ phase: 'off', plan, message: null, modes: [] });
      return;
    }
    if (outcome.status === 'error' && outcome.code && BLOCKED[outcome.code]) {
      this.#set({ phase: BLOCKED[outcome.code], plan, message: null });
      return;
    }
    if (outcome.status === 'error' && outcome.code === 'cap_reached') {
      this.#set({ phase: 'limit', plan, message, modes: modesAt(this.#setup.level()) });
      return;
    }
    const phase: PanelPhase =
      message !== null && outcome.status !== 'stopped'
        ? 'problem'
        : outcome.changes > 0
          ? 'built'
          : plan !== null
            ? 'planned'
            : 'ready';
    this.#set({ phase, plan, message: outcome.status === 'stopped' ? null : message });
    // A plan just shown may already have a step done, such as a set-up the scene has.
    if (newPlan) this.#progress();
  }
}

/** What the studio gives `createPrompterPanel`: the runner's setup, and the panel's. */
export interface PrompterPanelOptions<S extends string = string>
  extends
    Omit<RunnerSetup<S>, 'session'>,
    Omit<PanelSetup<S>, 'prompter' | 'runner' | 'production' | 'source'> {
  readonly production: ProductionSession<S>;
}

/**
 * The Prompter as the studio sets it up: the tool runner on the open production, the request
 * loop with this release's pinned `system` and `tools` (section 1.9), and the panel over both.
 */
export function createPrompterPanel<S extends string>(
  options: PrompterPanelOptions<S>,
): PrompterPanel<S> {
  const { production, transport, ...rest } = options;
  const runner = new PrompterRunner<S>({ ...rest, session: production });
  const prompter = new PrompterSession({
    transport,
    system: releaseSystem(),
    tools: releaseTools(),
    runner,
    newId: () => globalThis.crypto.randomUUID(),
  });
  return new PrompterPanel<S>({ ...rest, prompter, runner, transport, production });
}
