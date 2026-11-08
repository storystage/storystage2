/**
 * The tool runner (`docs/spec/04-prompter.md` sections 1.7, 3, 6.3 to 6.5; WP13.4): it carries
 * out each tool call through the program's edit operations, holds every change to the agreed
 * plan, and keeps the words characters say to the script or the learner's own request.
 *
 * A whole learner request is one undo step: the first change opens a group on the program's
 * `EditSession`, and the end of the request commits it.
 *
 * Tools that change a scene's set-up as well as the program (`add_model`, `set_property`,
 * `stage_scene`) wait for the production's own undo session (WP8.2, spec 03 section 2.1), which
 * holds both in one step. Until then they answer `not_allowed_here`.
 */
import {
  defaultLabel,
  idMinter,
  indexProgram,
  type Args,
  type EditOperation,
  type EditSession,
  type Expression,
  type FieldDecl,
  type ListenerDecl,
  type MethodDecl,
  type NodeId,
  type Program,
  type Statement,
  type StatementSlot,
  type TypeDecl,
  type TypeRef,
} from '@storystage/ast';
import type { FrameId, Production, SceneId } from '@storystage/production';
import {
  DETAILS,
  classOfType,
  findEntry,
  findEvent,
  isStoryType,
  type ApiClass,
  type TypeName,
} from '@storystage/story-api';
import { productionData, storyboardData } from './context.ts';
import { dataBlock } from './data.ts';
import { checkPlan, mismatch, type NameValue, type PlanStep, type PlanWorld } from './plans.ts';
import { scriptFacts } from './script-check.ts';
import type { ToolRunner, RequestContext } from './session.ts';
import type { ToolName } from './tool-names.ts';
import type { ToolOutcome, ToolErrorCode } from './tools.ts';
import type { Json, JsonObject } from './transport.ts';
import { objectRef, toValue, type SceneObjects } from './values.ts';

/** What the runner works on. The studio supplies these for the open production. */
export interface RunnerSetup {
  /** The program, with its undo history. */
  readonly session: EditSession<string>;
  /** The history's name for Prompter changes. */
  readonly source: string;
  /** The production as it stands, for its scenes, script and frames. */
  readonly production: () => Production;
  /** The scene the learner is in. */
  readonly scene: () => SceneId;
  /** The method open in the editor, kept whole when the program is over its budget. */
  readonly openMethod?: () => NodeId | null;
  readonly isBackstageItem: (id: string) => boolean;
  /** The automatic check's latest result for a frame (11.6), or null if it hasn't run. */
  readonly checkResult?: (frame: FrameId) => Json | null;
}

/** What `propose_plan` and `revise_plan` keep, and an agreed plan carries back. */
export interface Plan {
  readonly plan: string;
  readonly frame: string | null;
  readonly steps: readonly PlanStep[];
}

const SPEAKING = new Set(['say', 'think', 'speakLine']);
const CONTAINERS = new Set([
  'doInOrder',
  'doTogether',
  'count',
  'while',
  'forEach',
  'eachTogether',
]);
const LATER =
  "The Prompter can't add or change objects in the scene yet. Ask the learner to do it from Backstage, then carry on.";

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
const squash = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

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

export class PrompterRunner implements ToolRunner {
  readonly #setup: RunnerSetup;
  #request = '';
  #agreed: Plan | null = null;
  #open = false;
  #commented = new Set<number>();
  #plans = new Map<string, Plan>();

  constructor(setup: RunnerSetup) {
    this.#setup = setup;
  }

  begin(request: string, context: RequestContext = {}): void {
    this.#request = request;
    this.#agreed = asPlan(context.agreedPlan);
    this.#commented = new Set();
  }

  end(): void {
    if (this.#open) this.#setup.session.commit();
    this.#open = false;
  }

  /** The plans shown in this conversation, for the panel and for keeping with the frame (6.7). */
  plan(id: string): Plan | undefined {
    return this.#plans.get(id);
  }

  run(name: ToolName, input: JsonObject): Result {
    switch (name) {
      case 'explain':
        return ok('Shown to the learner.');
      case 'read_project':
        return ok(this.#projectData());
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
      case 'declare_procedure':
      case 'add_event_listener':
        return this.#change(name, input);
      case 'add_model':
      case 'set_property':
      case 'stage_scene':
        return fail('not_allowed_here', LATER);
    }
  }

  // ---- Reading ----------------------------------------------------------------------------------

  #sceneType(program: Program = this.#setup.session.program()): TypeDecl | null {
    const scene = this.#setup.production().scenes.find((s) => s.id === this.#setup.scene());
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
  #projectData(): string {
    const production = { ...this.#setup.production(), program: this.#setup.session.program() };
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
    const found = this.#setup.production().frames.find((f) => f.id === frame);
    if (!found) return fail('unknown_frame', `There is no frame ${frame}.`);
    const result = this.#setup.checkResult?.(found.id) ?? null;
    return result === null
      ? ok("This frame hasn't been checked yet. The learner can press Check this frame.")
      : ok(dataBlock('check_result', result));
  }

  #scriptCheck(scene: string): Result {
    const production = this.#setup.production();
    if (scene !== '' && !production.scenes.some((s) => s.id === scene))
      return fail('unknown_object', `There is no scene ${scene}.`);
    const facts = scriptFacts(production, scene === '' ? undefined : (scene as SceneId));
    return ok(dataBlock('check_result', facts as unknown as Json));
  }

  // ---- Plans -------------------------------------------------------------------------------------

  #world(frame: string | null): PlanWorld {
    const production = this.#setup.production();
    const program = this.#setup.session.program();
    const type = this.#sceneType(program);
    const objects = new Map<string, ApiClass>([['this', 'Scene']]);
    if (type) {
      const scene = this.#sceneObjects(type, program);
      for (const field of type.fields) {
        const cls = scene.classOf(field);
        if (cls) objects.set(field.name, cls);
      }
    }
    const onFrame = production.frames.find((f) => f.id === frame);
    return {
      objects,
      lines: new Map(production.script.map((l) => [String(l.id), l.text])),
      sketches: new Set(onFrame ? onFrame.sketches.map((s) => s.id) : []),
      scenes: new Set(production.scenes.map((s) => String(s.id))),
      isBackstageItem: this.#setup.isBackstageItem,
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
    if (frame !== null && !this.#setup.production().frames.some((f) => f.id === frame))
      return fail('unknown_frame', `There is no frame ${frame}.`);
    const problems = checkPlan(steps, this.#world(frame));
    if (problems.length > 0)
      return fail(
        'bad_argument',
        `These steps can't be built: ${problems.map((p) => `step ${p.step}: ${p.message}`).join(' ')} Fix them and try again.`,
      );
    this.#plans.set(id, { plan: id, frame, steps });
    return ok(`Plan ${id} is shown to the learner. End your turn now and wait.`, { plan: id });
  }

  #codeFrame(frame: string): Result {
    if (!this.#setup.production().frames.some((f) => f.id === frame))
      return fail('unknown_frame', `There is no frame ${frame}.`);
    if (this.#agreed?.frame !== frame)
      return fail('no_agreed_plan', `The learner hasn't agreed a plan for frame ${frame}.`);
    const type = this.#sceneType();
    const scene = this.#setup.production().scenes.find((s) => s.id === this.#setup.scene());
    const method = type?.methods.find((m) => m.id === scene?.method);
    if (!method) return fail('unknown_method', "This scene's method can't be found.");
    return ok(`Build frame ${frame} in ${method.name}.`, { method: method.name });
  }

  // ---- Changes -----------------------------------------------------------------------------------

  #change(name: ToolName, input: Input): Result {
    const steps = this.#agreed?.steps ?? [];
    const number = typeof input.plan_step === 'number' ? input.plan_step : 0;
    const step = steps[number - 1];
    if (!step) return fail('not_in_plan', `There is no step ${number} in the agreed plan.`);
    const wrong = mismatch(name, input, step);
    if (wrong) return fail('not_in_plan', wrong);

    const program = this.#setup.session.program();
    const type = this.#sceneType(program);
    if (!type) return fail('unknown_method', "This scene can't be found in the program.");
    const scene = this.#sceneObjects(type, program);
    const mint = idMinter(program);

    switch (name) {
      case 'insert_statement':
        return this.#insert(input, step, number, scene, mint, () => this.#call(input, scene, mint));
      case 'insert_control':
        return this.#insert(input, step, number, scene, mint, () =>
          this.#control(input, scene, mint),
        );
      case 'declare_procedure':
        return this.#declareProcedure(input, program, type, mint);
      default:
        return this.#listen(input, type, scene, mint);
    }
  }

  /** Applies edits, labelled in plain words, opening the request's undo group with the first. */
  #apply(unlabelled: readonly EditOperation[]): Result | null {
    const { session, source } = this.#setup;
    const program = session.program();
    const edits = unlabelled.map((e) => (e.label ? e : { ...e, label: defaultLabel(program, e) }));
    const label = edits.at(-1)!.label;
    if (!this.#open) {
      session.begin(label, source);
      this.#open = true;
    }
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
    build: () => Statement | Result,
  ): Result {
    const where = this.#slot(input, scene);
    if ('ok' in where) return where;
    const position = text(input.position);
    const at = position === 'end' ? where.length : Number(position);
    if (at > where.length)
      return fail(
        'bad_argument',
        `position ${position} is past the end; there are ${where.length} blocks there.`,
      );
    const node = build();
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
    const ids: Record<string, string> = { block: node.id };
    if (node.kind === 'if')
      Object.assign(ids, { then: `${node.id}:then`, else: `${node.id}:else` });
    return ok(label, ids);
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

  #call(input: Input, scene: SceneObjects, mint: () => NodeId): Statement | Result {
    const target = objectRef(text(input.target), scene, mint);
    if (!target) return fail('unknown_object', `There's no ${text(input.target)} in this scene.`);
    const procedure = text(input.procedure);
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

    const said = SPEAKING.has(procedure) ? this.#speech(input, args) : null;
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

  /** What characters say comes from the script or the learner's own words (section 6.5). */
  #speech(input: Input, args: Args): Result | null {
    const words = args.text?.kind === 'text' ? args.text.value : '';
    const lineId = text(input.line);
    if (lineId) {
      const line = this.#setup.production().script.find((l) => l.id === lineId);
      if (!line) return fail('unknown_line', `There is no script line ${lineId}.`);
      return line.text === words
        ? null
        : fail('not_in_script', `Use line ${lineId}'s exact words: "${line.text}".`);
    }
    if (this.#agreed?.frame)
      return fail(
        'not_in_script',
        'In a frame, what a character says is a script line: give its exact words and its id in line.',
      );
    return squash(this.#request).includes(squash(words)) && words.trim() !== ''
      ? null
      : fail(
          'not_in_script',
          "What a character says comes from the script or the learner's own words. Ask the learner what it should say.",
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

  #declareProcedure(
    input: Input,
    program: Program,
    sceneType: TypeDecl,
    mint: () => NodeId,
  ): Result {
    const className = text(input.class);
    const owner =
      className === 'Scene' ? sceneType : program.types.find((t) => t.name === className);
    if (!owner) return fail('unknown_object', `There is no class ${className}.`);
    const params = Array.isArray(input.parameters)
      ? (input.parameters as { name: string; type: string }[])
      : [];
    const bad = params.find((p) => !isStoryType(p.type));
    if (bad) return fail('bad_argument', `${bad.type} isn't a type in the Story API catalog.`);
    const node: MethodDecl = {
      id: mint(),
      kind: 'method',
      name: text(input.name),
      returns: null,
      params: params.map((p) => ({
        id: mint(),
        kind: 'parameter',
        name: p.name,
        type: story(p.type),
        default: null,
      })),
      body: [],
    };
    const refused = this.#apply([
      { kind: 'declare', label: '', parent: owner.id, index: owner.methods.length, node },
    ]);
    return refused ?? ok(`Added ${node.name}.`, { method: node.name });
  }

  #listen(input: Input, sceneType: TypeDecl, scene: SceneObjects, mint: () => NodeId): Result {
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
    const node: ListenerDecl = {
      id: mint(),
      kind: 'listener',
      event: event.name,
      args,
      details: {},
      params: event.gives.map((g) => ({
        id: mint(),
        kind: 'parameter',
        name: g.name,
        type: story(g.type),
        default: null,
      })),
      body: [],
    };
    const refused = this.#apply([
      { kind: 'declare', label: '', parent: sceneType.id, index: sceneType.listeners.length, node },
    ]);
    return refused ?? ok(`Added a ${event.name} listener.`, { block: node.id });
  }
}
