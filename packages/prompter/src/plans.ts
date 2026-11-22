/**
 * Plan before change (`docs/spec/04-prompter.md` sections 6.2 to 6.4). A plan is checked against
 * the Story API and the production before the learner sees it, so a step that can't be built
 * says so first; and during a build each change must match the agreed step it names, so code,
 * not trust, keeps the build to the plan.
 *
 * Messages for a step are shown to the learner on that step, so they are in plain words (rule 9).
 */
import type { PlanStep } from '@storystage/production';
import {
  classOfType,
  findEntry,
  findEvent,
  type ApiClass,
  type ParamDef,
} from '@storystage/story-api';
import { word } from '@storystage/story-api/editing';
import {
  onlyInput,
  typesIn,
  unplannable,
  type OwnInput,
  type OwnMove,
  type PlanCode,
} from './own-moves.ts';
import { stageAdd, stageNow, stepMove, type Stage } from './plan-stage.ts';
import { PLAN_EDIT_WORDS, heldBy, holdable } from './repeats.ts';
import { LISTENER_EVENTS } from './tools.ts';
import { listItems, listText, toValue } from './values.ts';

/**
 * A plan step, as `propose_plan` sends it (section 6.2). `""` means none. It's the production
 * format's own type (1.6.0), since a frame keeps its plan (6.7), so there is one type.
 */
export type { PlanStep };

export type NameValue = PlanStep['details'][number];

/** What a plan is checked against: the scene it's for and the production around it. */
export interface PlanWorld {
  /** Objects in the scene by name, with their class. `this` is the scene. */
  readonly objects: ReadonlyMap<string, ApiClass>;
  /** Script lines by id, with their words. */
  readonly lines: ReadonlyMap<string, string>;
  /** Placed sketch ids on the frame, if the plan is for one. */
  readonly sketches: ReadonlySet<string>;
  readonly scenes: ReadonlySet<string>;
  readonly isBackstageItem: (id: string) => boolean;
  /**
   * The code, for the learner's own procedures and moves (section 6.9) and the class of a model a
   * step adds. Without it, a step can use only the Story API's blocks.
   */
  readonly code?: PlanCode;
}

export interface PlanProblem {
  /** From 1, as the learner sees the steps numbered. */
  readonly step: number;
  readonly message: string;
}

/** A setting's name as the blocks show it ("amount", "words"). */
export function settingWords(name: string): string {
  const param = word(`param.${name}`);
  if (param !== `param.${name}`) return param;
  const detail = word(`detail.${name}`);
  return detail !== `detail.${name}` ? detail : name;
}

export const SETTABLE_PROPERTIES = [
  'position',
  'turn_degrees',
  'scale',
  'paint',
  'opacity',
  'vehicle',
] as const;

/**
 * The object a step acts on, or `""` for none. A step whose target is its own actor ("the
 * penguin moves", target "penguin") acts on nothing else: the actor is the block's own object,
 * so it's read as none (the owner's first pilot, 21 Nov 2026, had Claude write every step so).
 */
export const targetOf = (step: PlanStep): string => (step.target === step.actor ? '' : step.target);

/** A setting given more than once: the step would match on one value and build the other. */
const givenTwice = (given: readonly NameValue[]): string | undefined =>
  given.find((g, i) => given.findIndex((h) => h.name === g.name) !== i)?.name;

/** The value a change step sets: by the property's name, or as `value`. */
const changeValue = (step: PlanStep): string | undefined =>
  step.details.find((d) => d.name === step.action || d.name === 'value')?.value;
const propertyWords = (name: string) => (name === 'turn_degrees' ? 'turn' : name);

/**
 * How many lists of objects a listener uses: a click's is its setOfVisuals detail, where none
 * means everything; any other event's are its arguments, where an empty one means it never runs.
 */
function eventObjects(event: NonNullable<ReturnType<typeof findEvent>>) {
  const args = event.args.filter((a) => a.type !== 'Number');
  return {
    lists: event.details.includes('setOfVisuals') ? 1 : args.length,
    needed: args.length,
    single: args.length === 1 && !args[0]!.type.endsWith('[]'),
  };
}

/**
 * The objects a when step names: its actor, its target, and a detail's values that are objects
 * (so a setting's own value, such as "combine", isn't taken for one).
 */
function eventNames(step: PlanStep, isObject: (name: string) => boolean): string[] {
  const listed = step.details.flatMap((d) => listItems(d.value)).filter(isObject);
  const names = [step.actor, targetOf(step), ...listed];
  return [...new Set(names.filter((n) => n !== '' && n !== 'scene' && n !== 'this'))];
}

/**
 * Why a step's event can't be built, or null: who it's about must be in the scene, an event with
 * lists of objects needs one for each, and one that takes a number needs the step to give it.
 */
function whenProblem(
  step: PlanStep,
  stage: Stage,
  missing: (name: string) => string,
): string | null {
  const event = LISTENER_EVENTS.includes(step.action) ? findEvent(step.action) : null;
  if (!event) return `There's no ${step.action} event.`;
  const { lists, needed } = eventObjects(event);
  if (lists > 0) {
    const { actor } = step;
    if (actor !== 'scene' && actor !== 'this' && !stage.objects.has(actor)) return missing(actor);
    const named = eventNames(step, (name) => stage.objects.has(name)).length;
    if (needed === 2 && named < 2)
      return `A ${step.action} event needs two objects: who, and what it meets.`;
    if (needed === 1 && named < 1) return `A ${step.action} event needs an object.`;
  }
  const number = event.args.find((a) => a.type === 'Number');
  return number && stepNumber(step) === null
    ? `A ${step.action} event needs a value for ${number.name}.`
    : null;
}

/** The number a when step gives: the seconds of a timer, or the metres of a nearness. */
function stepNumber(step: PlanStep): number | null {
  const found = step.details.find((d) => d.value.trim() !== '' && Number.isFinite(Number(d.value)));
  return found ? Number(found.value) : null;
}

/** Whether a step's value fits an input of a learner's procedure (section 6.9). */
function inputFits(input: OwnInput, value: string, stage: Stage, code: PlanCode): boolean {
  if (input.kind === 'object') {
    const type = stage.types.get(value);
    return type !== undefined && typesIn(code.program).typeFits(type, input.type);
  }
  if (input.kind === 'text') return value.trim() !== '';
  // A plain value needs no object, and isn't put in the program: any id will do.
  const nowhere = { type: code.scene, classOf: () => null };
  return toValue(value, input.storyType!, nowhere, () => code.scene.id).ok;
}

/** The problem with a step that calls one of the learner's procedures (section 6.9). */
function ownProblem(step: PlanStep, move: OwnMove, stage: Stage, code: PlanCode): string | null {
  const cant = unplannable(code, move);
  if (cant !== null) return cant;
  const { name } = move.method;
  const needs = (input: string) => `A ${name} block needs a value for ${input}.`;
  const unknown = step.details.find((d) => !move.inputs.some((i) => i.name === d.name));
  if (unknown) return `A ${name} block has no ${unknown.name} setting.`;

  const target = targetOf(step);
  const targeted = target === '' ? null : onlyInput(move, 'object');
  const lined = step.line === '' ? null : onlyInput(move, 'text');
  const acted: string[] = [];
  for (const input of move.inputs) {
    const given = step.details.find((d) => d.name === input.name)?.value;
    // A line's words can be longer than a step's value may be, so they aren't given again.
    if (given === undefined && input === lined) continue;
    const value = given ?? (input === targeted ? target : undefined);
    if (value === undefined || !inputFits(input, value, stage, code)) return needs(input.name);
    if (input.kind === 'object') acted.push(value);
  }
  if (target !== '' && !acted.includes(target))
    return `A ${name} block doesn't act on the ${target}.`;
  return null;
}

/** The problem with one step, given what the steps before it leave in the scene. */
function stepProblem(step: PlanStep, stage: Stage, world: PlanWorld): string | null {
  const { objects } = stage;
  const has = (name: string) => objects.has(name);
  const missing = (name: string) =>
    `There's no ${name} in this scene yet. Add one first, or change who does this.`;

  // Only a repeat step (6.8) has no actor or action; the tool lets them be empty for it.
  if (step.kind !== 'repeat' && step.actor.trim() === '') return 'Say who does this step.';
  if (step.kind !== 'repeat' && step.action.trim() === '') return 'Say what this step does.';
  if (step.line !== '' && !world.lines.has(step.line)) return "That line isn't in your script.";
  if (step.sketch !== '' && !world.sketches.has(step.sketch))
    return "That sketch isn't on this frame.";
  const target = targetOf(step);
  if (target !== '' && !has(target)) return `There's no ${target} in this scene.`;

  switch (step.kind) {
    case 'do': {
      if (!has(step.actor)) return missing(step.actor);
      const move = stepMove(step, stage, world);
      const twice = givenTwice(step.details);
      if (twice !== undefined) {
        // An input of the learner's goes by its own name, never a built-in's word.
        const setting = move ? twice : settingWords(twice);
        return `A ${step.action} block can have ${setting} only once.`;
      }
      if (move) return ownProblem(step, move, stage, world.code!);
      const cls = objects.get(step.actor);
      // Without the code, an object added earlier in the plan has no class yet: its blocks are
      // checked as it's built.
      if (cls === null || cls === undefined) return null;
      const entry = findEntry(cls, step.action);
      if (!entry || entry.kind !== 'procedure') {
        const who = step.actor === 'this' ? 'scene' : step.actor;
        return `The ${who} has no ${step.action} block.`;
      }
      const known = new Set([...entry.params.map((p) => p.name), ...entry.details]);
      const unknown = step.details.find((d) => !known.has(d.name));
      if (unknown) return `A ${step.action} block has no ${unknown.name} setting.`;
      // Every setting the block needs is in the step, with a value, so the learner sees and can
      // change it, and the build is held to it (6.4). The step's target and line fill the
      // block's object and its words.
      const filled = (p: ParamDef) =>
        step.details.some((d) => d.name === p.name) ||
        (p.name === 'text' && step.line !== '') ||
        (classOfType(p.type) !== null && target !== '');
      const needed =
        step.details.find((d) => d.value.trim() === '')?.name ??
        entry.params.find((p) => !filled(p))?.name;
      return needed ? `A ${step.action} block needs a value for ${settingWords(needed)}.` : null;
    }
    case 'add':
      if (!world.isBackstageItem(step.action)) return `${step.action} isn't in Backstage.`;
      if (has(step.actor)) return `There's already something called ${step.actor} here.`;
      stageAdd(stage, step, world);
      return null;
    case 'change':
      if (!has(step.actor)) return missing(step.actor);
      if (!(SETTABLE_PROPERTIES as readonly string[]).includes(step.action))
        return `${step.action} isn't something a step can set.`;
      return changeValue(step)?.trim()
        ? null
        : `A change step needs the value for ${propertyWords(step.action)}.`;
    case 'when':
      return whenProblem(step, stage, missing);
    case 'stage':
      return world.scenes.has(step.action) ? null : `There's no scene ${step.action}.`;
    case 'repeat':
      // Checked with the steps it holds (`repeatProblems`, section 6.8).
      return null;
  }
}

/** Every step that can't be built, in order. Empty means the plan can be shown. */
export function checkPlan(steps: readonly PlanStep[], world: PlanWorld): PlanProblem[] {
  const stage = stageNow(world);
  const repeats = repeatProblems(steps);
  return steps.flatMap((step, i) => {
    const message = repeats.get(i) ?? stepProblem(step, stage, world);
    return message === null ? [] : [{ step: i + 1, message }];
  });
}

/**
 * The rules a plan's repeats keep (section 6.8), by step index. The format keeps any plan that
 * can be read; these are the Prompter's, and some ("for now") may be lifted later.
 */
function repeatProblems(steps: readonly PlanStep[]): Map<number, string> {
  const found = new Map<number, string>();
  const held = heldBy(steps);
  steps.forEach((s, i) => {
    if (s.kind === 'repeat') {
      if (s.repeat < 2) found.set(i, 'A repeat needs to run at least 2 times.');
      else if (s.holds < 1) found.set(i, 'A repeat needs at least one step inside it.');
      else if (i + s.holds >= steps.length)
        found.set(i, 'This repeat holds more steps than come after it.');
      else if (
        s.actor !== '' ||
        s.action !== '' ||
        targetOf(s) !== '' ||
        s.line !== '' ||
        s.sketch !== '' ||
        s.details.length > 0 ||
        s.together
      )
        found.set(i, 'A repeat step only says how many times, and which steps are inside.');
    } else if (s.holds > 0) found.set(i, 'Only a repeat step can hold other steps.');
    const holder = held[i];
    if (holder === null || holder === undefined || found.has(i)) return;
    if (s.kind === 'repeat') found.set(i, "A repeat can't go inside another repeat yet.");
    else if (!holdable(s)) found.set(i, PLAN_EDIT_WORDS.cantHold);
    else if (s.repeat > 1) found.set(i, PLAN_EDIT_WORDS.cantRepeat);
    else if (s.together && i === holder + 1) found.set(i, PLAN_EDIT_WORDS.cantBeFirst);
  });
  return found;
}

// ---- The build matches the plan (section 6.4) ------------------------------------------------

type Input = Readonly<Record<string, unknown>>;
const pairs = (value: unknown): NameValue[] => (Array.isArray(value) ? (value as NameValue[]) : []);
const text = (value: unknown) => (typeof value === 'string' ? value : '');

/**
 * Why a change call doesn't match the agreed step it names, or `null` if it does. Supporting
 * calls are allowed for the step they serve: the `doTogether` for a step that runs together,
 * or for the step the next one runs together with, the `count` for one that repeats, a
 * `doInOrder` to hold either. `next` is the step after this one.
 * These messages go to Claude, not the learner: each says what differs, so it can build again.
 */
export function mismatch(
  tool: string,
  input: Input,
  step: PlanStep,
  next?: PlanStep,
  /** Whether a name is an object in the scene, to read a when step's details by. */
  isObject: (name: string) => boolean = () => false,
): string | null {
  const build = 'Build exactly the agreed step.';
  const wrong = `Step "${step.words}" doesn't do that. ${build}`;
  const differs = (what: string) => `Step "${step.words}" ${what}. ${build}`;
  switch (tool) {
    case 'insert_statement': {
      if (step.kind === 'repeat')
        return differs(
          `is a repeat: build it as a count block with count ${step.repeat}, then its steps inside it`,
        );
      if (step.kind !== 'do') return differs(`is a ${step.kind} step, not a block`);
      if (text(input.target) !== step.actor || text(input.procedure) !== step.action)
        return differs(`is the ${step.actor}'s ${step.action} block, with target ${step.actor}`);
      const given = [...pairs(input.arguments), ...pairs(input.details)];
      const twice = givenTwice(given);
      if (twice !== undefined)
        return differs(`has each setting once, and this gives ${twice} more than once`);
      const target = targetOf(step);
      if (target !== '' && !given.some((g) => g.value === target))
        return differs(`acts on the ${target}: give ${target} as the block's object`);
      const missing = step.details.find(
        (d) =>
          !given.some(
            (g) =>
              g.name === d.name &&
              (g.value === d.value ||
                (d.value.includes(',') && listText(g.value) === listText(d.value))),
          ),
      );
      if (missing) return differs(`sets ${missing.name} to ${missing.value}`);
      if (text(input.line) !== step.line)
        return differs(step.line === '' ? 'says no script line' : `says script line ${step.line}`);
      return null;
    }
    case 'insert_control': {
      // `next` is the step after this one at its own level: after a repeat, after all it holds.
      const kind = text(input.kind);
      const grouped = step.together || next?.together === true;
      if (kind === 'doTogether' && grouped) return null;
      if (kind === 'count' && step.repeat > 1 && input.count === step.repeat) return null;
      if (kind === 'doInOrder' && (grouped || step.repeat > 1)) return null;
      if (kind === 'count' && step.repeat > 1) return differs(`repeats ${step.repeat} times`);
      return differs(
        grouped || step.repeat > 1
          ? `needs a ${step.repeat > 1 ? 'count' : 'doTogether'} block`
          : 'runs on its own, after the step before it',
      );
    }
    case 'add_event_listener':
      if (step.kind !== 'when' || text(input.event) !== step.action) return wrong;
      return eventDiffers(input, step, differs, isObject);
    case 'add_model':
      if (
        step.kind !== 'add' ||
        text(input.backstage_item) !== step.action ||
        text(input.name) !== step.actor
      )
        return wrong;
      return addDiffers(input, step, differs);
    case 'set_property': {
      if (step.kind !== 'change') return wrong;
      if (text(input.object) !== step.actor || text(input.property) !== step.action) return wrong;
      const value = changeValue(step);
      if (value === undefined) return differs('gives no value to set');
      return value === text(input.value) ? null : wrong;
    }
    case 'stage_scene':
      return step.kind === 'stage' && text(input.scene) === step.action ? null : wrong;
    default:
      return wrong;
  }
}

/**
 * Why an add doesn't start the model as its step shows, or null. A turn or a size the step
 * doesn't give is none, and the usual size.
 */
function addDiffers(
  input: Input,
  step: PlanStep,
  differs: (what: string) => string,
): string | null {
  const shown = (name: string) => step.details.find((d) => d.name === name)?.value;
  const near = (a: unknown, b: number) => typeof a === 'number' && Math.abs(a - b) < 1e-6;
  const position = shown('position');
  if (position !== undefined) {
    const at = (input.position ?? {}) as Input;
    const parts = position.split(',').map((p) => (p.trim() === '' ? NaN : Number(p)));
    if (parts.length !== 3 || !(['x', 'y', 'z'] as const).every((k, i) => near(at[k], parts[i]!)))
      return differs(`puts it at ${position}`);
  }
  for (const [name, usual] of [
    ['turn_degrees', 0],
    ['scale', 1],
  ] as const) {
    const given = shown(name);
    if (near(input[name] ?? usual, given === undefined ? usual : Number(given))) continue;
    return differs(given === undefined ? `gives it no ${name}` : `sets ${name} to ${given}`);
  }
  return null;
}

/**
 * Why a built-in's call has a value its step didn't show, or null (section 6.4). The step's
 * details give each value; its target is the block's object, not just any value the call holds;
 * its line is the block's words. A block with no object of its own can take the target in a
 * detail, such as whose view it moves by.
 */
export function unplanned(
  step: PlanStep,
  params: readonly ParamDef[],
  given: readonly NameValue[],
): string | null {
  const target = targetOf(step);
  const actsOn = (name: string) =>
    params.some((p) => p.name === name && classOfType(p.type) !== null);
  const carried = !params.some((p) => classOfType(p.type) !== null);
  for (const { name, value } of given) {
    if (step.details.some((d) => d.name === name)) continue;
    if (target !== '' && value === target && (actsOn(name) || carried)) continue;
    if (name === 'text' && step.line !== '' && params.some((p) => p.name === name)) continue;
    const what =
      target !== '' && actsOn(name)
        ? `acts on the ${target}: give ${target} as ${name}`
        : `has no ${name}`;
    return `Step "${step.words}" ${what}. Build exactly the agreed step.`;
  }
  return null;
}

/**
 * Why a listener isn't the event its step showed, or null (section 6.4). Its lists are read as
 * the runner uses them: objects first, and other_objects only for an event with two. It's about
 * only the objects the step names, no list an event needs is empty, and a pair has every one
 * named. Its number is the step's.
 */
function eventDiffers(
  input: Input,
  step: PlanStep,
  differs: (what: string) => string,
  isObject: (name: string) => boolean,
): string | null {
  const event = findEvent(step.action);
  if (!event) return null;
  if (event.args.some((a) => a.type === 'Number')) {
    const shown = stepNumber(step);
    if (shown === null) return differs('gives no number for the event');
    if (input.number !== shown) return differs(`gives ${shown} as the number`);
  }
  const { lists, needed, single } = eventObjects(event);
  const namesIn = (list: unknown) => (Array.isArray(list) ? (list as string[]) : []);
  const objects = namesIn(input.objects);
  const others = namesIn(input.other_objects);
  if (lists < 2 && others.length > 0)
    return differs('has no second group: give its objects in objects, and other_objects empty');
  if (lists === 0) return null;
  const named = eventNames(step, isObject);
  const built = [...objects, ...others];
  const other = built.find((name) => !named.includes(name));
  if (other !== undefined) return differs(`doesn't name ${other}`);
  const about = `is about ${named.join(', ') || 'no object'}`;
  if (objects.length === 0 && (needed > 0 || named.length > 0)) return differs(about);
  if (single && objects.length !== 1) return differs('takes one object, in objects');
  if (needed === 2) {
    if (others.length === 0)
      return differs('has two groups: give one in objects and the other in other_objects');
    if (named.some((name) => !built.includes(name))) return differs(about);
  }
  return null;
}
