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
import { listText, toValue } from './values.ts';

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
  const values: string[] = [];
  for (const input of move.inputs) {
    const given = step.details.find((d) => d.name === input.name)?.value;
    // A line's words can be longer than a step's value may be, so they aren't given again.
    if (given === undefined && input === lined) continue;
    const value = given ?? (input === targeted ? target : undefined);
    if (value === undefined || !inputFits(input, value, stage, code)) return needs(input.name);
    values.push(value);
  }
  if (target !== '' && !values.includes(target))
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
      const twice = givenTwice(step.details);
      if (twice !== undefined)
        return `A ${step.action} block can have ${settingWords(twice)} only once.`;
      const move = stepMove(step, stage, world);
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
      return (SETTABLE_PROPERTIES as readonly string[]).includes(step.action)
        ? null
        : `${step.action} isn't something a step can set.`;
    case 'when':
      return LISTENER_EVENTS.includes(step.action) && findEvent(step.action)
        ? null
        : `There's no ${step.action} event.`;
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
      return step.kind === 'when' && text(input.event) === step.action ? null : wrong;
    case 'add_model':
      return step.kind === 'add' &&
        text(input.backstage_item) === step.action &&
        text(input.name) === step.actor
        ? null
        : wrong;
    case 'set_property': {
      if (step.kind !== 'change') return wrong;
      if (text(input.object) !== step.actor || text(input.property) !== step.action) return wrong;
      const value = step.details.find((d) => d.name === step.action || d.name === 'value');
      return value === undefined || value.value === text(input.value) ? null : wrong;
    }
    case 'stage_scene':
      return step.kind === 'stage' && text(input.scene) === step.action ? null : wrong;
    default:
      return wrong;
  }
}
