/**
 * The tool runner (`docs/spec/04-prompter.md` sections 1.7, 3, 6.3 to 6.5; WP13.4): it carries
 * out each tool call through the program's edit operations, holds every change to the agreed
 * plan, and keeps the words characters say to the script or the learner's own request.
 *
 * A whole learner request is one undo step: the first change opens a group on the production's
 * `ProductionSession` (spec 03, section 2.1), which holds program edits and scene set-ups
 * together, and the end of the request commits it.
 *
 * The set-up tools run the studio's own steps from `@storystage/production`: `add_model` is
 * Backstage's Add (`addObject`), `set_property` the stage's change to an object (`setObject`), and
 * `stage_scene` the studio's Set the stage from the storyboard (10.10), passed in as
 * `stageFromStoryboard`.
 */
import {
  defaultLabel,
  idMinter,
  indexProgram,
  type Args,
  type EditOperation,
  type Expression,
  type FieldDecl,
  type ListenerDecl,
  type MethodDecl,
  type NodeId,
  type ParameterDecl,
  type Program,
  type Statement,
  type StatementSlot,
  type TypeDecl,
  type TypeRef,
} from '@storystage/ast';
import type { Catalogue, Section } from '@storystage/backstage';
import {
  addObject,
  objectName,
  setObject,
  type Frame,
  type FrameId,
  type Production,
  type ProductionRest,
  type ProductionSession,
  type SceneId,
  type SceneRefusal,
  type SceneStep,
} from '@storystage/production';
import {
  DETAILS,
  classOfType,
  enumValues,
  findEntry,
  findEvent,
  type ApiClass,
  type SceneObjectSetup,
  type SceneSetup,
  type StoryClass,
  type Transform,
  type TypeName,
} from '@storystage/story-api';
import { findModels } from './backstage-data.ts';
import { productionData, storyboardData } from './context.ts';
import { dataBlock } from './data.ts';
import {
  inputValue,
  meantBy,
  objectType,
  onlyInput,
  ownMove,
  reaches,
  sameMeant,
  typesIn,
  unplannable,
  type Meant,
  type OwnMove,
  type PlanCode,
} from './own-moves.ts';
import { stageAfter, stepMoves } from './plan-stage.ts';
import {
  checkPlan,
  eventSettings,
  listenerFits,
  mismatch,
  targetOf,
  unplanned,
  type NameValue,
  type PlanProblem,
  type PlanStep,
  type PlanWorld,
} from './plans.ts';
import { stepsDone } from './progress.ts';
import { heldBy } from './repeats.ts';
import { chainOf, firstUnlanded, holderOf, stepBefore, type Link } from './shape.ts';
import { scriptFacts } from './script-check.ts';
import { SHIPPED_CATALOGUE } from './shipped-catalogue.ts';
import { sideProblems } from './sides.ts';
import { stepActors, stepBlocks, type StepBlock } from './step-blocks.ts';
import { stepWords } from './step-words.ts';
import type { ToolRunner, RequestContext } from './session.ts';
import type { ToolName } from './tool-names.ts';
import type { ToolOutcome, ToolErrorCode } from './tools.ts';
import type { Json, JsonObject } from './transport.ts';
import { objectRef, toValue, type SceneObjects } from './values.ts';

/**
 * What the runner works on. The studio supplies these for the open production. `S` is the
 * history's names for where changes come from, so the studio's own session fits as it is.
 */
export interface RunnerSetup<S extends string = string> {
  /** The open production, with its undo history: program and set-ups together. */
  readonly session: ProductionSession<S>;
  /** The history's name for Prompter changes. */
  readonly source: S;
  /** The scene the learner is in. */
  readonly scene: () => SceneId;
  /** The method open in the editor, kept whole when the program is over its budget. */
  readonly openMethod?: () => NodeId | null;
  /** A shipped Backstage model's class, or null if there is no such model. */
  readonly backstageClass: (id: string) => StoryClass | null;
  /**
   * The catalogue `find_models` searches: this release's, whose index is in the pinned `system`
   * (section 2.7). Tests may give another.
   */
  readonly catalogue?: Catalogue;
  /** The automatic check's latest result for a frame (11.6), or null if it hasn't run. */
  readonly checkResult?: (frame: FrameId) => Json | null;
  /**
   * Set the stage from the storyboard (10.10), as the studio's button runs it, for `stage_scene`:
   * `placeFromStoryboard(p, scene, storyboardPlan(p, scene, backstage), label)`. Without it,
   * `stage_scene` answers `not_allowed_here`.
   */
  readonly stageFromStoryboard?: (p: Production, scene: SceneId, label: string) => StageResult;
  /**
   * Whether a scene is set up from its storyboard card, with nothing left to add, for Plan only's
   * ticks on a `stage` step (section 6.6). Without it, a `stage` step is never ticked.
   */
  readonly staged?: (p: Production, scene: SceneId) => boolean;
  /**
   * A new object's type in the code, for `add_model` and for a plan's steps on a model it adds
   * (section 6.9), so it changes nothing: its character's class once the learner has
   * made one (decision 0074), so it has that class's moves, as Backstage's Add gives it
   * (`newObjectType` in `@storystage/staging`, with the model's Backstage name). It must come
   * down from `class`. Without it, the object is of its Story API class.
   */
  readonly objectType?: (
    p: Production,
    object: { readonly model: SceneObjectSetup['model']; readonly class: StoryClass },
  ) => TypeRef;
  /**
   * Where new node ids come from. `Math.random` by default; the evaluation harness gives a fixed
   * sequence, so a kept run replays with the same ids (`docs/eval/README.md`).
   */
  readonly random?: () => number;
  /**
   * Keeps the agreed plan with its frame (section 6.7), in the build's own undo step: called once,
   * as the build's group opens, when the request carries an agreed plan for a frame. `shown` is
   * the Prompter's plan as last proposed or revised, `agreed` the learner's version. It returns
   * the production with the plan kept, and may change nothing in the program. Returning `p`
   * itself keeps nothing; so does throwing, and the build goes on either way.
   */
  readonly keepPlan?: (p: Production, plan: KeptPlan) => Production;
}

/** What `keepPlan` is given. */
export interface KeptPlan {
  readonly frame: FrameId;
  readonly shown: readonly PlanStep[];
  readonly agreed: readonly PlanStep[];
}

/** What Set the stage from the storyboard gives: one step, or why not and for which object. */
export type StageResult =
  | { readonly ok: true; readonly step: SceneStep }
  | { readonly ok: false; readonly refusal: SceneRefusal; readonly name?: string };

/** What `propose_plan` and `revise_plan` keep, and an agreed plan carries back. */
export interface Plan {
  readonly plan: string;
  readonly frame: string | null;
  readonly steps: readonly PlanStep[];
}

/** `explain`'s result: the learner has the answer, so the turn ends there (spec 04, section 3.1). */
export const EXPLAINED =
  "Shown to the learner as your reply. End your turn now: don't repeat it, and don't say what you told them.";

/**
 * The blocks whose `text` is words in the film, held to the script or the learner's own words
 * (section 6.5): what a character says or thinks, and on-screen text (the owner, 22 Nov 2026).
 */
const WORDED: ReadonlySet<string> = new Set(['say', 'think', 'speakLine', 'setValue']);
const CONTAINERS = new Set([
  'doInOrder',
  'doTogether',
  'count',
  'while',
  'forEach',
  'eachTogether',
]);
/** The statement lists a block can sit in, as the studio's links (10.8) count them. */
const STATEMENT_SLOTS: ReadonlySet<string> = new Set(['body', 'then', 'else']);
const NO_STAGING =
  "Setting the stage from the storyboard isn't available here. Add each model with add_model in a plan of its own, or ask the learner to press Set the stage from the storyboard.";
const SCALE = { min: 0.05, max: 20 };
const PAINTS: ReadonlySet<string> = new Set(enumValues('Color'));

type Input = Readonly<Record<string, unknown>>;
type Result = ToolOutcome;

const ok = (summary: string, ids: Readonly<Record<string, string>> = {}): Result => ({
  ok: true,
  ids,
  summary,
});
const fail = (error: ToolErrorCode, message: string): Result => ({ ok: false, error, message });
const text = (v: unknown) => (typeof v === 'string' ? v : '');
const pairs = (v: unknown): NameValue[] => (Array.isArray(v) ? (v as NameValue[]) : []);
const story = (name: string): TypeRef => ({ kind: 'story', name });
/**
 * The step that starts the group a step runs together in, from 1 (section 6.4). Just after a
 * repeat, the step before is the whole repeat, not the last step inside it (section 6.8).
 */
function groupStart(steps: readonly PlanStep[], number: number): number {
  const held = heldBy(steps);
  const own = held[number - 1];
  let start = number;
  while (start > 1 && steps[start - 1]?.together) {
    const holder = held[start - 2];
    start = holder !== null && holder !== undefined && holder !== own ? holder + 1 : start - 1;
  }
  return start;
}

/**
 * The step after this one at its own level, from 1: after a repeat, the one after all it holds;
 * after the last step inside a repeat, none (section 6.8).
 */
function nextBeside(steps: readonly PlanStep[], number: number): PlanStep | undefined {
  const held = heldBy(steps);
  const after = number + (steps[number - 1]?.holds ?? 0);
  return held[after] === held[number - 1] ? steps[after] : undefined;
}
const squash = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** A turn about the vertical axis, as a unit quaternion. */
function yaw(degrees: number): Transform['rotation'] {
  const half = (degrees * Math.PI) / 360;
  return { x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) };
}

/** Why a step from `@storystage/production` couldn't be made, for Claude. */
function refusal(r: SceneRefusal, name: string): Result {
  switch (r.code) {
    case 'noSuchScene':
      return fail('unknown_object', "That scene can't be found.");
    case 'noSuchObject':
      return fail('unknown_object', `There is no ${name} in this scene.`);
    case 'tooManyObjects':
      return fail('limit_reached', `A scene holds at most ${r.limit} objects.`);
    case 'refused':
      return fail('would_break_program', r.reason);
    default:
      return fail('would_break_program', `That can't be done here (${r.code}).`);
  }
}

/** True if `carrier` rides, directly or not, on `rider`: then `rider` can't ride on it. */
function carries(objects: readonly SceneObjectSetup[], rider: string, carrier: string): boolean {
  const vehicles = new Map(objects.map((o) => [String(o.id), o.vehicle ?? null]));
  const seen = new Set<string>();
  for (
    let at: string | null = carrier;
    at !== null && !seen.has(at);
    at = vehicles.get(at) ?? null
  ) {
    if (at === rider) return true;
    seen.add(at);
  }
  return false;
}

/** The check saved on a frame (spec 08, section 9.6), as data: its words are the learner's file. */
function savedCheck(frame: Frame): Json | null {
  if (!frame.check) return null;
  return {
    items: frame.check.items.map((i) => ({
      id: i.id,
      kind: i.kind,
      outcome: i.outcome,
      words: i.words,
      ...(i.node === undefined ? {} : { node: i.node }),
      ...(i.line === undefined ? {} : { line: i.line }),
    })),
    kept: [...frame.check.kept],
  };
}

/** All of a production but its program, for a change to anything else. */
const withoutProgram = ({ program: _program, ...rest }: Production): ProductionRest => rest;

function asPlan(value: Json | undefined): Plan | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  return Array.isArray(v.steps)
    ? {
        plan: text(v.plan),
        frame: typeof v.frame === 'string' && v.frame !== '' ? v.frame : null,
        steps: v.steps as PlanStep[],
      }
    : null;
}

export class PrompterRunner<S extends string = string> implements ToolRunner {
  readonly #setup: RunnerSetup<S>;
  /**
   * The learner's own words, for what characters say outside a frame (section 6.5): every request
   * they have made since the film opened, and the steps they wrote or changed in the agreed plan.
   * A build's request is only "Build these steps.", so the words come from what came before.
   */
  #learnerWords: string[] = [];
  #agreed: Plan | null = null;
  #open = false;
  #commented = new Set<number>();
  /** The count block each built `repeat` step made, by step number (section 6.8). */
  #repeatBlocks = new Map<number, NodeId>();
  #plans = new Map<string, Plan>();
  #latest: string | null = null;
  /** The frame `code_frame` started in this request: blocks built after it link to it (10.8). */
  #coding: FrameId | null = null;
  /**
   * The learner's procedure each step means, fixed when the plan was shown or the step changed
   * (section 6.9). The step, and a kept plan, hold only its name.
   */
  #meant = new WeakMap<PlanStep, Meant>();
  /** For the agreed plan, each step's procedure, as it was meant. */
  #builds: readonly (Meant | null)[] = [];
  /** Why the agreed plan can't be built: a procedure changed since the plan was shown. */
  #stale: PlanProblem | null = null;
  /** The build's shape (section 6.10): each step's blocks as built, by index, outermost first. */
  #chains = new Map<number, NodeId[]>();
  /** The steps that have landed, by index. */
  #landed = new Set<number>();
  /** Each when step's listener, by the step's index. */
  #listeners = new Map<number, NodeId>();
  /** Where `code_frame` put a frame's first block, if it was called. */
  #frameStart: { readonly parent: NodeId; readonly position: string } | null = null;

  constructor(setup: RunnerSetup<S>) {
    this.#setup = setup;
  }

  begin(request: string, context: RequestContext = {}): void {
    this.#agreed = asPlan(context.agreedPlan);
    this.#learnerWords.push(request);
    // A step the Prompter never showed is the learner's own: they added it, or changed it.
    const shown = this.#agreed ? this.#plans.get(this.#agreed.plan)?.steps : undefined;
    const theirs = (this.#agreed?.steps ?? []).filter(
      (s) => !shown?.some((p) => JSON.stringify(p) === JSON.stringify(s)),
    );
    for (const step of theirs)
      this.#learnerWords.push(step.words, ...step.details.map((d) => d.value));
    this.#commented = new Set();
    this.#repeatBlocks = new Map();
    this.#coding = null;
    this.#builds = [];
    this.#stale = null;
    this.#chains = new Map();
    this.#landed = new Set();
    this.#listeners = new Map();
    this.#frameStart = null;
    if (this.#agreed) {
      const { steps, frame } = this.#agreed;
      this.#stale = this.#changedMoves(steps, this.#world(frame))[0] ?? null;
      this.#builds = steps.map((s) => this.#meant.get(s) ?? null);
    }
  }

  end(): void {
    if (this.#open) this.#setup.session.commit();
    this.#open = false;
  }

  /** The first agreed step that hasn't landed, by number, or null (section 6.10). */
  unfinished(): number | null {
    if (!this.#agreed) return null;
    const left = firstUnlanded(this.#agreed.steps, this.#landed);
    return left === null ? null : left + 1;
  }

  /** The plans shown in this conversation, for the panel and for keeping with the frame (6.7). */
  plan(id: string): Plan | undefined {
    return this.#plans.get(id);
  }

  /** The plan shown or revised last, if any: the one the panel shows. */
  latestPlan(): Plan | undefined {
    return this.#latest === null ? undefined : this.#plans.get(this.#latest);
  }

  /**
   * Checks steps against the scene and the frame as they are now (spec 04, section 6.3): for
   * the learner's edits to a plan, before Build these steps. Messages are in plain words.
   */
  checkSteps(steps: readonly PlanStep[], frame: string | null): PlanProblem[] {
    const world = this.#world(frame);
    const changed = new Map(this.#changedMoves(steps, world).map((p) => [p.step, p] as const));
    const cant = checkPlan(steps, world);
    // A step that can't be built says why; the rest, whether their procedure has changed.
    for (const problem of cant) changed.delete(problem.step);
    return [...cant, ...changed.values()].sort((a, b) => a.step - b.step);
  }

  /**
   * The steps whose procedure isn't the one they meant (section 6.9): renamed, deleted, given
   * other inputs, or its name taken by another. A step not seen before is fixed as it is now.
   */
  #changedMoves(steps: readonly PlanStep[], world: PlanWorld): PlanProblem[] {
    return stepMoves(steps, world).flatMap((move, i) => {
      const step = steps[i]!;
      const meant = this.#meant.get(step);
      const now = move ? meantBy(move) : null;
      if (meant === undefined) {
        if (now) this.#meant.set(step, now);
        return [];
      }
      return now && sameMeant(meant, now)
        ? []
        : [
            {
              step: i + 1,
              message: `The ${step.action} block has changed since this plan was made. Change this step, or ask again.`,
            },
          ];
    });
  }

  /**
   * The blocks a `do` step of `actor`'s can use, after the steps before it (section 6.9): for
   * the panel's step editor.
   */
  stepBlocks(actor: string, before: readonly PlanStep[], frame: string | null): StepBlock[] {
    const world = this.#world(frame);
    return stepBlocks(actor, stageAfter(before, world), world);
  }

  /** Who can do a step that comes after `before` (S5's review). */
  stepActors(before: readonly PlanStep[], frame: string | null): string[] {
    return stepActors(stageAfter(before, this.#world(frame)));
  }

  /**
   * Plan only's ticks (section 6.6): which steps what the learner built matches, by the rule a
   * build is held to. `before` is the program's blocks when the plan was shown: only blocks added
   * since, or linked to the plan's frame, are the learner's work for it. A frame's plan is worked
   * out in the frame's scene; a plan with no frame, in the scene on show.
   */
  progress(
    steps: readonly PlanStep[],
    frame: string | null,
    before: ReadonlySet<NodeId>,
  ): boolean[] {
    const program = this.#setup.session.program();
    const production = this.#setup.session.production();
    // A frame's plan is for the frame's scene, whichever scene is on show (S5's review).
    const sceneId = production.frames.find((f) => f.id === frame)?.scene ?? this.#setup.scene();
    const type = this.#sceneType(program, sceneId);
    const scene = production.scenes.find((s) => s.id === sceneId);
    if (!type || !scene) return steps.map(() => false);
    const objects = this.#sceneObjects(type, program);
    const fields = new Map(type.fields.map((f) => [f.name, f] as const));
    const links = new Set<NodeId>(production.frames.find((f) => f.id === frame)?.links ?? []);
    let staged: boolean;
    try {
      staged = this.#setup.staged?.(production, scene.id) ?? false;
    } catch {
      staged = false;
    }
    return stepsDone(steps, {
      type,
      classOf: (name) => {
        if (name === 'this') return 'Scene';
        const field = fields.get(name);
        return field ? objects.classOf(field) : null;
      },
      objects: scene.setup.objects,
      lines: new Map(production.script.map((l) => [String(l.id), l.text])),
      counts: (id, around) => !before.has(id) || links.has(id) || around.some((a) => links.has(a)),
      staged,
      move: (id) => this.#moveById(program, id),
      meant: steps.map((step) => this.#meant.get(step)?.id ?? null),
      script: scene.method,
      listenerFits: (step, listener) =>
        listenerFits(
          step,
          listener,
          new Map(type.fields.map((f) => [f.id as string, f.name] as const)),
          (name) => fields.has(name),
        ),
    });
  }

  /** One of the learner's procedures by its id, with its inputs, or null. */
  #moveById(program: Program, id: NodeId): OwnMove | null {
    const found = typesIn(program).methods.get(id);
    if (!found) return null;
    return ownMove(program, { kind: 'user', type: found.owner.id }, found.method.name);
  }

  /** A step's words from what it does, for a step the learner changed or added (section 6.1). */
  stepWords(step: PlanStep, frame: string | null, before: readonly PlanStep[] = []): string {
    return stepWords(step, this.#world(frame), before);
  }

  run(name: ToolName, input: JsonObject): Result {
    switch (name) {
      case 'explain':
        // The panel shows any text after this as a second reply: the pilot's runs wrote one that
        // repeated the answer about the learner ("I told the learner…"), so the result says not to.
        return ok(EXPLAINED);
      case 'read_project':
        return ok(this.#projectData());
      case 'find_models':
        return this.#findModels(text(input.query), text(input.section) as Section | '');
      case 'check_frame':
        return this.#checkFrame(text(input.frame));
      case 'script_check':
        return this.#scriptCheck(text(input.scene));
      case 'propose_plan':
      case 'revise_plan':
        return this.#plan(name, input);
      case 'code_frame':
        return this.#codeFrame(text(input.frame));
      case 'insert_statement':
      case 'insert_control':
        return this.#linked(() => this.#change(name, input));
      case 'add_event_listener':
        return this.#change(name, input);
      case 'add_model':
      case 'set_property':
        return this.#change(name, input);
      case 'stage_scene':
        return this.#change(name, input);
    }
  }

  // ---- Reading ----------------------------------------------------------------------------------

  #sceneType(
    program: Program = this.#setup.session.program(),
    id: SceneId = this.#setup.scene(),
  ): TypeDecl | null {
    const scene = this.#setup.session.production().scenes.find((s) => s.id === id);
    if (!scene) return null;
    const where = indexProgram(program).get(scene.method);
    const type = where?.parent ? indexProgram(program).get(where.parent)?.node : undefined;
    return type?.kind === 'type' ? type : null;
  }

  #sceneObjects(type: TypeDecl, program: Program): SceneObjects {
    const types = new Map(program.types.map((t) => [t.id, t]));
    const classOf = (ref: TypeRef): ApiClass | null => {
      if (ref.kind === 'story') return classOfType(ref.name);
      if (ref.kind === 'user') {
        const user = types.get(ref.type);
        return user ? classOf(user.extends) : null;
      }
      return null;
    };
    return { type, classOf: (field: FieldDecl) => classOf(field.type) };
  }

  /** The production and the storyboard as a turn sends them (spec 04, section 2.6). */
  /** `find_models` (section 3.1): shipped models only, since imported ones are in the data. */
  #findModels(query: string, section: Section | ''): Result {
    const found = findModels(this.#setup.catalogue ?? SHIPPED_CATALOGUE, query, section);
    const summary = found.models.length
      ? `${found.models.length} shipped ${found.models.length === 1 ? 'model matches' : 'models match'}, best first.`
      : 'No shipped model matches those words. The Backstage index lists every one.';
    return { ok: true, ids: {}, summary, models: found.models, joints: found.joints };
  }

  #projectData(): string {
    const production = this.#setup.session.production();
    const place = { scene: this.#setup.scene(), open: this.#setup.openMethod?.() ?? null };
    return [
      dataBlock('production_data', productionData(production, place)),
      dataBlock('storyboard_data', storyboardData(production, place)),
    ].join('\n');
  }

  #inside(index: ReturnType<typeof indexProgram>, node: NodeId, ancestor: NodeId): boolean {
    let at: NodeId | null = node;
    while (at) {
      if (at === ancestor) return true;
      at = index.get(at)?.parent ?? null;
    }
    return false;
  }

  #checkFrame(frame: string): Result {
    const found = this.#setup.session.production().frames.find((f) => f.id === frame);
    if (!found) return fail('unknown_frame', `There is no frame ${frame}.`);
    const result = this.#setup.checkResult?.(found.id) ?? savedCheck(found);
    return result === null
      ? ok("This frame hasn't been checked yet. The learner can press Check this frame.")
      : ok(dataBlock('check_result', result));
  }

  #scriptCheck(scene: string): Result {
    const production = this.#setup.session.production();
    if (scene !== '' && !production.scenes.some((s) => s.id === scene))
      return fail('unknown_object', `There is no scene ${scene}.`);
    const facts = scriptFacts(production, scene === '' ? undefined : (scene as SceneId));
    return ok(dataBlock('check_result', facts as unknown as Json));
  }

  // ---- Plans -------------------------------------------------------------------------------------

  #world(frame: string | null): PlanWorld {
    const production = this.#setup.session.production();
    const program = this.#setup.session.program();
    const onFrame = production.frames.find((f) => f.id === frame);
    // A frame's plan is checked in the frame's scene, whichever scene is on show.
    const type = this.#sceneType(program, onFrame?.scene ?? this.#setup.scene());
    const objects = new Map<string, ApiClass>([['this', 'Scene']]);
    if (type) {
      const scene = this.#sceneObjects(type, program);
      for (const field of type.fields) {
        const cls = scene.classOf(field);
        if (cls) objects.set(field.name, cls);
      }
    }
    return {
      objects,
      lines: new Map(production.script.map((l) => [String(l.id), l.text])),
      sketches: new Set(onFrame ? onFrame.sketches.map((s) => s.id) : []),
      scenes: new Set(production.scenes.map((s) => String(s.id))),
      isBackstageItem: (id) => this.#modelClass(id) !== null,
      ...(type ? { code: this.#code(program, type, onFrame !== undefined) } : {}),
    };
  }

  /** The code a plan is checked against (section 6.9). */
  #code(program: Program, scene: TypeDecl, forFrame: boolean): PlanCode {
    return {
      program,
      scene,
      forFrame,
      added: (item) => {
        const cls = this.#modelClass(item);
        if (!cls) return null;
        const type =
          this.#setup.objectType?.(this.#setup.session.production(), {
            model: item as SceneObjectSetup['model'],
            class: cls,
          }) ?? story(cls);
        // `cls` is a class already: read as a type, Text would be words.
        return { cls, type };
      },
    };
  }

  #plan(name: 'propose_plan' | 'revise_plan', input: Input): Result {
    const steps = input.steps as PlanStep[];
    let frame = text(input.frame) || null;
    let id = `p${this.#plans.size + 1}`;
    if (name === 'revise_plan') {
      const shown = this.#plans.get(text(input.plan));
      if (!shown) return fail('bad_argument', `There is no plan ${text(input.plan)}.`);
      ({ frame } = shown);
      id = shown.plan;
    }
    if (frame !== null && !this.#setup.session.production().frames.some((f) => f.id === frame))
      return fail('unknown_frame', `There is no frame ${frame}.`);
    const world = this.#world(frame);
    const production = this.#setup.session.production();
    const sceneId = production.frames.find((f) => f.id === frame)?.scene ?? this.#setup.scene();
    const camera = production.scenes.find((s) => s.id === sceneId)?.setup.camera;
    const problems = [...checkPlan(steps, world), ...sideProblems(steps, camera)].sort(
      (a, b) => a.step - b.step,
    );
    if (problems.length > 0)
      return fail(
        'bad_argument',
        `These steps can't be built: ${problems.map((p) => `step ${p.step}: ${p.message}`).join(' ')} Fix them and try again.`,
      );
    this.#plans.set(id, { plan: id, frame, steps });
    // Showing the plan fixes which procedure each step means (section 6.9).
    stepMoves(steps, world).forEach((move, i) => {
      if (move) this.#meant.set(steps[i]!, meantBy(move));
      else this.#meant.delete(steps[i]!);
    });
    this.#latest = id;
    return ok(`Plan ${id} is shown to the learner. End your turn now and wait.`, { plan: id });
  }

  #codeFrame(frame: string): Result {
    if (!this.#setup.session.production().frames.some((f) => f.id === frame))
      return fail('unknown_frame', `There is no frame ${frame}.`);
    if (this.#agreed?.frame !== frame)
      return fail('no_agreed_plan', `The learner hasn't agreed a plan for frame ${frame}.`);
    const type = this.#sceneType();
    const scene = this.#setup.session.production().scenes.find((s) => s.id === this.#setup.scene());
    const method = type?.methods.find((m) => m.id === scene?.method);
    if (!method) return fail('unknown_method', "This scene's method can't be found.");
    this.#coding = frame as FrameId;
    const where = this.#frameSlot(frame as FrameId, method);
    this.#frameStart = { parent: (where.block ?? method.id) as NodeId, position: where.position };
    const inside = where.block ? `, inside ${where.block}` : '';
    return ok(
      `Build frame ${frame} in ${method.name}${inside}, from position ${where.position}. Blocks you build now are linked to the frame.`,
      {
        method: method.name,
        ...(where.block ? { parent_block: where.block } : {}),
        position: where.position,
      },
    );
  }

  /**
   * Where a frame's blocks go in the scene's method: after its own linked blocks; else after the
   * blocks of the frames before it; else before those of the frames after it; else at the end.
   */
  #frameSlot(frame: FrameId, method: MethodDecl): { block: string | null; position: string } {
    const production = this.#setup.session.production();
    const index = indexProgram(production.program);
    const own = production.frames.find((f) => f.id === frame)!;
    const live = (f: (typeof production.frames)[number]) =>
      f.links.filter((l) => index.has(l) && this.#inside(index, l, method.id));
    const sceneFrames = production.frames
      .filter((f) => f.scene === own.scene && f.id !== frame)
      .sort((a, b) => a.order - b.order);
    const at = (link: NodeId, after: boolean) => {
      const place = index.get(link)!;
      const parent = place.parent!;
      const container = index.get(parent)?.node;
      const list =
        container && place.slot in container
          ? ((container as unknown as Record<string, readonly { id: NodeId }[]>)[place.slot] ?? [])
          : [];
      const i = list.findIndex((n) => n.id === link);
      const block =
        parent === method.id ? null : container?.kind === 'if' ? `${parent}:${place.slot}` : parent;
      return { block, position: String(after ? i + 1 : i) };
    };
    const mine = live(own);
    if (mine.length > 0) return at(mine.at(-1)!, true);
    const before = sceneFrames.filter((f) => f.order < own.order).flatMap(live);
    if (before.length > 0) return at(before.at(-1)!, true);
    const after = sceneFrames.filter((f) => f.order > own.order).flatMap(live);
    if (after.length > 0) return at(after[0]!, false);
    return { block: null, position: 'end' };
  }

  /**
   * Runs a change; after `code_frame`, links the blocks it added to that frame (10.8), in the
   * request's undo step. A block inside one the frame already links isn't linked again.
   */
  #linked(make: () => Result): Result {
    const frame = this.#coding;
    const before = new Set(indexProgram(this.#setup.session.program()).keys());
    const result = make();
    if (!result.ok || frame === null) return result;
    const index = indexProgram(this.#setup.session.program());
    const linked = new Set(
      this.#setup.session.production().frames.find((f) => f.id === frame)?.links ?? [],
    );
    const fresh = [...index.keys()].filter((id) => !before.has(id));
    const covered = (id: NodeId) => {
      for (let at = index.get(id)?.parent ?? null; at !== null; at = index.get(at)?.parent ?? null)
        if (linked.has(at) || (!before.has(at) && STATEMENT_SLOTS.has(index.get(at)!.slot)))
          return true;
      return false;
    };
    const blocks = fresh.filter((id) => STATEMENT_SLOTS.has(index.get(id)!.slot) && !covered(id));
    if (blocks.length === 0) return result;
    const { session, source } = this.#setup;
    session.change(`Link to frame ${frame}`, source, ({ program: _program, ...rest }) => ({
      ...rest,
      frames: rest.frames.map((f) =>
        f.id === frame ? { ...f, links: [...f.links, ...blocks.filter((b) => !linked.has(b))] } : f,
      ),
    }));
    return result;
  }

  // ---- Changes -----------------------------------------------------------------------------------

  #change(name: ToolName, input: Input): Result {
    const steps = this.#agreed?.steps ?? [];
    const number = typeof input.plan_step === 'number' ? input.plan_step : 0;
    const step = steps[number - 1];
    if (!step) return fail('not_in_plan', `There is no step ${number} in the agreed plan.`);
    const stale = this.#stale;
    if (stale)
      return fail(
        'not_in_plan',
        `Step ${stale.step}: ${stale.message} Build nothing, and tell the learner.`,
      );
    const fields = this.#sceneType()?.fields ?? [];
    const wrong = mismatch(name, input, step, nextBeside(steps, number), (who) =>
      fields.some((f) => f.name === who),
    );
    if (wrong) return fail('not_in_plan', wrong);
    if (name !== 'insert_statement' && name !== 'insert_control' && name !== 'code_frame') {
      const shape = this.#inOrder(number - 1);
      if (shape) return shape;
    }

    const program = this.#setup.session.program();
    const type = this.#sceneType(program);
    if (!type) return fail('unknown_method', "This scene can't be found in the program.");
    const scene = this.#sceneObjects(type, program);
    const mint = idMinter(program, this.#setup.random);

    switch (name) {
      case 'insert_statement':
        return this.#insert(input, step, number, scene, mint, (parent) =>
          this.#call(input, number, parent, scene, mint),
        );
      case 'insert_control': {
        const serves = text(input.kind) === 'doTogether' ? groupStart(steps, number) : number;
        const built = this.#insert(input, steps[serves - 1]!, serves, scene, mint, () =>
          this.#control(input, scene, mint),
        );
        return built.ok && serves !== number ? { ...built, step: serves } : built;
      }
      case 'add_model':
        return this.#landing(number, this.#addModel(input));
      case 'set_property':
        return this.#landing(number, this.#setProperty(input));
      case 'stage_scene':
        return this.#landing(number, this.#stageScene(input));
      default: {
        const listened = this.#listen(input, type, scene, mint, step);
        if (listened.ok && listened.ids.block)
          this.#listeners.set(number - 1, listened.ids.block as NodeId);
        return this.#landing(number, listened);
      }
    }
  }

  /** A step's one call, landed if it worked. */
  #landing(number: number, result: Result): Result {
    if (result.ok) this.#landed.add(number - 1);
    return result;
  }

  /**
   * Why step `i` can't be built now (section 6.10): it has landed already, or a step before it
   * hasn't. Null if it can.
   */
  #inOrder(i: number): Result | null {
    const steps = this.#agreed?.steps ?? [];
    if (this.#landed.has(i)) return fail('not_in_plan', `Step ${i + 1} is built already.`);
    const left = firstUnlanded(steps.slice(0, i), this.#landed);
    return left === null
      ? null
      : fail(
          'not_in_plan',
          `Build the steps in order: step ${left + 1} comes before step ${i + 1}, and isn't built yet.`,
        );
  }

  /**
   * Why a block for step `i` can't go at this place, or null (section 6.10): it's the step's next
   * block, after every step before it, and side by side with the one before it.
   */
  #placed(i: number, link: Link, parent: NodeId, at: number): Result | null {
    const steps = this.#agreed?.steps ?? [];
    const chain = chainOf(steps, i);
    const built = this.#chains.get(i) ?? [];
    if (built.length >= chain.length) return fail('not_in_plan', `Step ${i + 1} is built already.`);
    const left = firstUnlanded(steps.slice(0, i), this.#landed);
    if (left !== null)
      return fail(
        'not_in_plan',
        `Build the steps in order: step ${left + 1} comes before step ${i + 1}, and isn't built yet.`,
      );
    const wanted = chain[built.length]!;
    if (link !== wanted)
      return fail(
        'not_in_plan',
        `Step ${i + 1}'s next block is its ${wanted === 'block' ? 'own block' : wanted === 'count' ? 'count block' : 'doTogether block'}.`,
      );
    const place = this.#placeFor(i, built);
    if ('ok' in place) return place;
    const index = indexProgram(this.#setup.session.program());
    const name = (id: NodeId) => {
      const node = index.get(id)?.node;
      return node?.kind === 'method' ? node.name : id;
    };
    const here =
      place.at === null
        ? `in ${name(place.parent)}`
        : `at position ${place.at} in ${name(place.parent)}`;
    if (parent !== place.parent || (place.at !== null && at !== place.at))
      return fail(
        'not_in_plan',
        `Step ${i + 1}'s block goes side by side with the step before it: build it ${here}.`,
      );
    return null;
  }

  /**
   * Where step `i`'s next block goes, given the blocks of it already built: first in the last of
   * them; else in what holds the step, straight after the step before it, or first. `at` is null
   * for the plan's first block in the script, which may go anywhere there.
   */
  #placeFor(
    i: number,
    built: readonly NodeId[],
  ): { readonly parent: NodeId; readonly at: number | null } | Result {
    const steps = this.#agreed!.steps;
    if (built.length > 0) return { parent: built.at(-1)!, at: 0 };
    const holder = holderOf(steps, i);
    let parent: NodeId | undefined;
    switch (holder.kind) {
      case 'script': {
        const scene = this.#setup.session
          .production()
          .scenes.find((s) => s.id === this.#setup.scene());
        parent = scene?.method;
        break;
      }
      case 'event':
        parent = this.#listeners.get(holder.of);
        break;
      case 'repeat':
        // The steps a repeat holds go in its count, inside any do together it starts.
        parent = this.#chains.get(holder.of)?.at(-1);
        break;
      default:
        parent = this.#chains.get(holder.of)?.[0];
    }
    if (!parent)
      return fail(
        'not_in_plan',
        `Build step ${holder.kind === 'script' ? 1 : (holder as { of: number }).of + 1} first.`,
      );
    const before = stepBefore(steps, i);
    const list = this.#listOf(parent);
    if (before === null) {
      if (holder.kind !== 'script') return { parent, at: 0 };
      // The plan's first block in the script: where `code_frame` said, for a frame.
      const start = this.#frameStart;
      if (!start) return { parent, at: null };
      return {
        parent: start.parent,
        at: start.position === 'end' ? this.#listOf(start.parent).length : Number(start.position),
      };
    }
    // In a group, its own first step's block is first in the do together, after any count of its.
    const chain = this.#chains.get(before) ?? [];
    const node = holder.kind === 'group' && before === holder.of ? chain[1] : chain[0];
    const at = node === undefined ? -1 : list.indexOf(node);
    if (at < 0) return fail('not_in_plan', `Build step ${before + 1} first.`);
    return { parent, at: at + 1 };
  }

  /** The ids of the statements in a method's, listener's or block's body. */
  #listOf(parent: NodeId): NodeId[] {
    const node = indexProgram(this.#setup.session.program()).get(parent)?.node as
      { readonly body?: readonly { readonly id: NodeId }[] } | undefined;
    return (node?.body ?? []).map((s) => s.id);
  }

  /** Opens the request's undo group, named after its first change. */
  #group(label: string): void {
    if (this.#open) return;
    const { session, source, keepPlan } = this.#setup;
    session.begin(label, source);
    this.#open = true;
    // The agreed plan is kept with its frame in the same step as what it built (section 6.7).
    const agreed = this.#agreed;
    if (keepPlan && agreed?.frame) {
      const plan: KeptPlan = {
        frame: agreed.frame as FrameId,
        shown: this.#plans.get(agreed.plan)?.steps ?? agreed.steps,
        agreed: agreed.steps,
      };
      // Keeping the plan never stops the build: a plan that isn't kept (one the studio finds too
      // big, or a keepPlan that fails) is simply not kept, and nothing is recorded for it.
      let kept: Production;
      try {
        kept = keepPlan(session.production(), plan);
      } catch {
        kept = session.production();
      }
      if (kept !== session.production()) session.change(label, source, () => withoutProgram(kept));
    }
  }

  /** Applies edits, labelled in plain words, opening the request's undo group with the first. */
  #apply(unlabelled: readonly EditOperation[]): Result | null {
    const { session, source } = this.#setup;
    const program = session.program();
    const edits = unlabelled.map((e) => (e.label ? e : { ...e, label: defaultLabel(program, e) }));
    const label = edits.at(-1)!.label;
    this.#group(label);
    const result = session.apply(edits, label, source);
    return result.ok ? null : fail('would_break_program', result.reason);
  }

  #slot(
    input: Input,
    scene: SceneObjects,
  ): { parent: NodeId; slot: StatementSlot; length: number } | Result {
    const program = this.#setup.session.program();
    const index = indexProgram(program);
    const handle = text(input.parent_block);
    if (handle) {
      const [id, part] = handle.split(':') as [NodeId, string | undefined];
      const node = index.get(id)?.node;
      if (!node || !this.#inside(index, id, scene.type.id))
        return fail('unknown_block', `There is no block ${handle} in this scene.`);
      if (node.kind === 'if' && (part === 'then' || part === 'else'))
        return { parent: id, slot: part, length: node[part].length };
      // A listener's handler, by the id add_event_listener gave (its description says so).
      if (node.kind === 'listener' && part === undefined)
        return { parent: id, slot: 'body', length: node.body.length };
      if (CONTAINERS.has(node.kind) && part === undefined && 'body' in node)
        return { parent: id, slot: 'body', length: (node.body as readonly Statement[]).length };
      return fail('unknown_block', `Blocks can't go inside ${handle}.`);
    }
    const method = scene.type.methods.find((m) => m.name === text(input.method));
    if (!method)
      return fail('unknown_method', `There is no method ${text(input.method)} in this scene.`);
    return { parent: method.id, slot: 'body', length: method.body.length };
  }

  #insert(
    input: Input,
    step: PlanStep,
    number: number,
    scene: SceneObjects,
    mint: () => NodeId,
    build: (parent: NodeId) => Statement | Result,
  ): Result {
    const where = this.#slot(input, scene);
    if ('ok' in where) return where;
    // A step inside a repeat is built inside that repeat's count block (section 6.8).
    const outside = this.#outsideRepeat(number, where.parent);
    if (outside) return outside;
    const position = text(input.position);
    const at = position === 'end' ? where.length : Number(position);
    if (at > where.length)
      return fail(
        'bad_argument',
        `position ${position} is past the end; there are ${where.length} blocks there.`,
      );
    const link: Link | null =
      input.kind === undefined
        ? 'block'
        : text(input.kind) === 'doTogether'
          ? 'doTogether'
          : text(input.kind) === 'count'
            ? 'count'
            : null;
    if (link === null)
      return fail('not_in_plan', `A ${text(input.kind)} block isn't part of the plan.`);
    const placed = this.#placed(number - 1, link, where.parent, at);
    if (placed) return placed;
    const node = build(where.parent);
    if ('ok' in node) return node;

    const edits: EditOperation[] = [];
    // The step's words go above its first block, as a comment (section 6.1).
    if (!this.#commented.has(number)) {
      edits.push({
        kind: 'insert',
        label: 'Add comment',
        parent: where.parent,
        slot: where.slot,
        index: at,
        node: { id: mint(), kind: 'comment', text: step.words },
      });
    }
    edits.push({
      kind: 'insert',
      label: '',
      parent: where.parent,
      slot: where.slot,
      index: at + edits.length,
      node,
    });
    const label = defaultLabel(this.#setup.session.program(), edits.at(-1)!);
    const refused = this.#apply(edits);
    if (refused) return refused;
    this.#commented.add(number);
    if (step.kind === 'repeat' && node.kind === 'count') this.#repeatBlocks.set(number, node.id);
    const chain = [...(this.#chains.get(number - 1) ?? []), node.id];
    this.#chains.set(number - 1, chain);
    const steps = this.#agreed?.steps ?? [];
    if (chain.length === chainOf(steps, number - 1).length) this.#landed.add(number - 1);
    const ids: Record<string, string> = { block: node.id };
    if (node.kind === 'if')
      Object.assign(ids, { then: `${node.id}:then`, else: `${node.id}:else` });
    return ok(label, ids);
  }

  /** Why a held step's blocks can't go at `parent`, or null if they can (section 6.8). */
  #outsideRepeat(number: number, parent: NodeId): Result | null {
    const steps = this.#agreed?.steps ?? [];
    const holder = heldBy(steps)[number - 1];
    if (holder === null || holder === undefined) return null;
    const words = steps[number - 1]!.words;
    const block = this.#repeatBlocks.get(holder + 1);
    if (!block)
      return fail(
        'not_in_plan',
        `Step "${words}" is inside step ${holder + 1}'s repeat: build step ${holder + 1}'s count block first.`,
      );
    const index = indexProgram(this.#setup.session.program());
    return this.#inside(index, parent, block)
      ? null
      : fail(
          'not_in_plan',
          `Step "${words}" is inside step ${holder + 1}'s repeat: give its count block, ${block}, as parent_block.`,
        );
  }

  #values(
    given: readonly NameValue[],
    types: ReadonlyMap<string, TypeName>,
    scene: SceneObjects,
    mint: () => NodeId,
  ): { readonly values: Args } | Result {
    const out: Record<string, Expression> = {};
    for (const { name, value } of given) {
      const type = types.get(name);
      if (!type) return fail('bad_argument', `There is no ${name} here.`);
      const converted = toValue(value, type, scene, mint);
      if (!converted.ok) return fail('bad_argument', `${name}: ${converted.message}`);
      out[name] = converted.expression;
    }
    return { values: out };
  }

  #call(
    input: Input,
    number: number,
    parent: NodeId,
    scene: SceneObjects,
    mint: () => NodeId,
  ): Statement | Result {
    const name = text(input.target);
    const target = objectRef(name, scene, mint);
    if (!target) return fail('unknown_object', `There's no ${name} in this scene.`);
    const procedure = text(input.procedure);
    const program = this.#setup.session.program();
    const move = ownMove(program, objectType(scene.type, name), procedure);
    const meant = this.#builds[number - 1] ?? null;
    if (meant && !(move && sameMeant(meant, meantBy(move))))
      return fail(
        'not_in_plan',
        `The ${procedure} block on the ${name} isn't the one the plan showed. Build nothing more, and tell the learner.`,
      );
    if (move) {
      if (!meant)
        return fail('not_in_plan', `The agreed plan didn't show the learner's ${procedure} block.`);
      return this.#ownCall(input, move, number, target.expression, parent, scene, mint);
    }
    const entry = findEntry(target.class, procedure);
    if (!entry || entry.kind !== 'procedure')
      return fail('unknown_method', `A ${target.class} has no ${procedure} block.`);
    const params = new Map(entry.params.map((p) => [p.name, p.type] as const));
    const given = this.#values(pairs(input.arguments), params, scene, mint);
    if ('ok' in given) return given;
    const args = given.values;
    const missing = entry.params.find((p) => !(p.name in args));
    if (missing) return fail('bad_argument', `${procedure} needs ${missing.name}.`);
    const detailTypes = new Map(
      entry.details.flatMap((d) => (DETAILS[d] ? [[d, DETAILS[d]!.type] as const] : [])),
    );
    const detailsGiven = this.#values(pairs(input.details), detailTypes, scene, mint);
    if ('ok' in detailsGiven) return detailsGiven;
    const details = detailsGiven.values;

    const unseen = unplanned(this.#agreed!.steps[number - 1]!, entry.params, [
      ...pairs(input.arguments),
      ...pairs(input.details),
    ]);
    if (unseen) return fail('not_in_plan', unseen);
    const said = WORDED.has(procedure) ? this.#speech(input, args.text) : null;
    if (said) return said;
    return {
      id: mint(),
      kind: 'call',
      target: target.expression,
      callee: { kind: 'story', name: procedure },
      args,
      details,
    };
  }

  /** A call of one of the learner's procedures (section 6.9). */
  #ownCall(
    input: Input,
    move: OwnMove,
    number: number,
    target: Expression,
    parent: NodeId,
    scene: SceneObjects,
    mint: () => NodeId,
  ): Statement | Result {
    const program = this.#setup.session.program();
    const { name } = move.method;
    const cant = unplannable(this.#code(program, scene.type, !!this.#agreed?.frame), move);
    if (cant) return fail('unknown_method', cant);
    if (pairs(input.details).length > 0)
      return fail('bad_argument', `${name} takes no details: give its inputs in arguments.`);
    const args: Record<string, Expression> = {};
    for (const { name: given, value } of pairs(input.arguments)) {
      const param = move.inputs.find((i) => i.name === given);
      if (!param) return fail('bad_argument', `There is no ${given} here.`);
      const made = inputValue(program, param, value, scene, mint);
      if (!made.ok) return fail('bad_argument', `${given}: ${made.message}`);
      args[param.id] = made.expression;
    }
    // The step's target is the only object input by name, whatever another input holds.
    const step = this.#agreed!.steps[number - 1]!;
    const agreedOn = targetOf(step);
    const acts = agreedOn === '' ? null : onlyInput(move, 'object');
    if (acts && pairs(input.arguments).find((g) => g.name === acts.name)?.value !== agreedOn)
      return fail(
        'not_in_plan',
        `Step "${step.words}" acts on the ${agreedOn}: give ${agreedOn} as ${acts.name}. Build exactly the agreed step.`,
      );
    const missing = move.inputs.find((i) => !Object.hasOwn(args, i.id));
    if (missing) return fail('bad_argument', `${name} needs ${missing.name}.`);
    // Every text input is words in the film, spoken or not (the owner, 22 Nov 2026). A line fills
    // it only when it's the only one.
    const lined = onlyInput(move, 'text');
    for (const param of move.inputs) {
      if (param.kind !== 'text') continue;
      const said = this.#speech(input, args[param.id], param === lined);
      if (said) return said;
    }
    // The Prompter's own rule: no new loop by calling, though the editors allow one.
    const inside = this.#methodAround(program, parent);
    if (inside !== null && reaches(program, move.method.id, inside))
      return fail(
        'would_break_program',
        `${name} can't be called here: it would call itself again and again.`,
      );
    return {
      id: mint(),
      kind: 'call',
      target,
      callee: { kind: 'user', method: move.method.id },
      args,
      details: {},
    };
  }

  /** The method a place in the program is in, or null in a listener. */
  #methodAround(program: Program, place: NodeId): NodeId | null {
    const index = indexProgram(program);
    for (let at = index.get(place); at; at = at.parent ? index.get(at.parent) : undefined)
      if (at.node.kind === 'method') return at.node.id;
    return null;
  }

  /**
   * Words in the film come from the script or the learner's own words (section 6.5): what a
   * character says or thinks, on-screen text, and a learner's text input (6.9).
   */
  #speech(input: Input, value: Expression | undefined, lineFills = true): Result | null {
    const words = value?.kind === 'text' ? value.value : '';
    const lineId = lineFills ? text(input.line) : '';
    if (lineId) {
      const line = this.#setup.session.production().script.find((l) => l.id === lineId);
      if (!line) return fail('unknown_line', `There is no script line ${lineId}.`);
      return line.text === words
        ? null
        : fail('not_in_script', `Use line ${lineId}'s exact words: "${line.text}".`);
    }
    if (this.#agreed?.frame)
      return fail(
        'not_in_script',
        'In a frame, words in the film are a script line: give its exact words and its id in line.',
      );
    return words.trim() !== '' && this.#learnerWords.some((w) => squash(w).includes(squash(words)))
      ? null
      : fail(
          'not_in_script',
          "Words in the film, said or shown, come from the script or the learner's own words. Ask the learner what they should be.",
        );
  }

  #control(input: Input, scene: SceneObjects, mint: () => NodeId): Statement | Result {
    const id = mint();
    const kind = text(input.kind);
    switch (kind) {
      case 'doInOrder':
      case 'doTogether':
        return { id, kind, body: [] };
      case 'count':
        return typeof input.count === 'number'
          ? { id, kind, times: { id: mint(), kind: 'wholeNumber', value: input.count }, body: [] }
          : fail('bad_argument', 'A count block needs count.');
      case 'while':
      case 'if': {
        const condition = this.#condition(input.condition, scene, mint);
        if ('ok' in condition) return condition;
        return kind === 'if'
          ? { id, kind, condition, then: [], else: [] }
          : { id, kind, condition, body: [] };
      }
      case 'forEach':
      case 'eachTogether': {
        const names = Array.isArray(input.items) ? (input.items as string[]) : [];
        if (names.length === 0) return fail('bad_argument', `A ${kind} block needs items.`);
        const refs = names.map((n) => ({ name: n, ref: objectRef(n, scene, mint) }));
        const gone = refs.find((r) => !r.ref);
        if (gone) return fail('unknown_object', `There's no ${gone.name} in this scene.`);
        const of = story(refs[0]!.ref!.class);
        return {
          id,
          kind,
          item: { id: mint(), kind: 'loopItem', name: 'item', type: of },
          items: { id: mint(), kind: 'arrayOf', of, items: refs.map((r) => r.ref!.expression) },
          body: [],
        };
      }
    }
    return fail('bad_argument', `There is no ${kind} block.`);
  }

  #condition(value: unknown, scene: SceneObjects, mint: () => NodeId): Expression | Result {
    if (typeof value !== 'object' || value === null)
      return fail('bad_argument', 'This block needs a condition.');
    const c = value as Input;
    const fn = text(c.function);
    if (text(c.target) === '' && (fn === 'true' || fn === 'false'))
      return { id: mint(), kind: 'boolean', value: fn === 'true' };
    const target = objectRef(text(c.target), scene, mint);
    if (!target) return fail('unknown_object', `There's no ${text(c.target)} in this scene.`);
    const entry = findEntry(target.class, fn);
    if (!entry || entry.kind !== 'function' || entry.returns !== 'Boolean')
      return fail(
        'unknown_method',
        `A ${target.class} has no ${fn} question that answers true or false.`,
      );
    const args = this.#values(
      pairs(c.arguments),
      new Map(entry.params.map((p) => [p.name, p.type] as const)),
      scene,
      mint,
    );
    if ('ok' in args) return args;
    const missing = entry.params.find((p) => !(p.name in args.values));
    if (missing) return fail('bad_argument', `${fn} needs ${missing.name}.`);
    return {
      id: mint(),
      kind: 'functionCall',
      target: target.expression,
      callee: { kind: 'story', name: fn },
      args: args.values,
      details: {},
    };
  }

  // ---- The scene's set-up (spec 04, section 3.1) -----------------------------------------------

  /** A model's class: a shipped one, or one of this production's imported models. */
  #modelClass(id: string): StoryClass | null {
    const imported = this.#setup.session.production().manifest.models.find((m) => m.item.id === id);
    return imported ? imported.item.class : this.#setup.backstageClass(id);
  }

  /** Changes the current scene's set-up, as part of the request's undo step. */
  #changeSetup(label: string, update: (setup: SceneSetup) => SceneSetup): void {
    const { session, source } = this.#setup;
    const scene = this.#setup.scene();
    this.#group(label);
    session.change(label, source, ({ program: _program, ...rest }): ProductionRest => ({
      ...rest,
      scenes: rest.scenes.map((s) => (s.id === scene ? { ...s, setup: update(s.setup) } : s)),
    }));
  }

  /** Backstage's Add (`addObject`): a field and an object, named as Backstage names them. */
  #addModel(input: Input): Result {
    const item = text(input.backstage_item);
    const cls = this.#modelClass(item);
    if (!cls)
      return fail(
        'unknown_object',
        `${item} isn't in the Backstage catalogue or this production's imported models.`,
      );
    const at = input.position as { x?: unknown; y?: unknown; z?: unknown } | undefined;
    const position = [at?.x, at?.y, at?.z];
    if (!position.every(finite))
      return fail('bad_argument', 'position needs x, y and z, each a number of metres.');
    const scale = input.scale === undefined ? 1 : input.scale;
    if (!finite(scale) || scale < SCALE.min || scale > SCALE.max)
      return fail('bad_argument', `scale must be from ${SCALE.min} to ${SCALE.max}.`);
    const turn = input.turn_degrees === undefined ? 0 : input.turn_degrees;
    if (!finite(turn)) return fail('bad_argument', 'turn_degrees must be a number.');

    const production = this.#setup.session.production();
    const scene = this.#setup.scene();
    const wanted = text(input.name).trim() || item.split('/').at(-1) || 'model';
    const name = objectName(production, scene, wanted);
    if (name === null) return fail('unknown_method', "This scene can't be found.");
    const [x, y, z] = position as number[];
    const object = { model: item as SceneObjectSetup['model'], class: cls };
    const type = this.#setup.objectType?.(production, object);
    const added = addObject(
      production,
      scene,
      {
        ...object,
        ...(type === undefined ? {} : { type }),
        name,
        transform: {
          position: { x: x!, y: y!, z: z! },
          rotation: yaw(turn),
          scale: { x: scale, y: scale, z: scale },
        },
      },
      `Add ${name}`,
      this.#setup.random,
    );
    if (!added.ok) return refusal(added.refusal, name);
    return this.#step(added.step) ?? ok(`Added ${name}.`, { name });
  }

  #setProperty(input: Input): Result {
    const name = text(input.object);
    const property = text(input.property);
    const value = text(input.value).trim();
    const production = this.#setup.session.production();
    const scene = production.scenes.find((s) => s.id === this.#setup.scene());
    if (!scene) return fail('unknown_method', "This scene can't be found.");
    const objects = scene.setup.objects;
    const object = objects.find((o) => o.id === name);
    const camera = name === 'camera';
    if (!object && !camera) return fail('unknown_object', `There is no ${name} in this scene.`);
    if (camera && property !== 'position' && property !== 'turn_degrees')
      return fail('bad_argument', `The camera has no ${property}. Only its position and turn.`);

    const number = value === '' ? NaN : Number(value);
    const bad = (why: string) => fail('bad_argument', `${property} for ${name}: ${why}`);
    let change: (o: SceneObjectSetup) => SceneObjectSetup;
    let words: string;
    switch (property) {
      case 'position': {
        const parts = value.split(',').map((p) => (p.trim() === '' ? NaN : Number(p)));
        if (parts.length !== 3 || !parts.every(finite))
          return bad('give "x, y, z", three numbers of metres.');
        const [x, y, z] = parts as [number, number, number];
        change = (o) => ({ ...o, transform: { ...o.transform, position: { x, y, z } } });
        words = `Move ${name}`;
        break;
      }
      case 'turn_degrees':
        if (!finite(number)) return bad('give a number of degrees.');
        change = (o) => ({ ...o, transform: { ...o.transform, rotation: yaw(number) } });
        words = `Turn ${name}`;
        break;
      case 'scale':
        if (!finite(number) || number < SCALE.min || number > SCALE.max)
          return bad(`give a number from ${SCALE.min} to ${SCALE.max}.`);
        change = (o) => ({
          ...o,
          transform: { ...o.transform, scale: { x: number, y: number, z: number } },
        });
        words = `Resize ${name}`;
        break;
      case 'paint':
        if (!PAINTS.has(value) && !/^#[0-9a-fA-F]{6}$/.test(value))
          return bad('give a colour from the catalog, or #rrggbb.');
        change = (o) => ({ ...o, paint: value });
        words = `Paint ${name}`;
        break;
      case 'opacity':
        if (!finite(number) || number < 0 || number > 1) return bad('give a number from 0 to 1.');
        change = (o) => ({ ...o, opacity: number });
        words = `Change how see-through ${name} is`;
        break;
      case 'vehicle': {
        const rider = value === 'scene' ? null : value;
        if (rider !== null && !objects.some((o) => o.id === rider))
          return bad(`there is no ${rider} in this scene. Give an object's name, or "scene".`);
        if (rider !== null && carries(objects, name, rider))
          return bad(`${rider} already rides on ${name}, so ${name} can't ride on it.`);
        change = (o) => ({ ...o, vehicle: rider as SceneObjectSetup['vehicle'] });
        words = rider === null ? `Let ${name} ride on nothing` : `Put ${name} on ${rider}`;
        break;
      }
      default:
        return fail('bad_argument', `There's no property ${property}.`);
    }

    if (object && property !== 'vehicle') {
      const next = change(object);
      const objectChange =
        property === 'paint'
          ? { paint: next.paint! }
          : property === 'opacity'
            ? { opacity: next.opacity! }
            : { transform: next.transform };
      const set = setObject(production, scene.id, name, objectChange, words);
      if (!set.ok) return refusal(set.refusal, name);
      return this.#step(set.step) ?? ok(`${words}: done.`);
    }

    this.#changeSetup(words, (setup) =>
      camera
        ? {
            ...setup,
            camera: {
              ...setup.camera,
              transform: change({ transform: setup.camera.transform } as SceneObjectSetup)
                .transform,
            },
          }
        : { ...setup, objects: setup.objects.map((o) => (o.id === name ? change(o) : o)) },
    );
    return ok(`${words}: done.`);
  }

  /** Set the stage from the storyboard (10.10), the studio's own step, in the request's. */
  #stageScene(input: Input): Result {
    const stage = this.#setup.stageFromStoryboard;
    if (!stage) return fail('not_allowed_here', NO_STAGING);
    const id = text(input.scene);
    const production = this.#setup.session.production();
    const scene = production.scenes.find((s) => s.id === id);
    if (!scene) return fail('unknown_object', `There is no scene ${id}.`);
    const heading = production.storyboard.cards.find((c) => c.id === scene.id)?.heading;
    const placed = stage(production, scene.id, `Set up ${heading || id} from the storyboard`);
    if (!placed.ok) return refusal(placed.refusal, placed.name ?? '');
    if (placed.step.production === production)
      return ok('Nothing to place: the stage already has everything the storyboard shows.');
    const before = new Set(scene.setup.objects.map((o) => String(o.id)));
    const added = (
      placed.step.production.scenes.find((s) => s.id === scene.id)?.setup.objects ?? []
    )
      .map((o) => String(o.id))
      .filter((n) => !before.has(n));
    return (
      this.#step(placed.step) ??
      ok(
        added.length > 0
          ? `Placed ${added.join(', ')} from the storyboard.`
          : 'Set the backdrop and camera from the storyboard.',
      )
    );
  }

  /** A step from `@storystage/production`, joined to the request's undo step. */
  #step(step: SceneStep): Result | null {
    const { session, source } = this.#setup;
    this.#group(step.label);
    const result = session.step(step, source);
    return result.ok ? null : fail('would_break_program', result.reason);
  }

  #listen(
    input: Input,
    sceneType: TypeDecl,
    scene: SceneObjects,
    mint: () => NodeId,
    step?: PlanStep,
  ): Result {
    const event = findEvent(text(input.event));
    if (!event) return fail('bad_argument', `There is no ${text(input.event)} event.`);
    const lists = [input.objects, input.other_objects].map((l) =>
      Array.isArray(l) ? (l as string[]) : [],
    );
    let nextList = 0;
    const args: Record<string, Expression> = {};
    for (const param of event.args) {
      if (param.type === 'Number') {
        if (typeof input.number !== 'number')
          return fail('bad_argument', `${event.name} needs number.`);
        args[param.name] = { id: mint(), kind: 'number', value: input.number };
      } else if (param.type.endsWith('[]')) {
        const names = lists[nextList++] ?? [];
        const refs = names.map((n) => ({ n, ref: objectRef(n, scene, mint) }));
        const gone = refs.find((r) => !r.ref);
        if (gone) return fail('unknown_object', `There's no ${gone.n} in this scene.`);
        args[param.name] = {
          id: mint(),
          kind: 'arrayOf',
          of: story(param.type.slice(0, -2)),
          items: refs.map((r) => r.ref!.expression),
        };
      } else {
        const name = lists[0]?.[0] ?? '';
        const ref = objectRef(name, scene, mint);
        if (!ref) return fail('unknown_object', `${event.name} needs an object in objects.`);
        args[param.name] = ref.expression;
      }
    }
    // The listener's id comes first, then its parameters', so a kept run's ids hold (section 9).
    const id = mint();
    const params = event.gives.map((g): ParameterDecl => ({
      id: mint(),
      kind: 'parameter',
      name: g.name,
      type: story(g.type),
      default: null,
    }));
    // What's clicked is the event's setOfVisuals detail: without it, a click on anything counts.
    const details: Record<string, Expression> = {};
    // The event's own settings, as its step gives them (section 6.10). One it leaves out is the
    // default. The plan check has read each value.
    for (const d of step?.details ?? []) {
      const type = DETAILS[d.name]?.type;
      if (eventSettings(event).includes(d.name) && type)
        details[d.name] = { id: mint(), kind: 'enum', type, value: d.value };
    }
    const clicked = event.details.includes('setOfVisuals') ? (lists[0] ?? []) : [];
    if (clicked.length > 0) {
      const refs = clicked.map((name) => ({ name, ref: objectRef(name, scene, mint) }));
      const gone = refs.find((r) => !r.ref);
      if (gone) return fail('unknown_object', `There's no ${gone.name} in this scene.`);
      details.setOfVisuals = {
        id: mint(),
        kind: 'arrayOf',
        of: story('Thing'),
        items: refs.map((r) => r.ref!.expression),
      };
    }
    const node: ListenerDecl = {
      id,
      kind: 'listener',
      event: event.name,
      args,
      details,
      params,
      body: [],
    };
    const refused = this.#apply([
      { kind: 'declare', label: '', parent: sceneType.id, index: sceneType.listeners.length, node },
    ]);
    return refused ?? ok(`Added a ${event.name} listener.`, { block: node.id });
  }
}
