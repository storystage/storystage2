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
import type { SceneStep } from './scenes.ts';
import { sceneMethodCheck, type Production, type Scene } from './types.ts';

/** Everything in a production but its program. */
export type ProductionRest = Omit<Production, 'program'>;

export interface ProductionChange<Source extends string = string> {
  readonly production: Production;
  /** The program edits this change ran; empty when only the rest changed. */
  readonly edits: readonly EditOperation[];
  readonly label: string;
  readonly source: Source | 'undo' | 'redo' | 'load';
}

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
    const after: ProductionRest = {
      ...before,
      scenes: keepSetupsInStep(this.current.program, scenes, edits),
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

  /** Opens a step that later changes join: a whole Prompter request is one undo step. */
  begin(label: string, source: Source): void {
    if (this.open) throw new Error('A group is already open.');
    const rest = restOf(this.current);
    this.open = { label, source, edits: [], inverses: [], before: rest, after: rest };
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
    this.set({ ...step.after, program }, step.edits, step.label, 'redo');
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
    this.set({ ...step.before, program }, step.inverses, label, 'undo');
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
 * object out of the set-up, and whatever rode on it now rides on the scene.
 */
function keepSetupsInStep(
  program: Program,
  scenes: readonly Scene[],
  edits: readonly EditOperation[],
): readonly Scene[] {
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
  for (const edit of edits) {
    if (edit.kind !== 'rename' && edit.kind !== 'remove') continue;
    const owner = sceneOfField(edit.node);
    if (!owner) continue;
    const setup = setupOf(owner.scene);
    if (!setup.objects.some((o) => o.id === owner.name)) continue;
    const was = owner.name as ObjectId;
    if (edit.kind === 'rename') {
      const now = edit.name as ObjectId;
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
  return result;
}
