/**
 * WP8.2: the production's undo session (`docs/spec/03-production-format.md`, section 2.1).
 *
 * A production changes in two places at once: its program, through AST edits, and everything
 * else (set-ups, cards, frames, lines, the running order), which are immutable values. One step a
 * learner takes can touch both: adding a scene declares a type and adds a set-up and a card;
 * moving an object on the stage touches only a set-up. Each must be one undo step.
 *
 * So a step holds its program edits with the edits that undo them, and the rest of the production
 * before and after. Undo runs the inverses and puts the "before" back; redo the reverse. Holding
 * two snapshots is cheap, because they share everything that didn't change.
 *
 * `apply`, `begin`, `commit`, `cancel`, `undo`, `redo`, `history` and `goTo` behave as
 * `EditSession`'s do (`packages/ast`), so the code editors' host can use this in its place, and
 * every change, from code or the stage, goes through one history.
 *
 * One thing goes around the history: a frame's automatic check (`annotate`, spec 08 section 9.6).
 * Running a check isn't the learner's change, so it's no undo step, and its latest result stays
 * through undo and redo; its `basis` says whether it still fits what's there. Keeping a flag is
 * the learner's choice, an ordinary step. So does a plan kept in Plan only (`keepPlans`, format
 * 1.7.0), whose ticks code works out as the learner builds.
 */
import {
  EditRefused,
  applyAll,
  applyEdit,
  indexProgram,
  validateProgram,
  type EditOperation,
  type HistoryEntry,
  type Problem,
  type Program,
  type SessionResult,
} from '@storystage/ast';
import type { ObjectId, SceneSetup } from '@storystage/story-api';
import { isFramePlan } from './plan.ts';
import type { SceneStep } from './scenes.ts';
import {
  sceneMethodCheck,
  type Frame,
  type FrameCheck,
  type FrameId,
  type FramePlan,
  type Production,
  type Scene,
} from './types.ts';
import { renameVoices, voiceNames } from './voices.ts';

/** Everything in a production but its program. */
export type ProductionRest = Omit<Production, 'program'>;

export interface ProductionChange<Source extends string = string> {
  readonly production: Production;
  /** The program edits this change ran; empty when only the rest changed. */
  readonly edits: readonly EditOperation[];
  readonly label: string;
  readonly source: Source | 'undo' | 'redo' | 'load' | 'check';
}

/** A frame's check result as `annotate` takes it: the flags kept are the frame's own. */
export type CheckResult = Omit<FrameCheck, 'kept'>;

export interface ProductionSessionOptions {
  /** More rules for every program edit, such as the Story API's (spec 01, section 4.5). */
  readonly check?: (program: Program) => readonly Problem[];
  /** Set for a file from a newer version: every change is refused with this message. */
  readonly readOnly?: string;
}

interface Step<Source> {
  readonly label: string;
  readonly source: Source;
  readonly edits: EditOperation[];
  /** The edits that undo `edits`, in the order to run them. */
  inverses: EditOperation[];
  readonly before: ProductionRest;
  after: ProductionRest;
}

const restOf = ({ program: _program, ...rest }: Production): ProductionRest => rest;

export class ProductionSession<Source extends string = string> {
  private current: Production;
  private done: Step<Source>[] = [];
  private undone: Step<Source>[] = [];
  private open: Step<Source> | null = null;
  private readonly listeners = new Set<(change: ProductionChange<Source>) => void>();
  private readonly options: ProductionSessionOptions;
  /** Each frame's latest check result (`annotate`), laid over whatever undo or redo puts back. */
  private checks = new Map<FrameId, CheckResult | null>();
  /** Each frame's plan kept in Plan only (`keepPlans`), laid over the same way. */
  private plans = new Map<FrameId, FramePlan | null>();

  constructor(production: Production, options: ProductionSessionOptions = {}) {
    this.current = production;
    this.options = options;
  }

  production(): Production {
    return this.current;
  }

  /** The program, for the code editors' host. */
  program(): Program {
    return this.current.program;
  }

  /**
   * Program edits from a code editor or the Prompter, as one step, all or nothing. A rename or
   * removal of a field that holds a scene object changes that scene's set-up in the same step
   * (spec 03, section 2.1). A scene's script method can't be removed (`sceneMethodCheck`).
   */
  apply(edits: readonly EditOperation[], label: string, source: Source): SessionResult {
    if (this.options.readOnly !== undefined) return { ok: false, reason: this.options.readOnly };
    if (edits.length === 0) return { ok: true };
    const scenes = this.current.scenes;
    const extra = this.options.check;
    const methods = sceneMethodCheck(scenes);
    const check = (program: Program) => [...methods(program), ...(extra ? extra(program) : [])];
    let applied: { readonly program: Program; readonly inverses: readonly EditOperation[] };
    try {
      applied = applyAll(this.current.program, edits, { check });
    } catch (e) {
      if (e instanceof EditRefused) return { ok: false, reason: e.reason };
      throw e;
    }
    const before = restOf(this.current);
    const kept = keepSetupsInStep(this.current.program, scenes, edits);
    // A character's voice goes with its name, in the same step (spec 03 section 1.6).
    const voices = renameVoices(
      before.manifest.voices,
      kept.renamed,
      voiceNames({ scenes: kept.scenes }),
    );
    const after: ProductionRest = {
      ...before,
      scenes: kept.scenes,
      ...(voices !== before.manifest.voices && voices
        ? { manifest: { ...before.manifest, voices } }
        : {}),
    };
    this.record(label, source, [...edits], [...applied.inverses].reverse(), before, after);
    this.set({ ...after, program: applied.program }, edits, label, source);
    return { ok: true };
  }

  /**
   * A step made by `addScene`, `deleteScene`, `moveScene`, `renameScene` or `duplicateScene`
   * from this session's `production()`.
   */
  step(step: SceneStep, source: Source): SessionResult {
    if (this.options.readOnly !== undefined) return { ok: false, reason: this.options.readOnly };
    const before = restOf(this.current);
    this.record(
      step.label,
      source,
      [...step.edits],
      [...step.inverses],
      before,
      restOf(step.production),
    );
    this.set(step.production, step.edits, step.label, source);
    return { ok: true };
  }

  /**
   * A change to anything but the program, as one step: moving an object on the stage, editing a
   * card, a frame or a line. `update` gets the production and returns the new rest of it.
   */
  change(label: string, source: Source, update: (p: Production) => ProductionRest): SessionResult {
    if (this.options.readOnly !== undefined) return { ok: false, reason: this.options.readOnly };
    const before = restOf(this.current);
    const after = update(this.current);
    if (after === before) return { ok: true };
    this.record(label, source, [], [], before, after);
    this.set({ ...after, program: this.current.program }, [], label, source);
    return { ok: true };
  }

  /**
   * Saves check results on their frames outside the history (spec 08 section 9.6): no undo step,
   * and undo and redo keep them. `null` removes a frame's result. A frame keeps its `kept`, which
   * changes only through `change`, as an undo step. A frame that isn't there is skipped, and gets
   * its result if undo brings it back.
   */
  annotate(results: ReadonlyMap<FrameId, CheckResult | null>): SessionResult {
    if (this.options.readOnly !== undefined) return { ok: false, reason: this.options.readOnly };
    if (results.size === 0) return { ok: true };
    for (const [frame, result] of results) this.checks.set(frame, result);
    const { program, ...rest } = this.current;
    this.set({ ...this.withChecks(rest), program }, [], 'Check', 'check');
    return { ok: true };
  }

  /**
   * Saves plans on their frames outside the history, as `annotate` saves check results (format
   * 1.7.0, spec 04 section 6.6; the owner's choice of 20 Nov 2026): in Plan only, code ticks the
   * learner's steps off as what they build matches them, and keeping that is no step of the
   * learner's, so an Undo takes back the block they added, not an unseen keep. Undo and redo
   * leave a kept plan where it is; `null` removes a frame's plan. A frame that isn't there is
   * skipped, and gets its plan if undo brings it back. A learner's own step that changes a
   * frame's plan (agreeing a new one) drops the plan kept for it here, so that step's plan shows
   * and undo can take it back. That's judged by object, so a step should keep a frame's `plan`
   * object as it is unless it means to change the plan: a copy, even an equal one, takes over.
   *
   * A plan the format wouldn't keep (`isFramePlan`) refuses the whole call, as `withFramePlan`
   * does, and keeps none of them (S7's review): saved, it would be dropped when the file next
   * opened, and the teacher would lose it with nobody told.
   *
   * Keeping a plan equal to the one its frame has changes nothing and tells no listener (S5's
   * review), so a panel that works the ticks out on every change can keep on every change
   * without looping.
   */
  keepPlans(plans: ReadonlyMap<FrameId, FramePlan | null>): SessionResult {
    if (this.options.readOnly !== undefined) return { ok: false, reason: this.options.readOnly };
    if (plans.size === 0) return { ok: true };
    const unfit = [...plans].filter(([, plan]) => plan !== null && !isFramePlan(plan));
    if (unfit.length > 0)
      return {
        ok: false,
        reason: `Not a plan the format keeps, for frame ${unfit.map(([f]) => f).join(', ')}.`,
      };
    const now = new Map(this.current.frames.map((f) => [f.id, f.plan]));
    for (const [frame, plan] of plans) {
      // The same plan, written afresh, keeps the frame's own object, so nothing changes.
      const was = now.get(frame);
      const same =
        plan !== null && was !== undefined && JSON.stringify(was) === JSON.stringify(plan);
      this.plans.set(frame, same ? was : plan);
    }
    const { program, ...rest } = this.current;
    const next = this.withChecks(rest);
    if (next !== rest) this.set({ ...next, program }, [], 'Keep the plan', 'check');
    return { ok: true };
  }

  /** Opens a step that later changes join: a whole Prompter request is one undo step. */
  begin(label: string, source: Source): void {
    if (this.open) throw new Error('A group is already open.');
    const rest = restOf(this.current);
    this.open = { label, source, edits: [], inverses: [], before: rest, after: rest };
  }

  /**
   * Renames the open step for its latest change: a run of key presses on one slider is one step,
   * named for where it ended ("Set Music to 60%", 07-ux section 7.7).
   */
  relabel(label: string): void {
    if (!this.open) throw new Error('No group is open.');
    this.open = { ...this.open, label };
  }

  commit(): void {
    const step = this.closeGroup();
    if (step.edits.length > 0 || step.after !== step.before) this.done.push(step);
  }

  /** Takes back everything done since `begin`. */
  cancel(): void {
    const step = this.closeGroup();
    if (step.edits.length > 0 || step.after !== step.before) this.runBack(step, step.label);
  }

  undo(): void {
    if (this.open) return;
    const step = this.done.pop();
    if (!step) return;
    this.undone.push(step);
    this.runBack(step, step.label);
  }

  redo(): void {
    if (this.open) return;
    const step = this.undone.pop();
    if (!step) return;
    this.done.push(step);
    const program = run(this.current.program, step.edits);
    this.set({ ...this.withChecks(step.after), program }, step.edits, step.label, 'redo');
  }

  undoLabel(): string | null {
    return this.done.at(-1)?.label ?? null;
  }

  redoLabel(): string | null {
    return this.undone.at(-1)?.label ?? null;
  }

  /** Every step, oldest first. */
  history(): HistoryEntry<Source>[] {
    const entry =
      (done: boolean) =>
      ({ label, source }: Step<Source>): HistoryEntry<Source> => ({ label, source, done });
    return [...this.done.map(entry(true)), ...this.undone.map(entry(false)).reverse()];
  }

  /** Undoes or redoes until `count` steps are done, as the history panel does. */
  goTo(count: number): void {
    const total = this.done.length + this.undone.length;
    if (!Number.isInteger(count) || count < 0 || count > total)
      throw new Error(`There is no step ${count}.`);
    while (this.done.length > count) this.undo();
    while (this.done.length < count) this.redo();
  }

  subscribe(listener: (change: ProductionChange<Source>) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Starts afresh with another production and an empty history, as opening a file does. */
  load(production: Production): void {
    if (this.open) throw new Error('Close the open group before loading.');
    const problems = validateProgram(production.program);
    if (problems.length > 0) throw new Error(`Not a valid program: ${problems[0]!.message}`);
    this.done = [];
    this.undone = [];
    this.checks = new Map();
    this.plans = new Map();
    this.set(production, [], 'Open', 'load');
  }

  private record(
    label: string,
    source: Source,
    edits: EditOperation[],
    inverses: EditOperation[],
    before: ProductionRest,
    after: ProductionRest,
  ): void {
    // A step of the learner's that changes a frame's plan takes it over from `keepPlans`.
    if (this.plans.size > 0 && after.frames !== before.frames) {
      const was = new Map(before.frames.map((f) => [f.id, f.plan]));
      for (const frame of after.frames)
        if (this.plans.has(frame.id) && frame.plan !== was.get(frame.id))
          this.plans.delete(frame.id);
    }
    if (this.open) {
      this.open.edits.push(...edits);
      this.open.inverses = [...inverses, ...this.open.inverses];
      this.open.after = after;
    } else this.done.push({ label, source, edits, inverses, before, after });
    this.undone = [];
  }

  private closeGroup(): Step<Source> {
    if (!this.open) throw new Error('No group is open.');
    const step = this.open;
    this.open = null;
    return step;
  }

  private runBack(step: Step<Source>, label: string): void {
    const program = run(this.current.program, step.inverses);
    this.set({ ...this.withChecks(step.before), program }, step.inverses, label, 'undo');
  }

  /**
   * `rest` with each frame's latest check result laid over it, and its own `kept`; and each plan
   * kept in Plan only (`keepPlans`).
   */
  private withChecks(rest: ProductionRest): ProductionRest {
    if (this.checks.size === 0 && this.plans.size === 0) return rest;
    let changed = false;
    const frames = rest.frames.map((frame): Frame => {
      let out = frame;
      if (this.checks.has(frame.id)) {
        const result = this.checks.get(frame.id)!;
        const { check, ...without } = out;
        if (result === null) {
          if (check !== undefined) out = without;
        } else if (check?.basis !== result.basis || check.items !== result.items)
          out = { ...out, check: { ...result, kept: check?.kept ?? [] } };
      }
      if (this.plans.has(frame.id)) {
        const plan = this.plans.get(frame.id)!;
        const { plan: was, ...without } = out;
        if (plan === null) {
          if (was !== undefined) out = without;
        } else if (was !== plan) out = { ...out, plan };
      }
      if (out !== frame) changed = true;
      return out;
    });
    return changed ? { ...rest, frames } : rest;
  }

  private set(
    production: Production,
    edits: readonly EditOperation[],
    label: string,
    source: ProductionChange<Source>['source'],
  ): void {
    this.current = production;
    const change = { production, edits, label, source };
    for (const listener of [...this.listeners]) listener(change);
  }
}

/** These edits ran from this state before, or are their inverses, so they can't be refused. */
const run = (program: Program, edits: readonly EditOperation[]): Program =>
  edits.reduce((p, edit) => applyEdit(p, edit).program, program);

/**
 * The set-ups after `edits`, which ran on `program`: a field holding a scene object that is
 * renamed renames the object, and any vehicle pointing at it; one that is removed takes its
 * object out of the set-up, and whatever rode on it now rides on the scene. `renamed` lists the
 * objects renamed, old name to new, for their voices to follow.
 */
function keepSetupsInStep(
  program: Program,
  scenes: readonly Scene[],
  edits: readonly EditOperation[],
): { scenes: readonly Scene[]; renamed: [string, string][] } {
  const index = indexProgram(program);
  /** The scene whose type holds this field, if the field holds one of its objects. */
  const sceneOfField = (field: string): { scene: Scene; name: string } | null => {
    const at = index.get(field as never);
    if (!at || at.node.kind !== 'field') return null;
    for (const scene of scenes) {
      const method = index.get(scene.method);
      if (method?.parent === at.parent) return { scene, name: at.node.name };
    }
    return null;
  };
  let result = scenes;
  const update = (scene: Scene, setup: SceneSetup) => {
    result = result.map((s) => (s.id === scene.id ? { ...s, setup } : s));
  };
  const setupOf = (scene: Scene) => result.find((s) => s.id === scene.id)!.setup;
  const renamed: [string, string][] = [];
  for (const edit of edits) {
    if (edit.kind !== 'rename' && edit.kind !== 'remove') continue;
    const owner = sceneOfField(edit.node);
    if (!owner) continue;
    const setup = setupOf(owner.scene);
    if (!setup.objects.some((o) => o.id === owner.name)) continue;
    const was = owner.name as ObjectId;
    if (edit.kind === 'rename') {
      const now = edit.name as ObjectId;
      renamed.push([was, now]);
      update(owner.scene, {
        ...setup,
        objects: setup.objects.map((o) => ({
          ...o,
          ...(o.id === was ? { id: now } : {}),
          ...(o.vehicle === was ? { vehicle: now } : {}),
        })),
      });
    } else {
      update(owner.scene, {
        ...setup,
        objects: setup.objects
          .filter((o) => o.id !== was)
          .map((o) => (o.vehicle === was ? { ...o, vehicle: null } : o)),
      });
    }
  }
  return { scenes: result, renamed };
}
