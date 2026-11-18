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
import { LISTENER_EVENTS } from './tools.ts';

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
}

export interface PlanProblem {
  /** From 1, as the learner sees the steps numbered. */
  readonly step: number;
  readonly message: string;
}

/** A setting's name as the blocks show it ("amount", "words"). */
function settingWords(name: string): string {
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

/** The problem with one step, given the objects the steps before it leave in the scene. */
function stepProblem(
  step: PlanStep,
  objects: Map<string, ApiClass | null>,
  world: PlanWorld,
): string | null {
  const has = (name: string) => objects.has(name);
  const missing = (name: string) =>
    `There's no ${name} in this scene yet. Add one first, or change who does this.`;

  if (step.line !== '' && !world.lines.has(step.line)) return "That line isn't in your script.";
  if (step.sketch !== '' && !world.sketches.has(step.sketch))
    return "That sketch isn't on this frame.";
  if (step.target !== '' && !has(step.target)) return `There's no ${step.target} in this scene.`;

  switch (step.kind) {
    case 'do': {
      if (!has(step.actor)) return missing(step.actor);
      const cls = objects.get(step.actor);
      // An object added earlier in the plan has no class yet: its blocks are checked as it's built.
      if (cls === null || cls === undefined) return null;
      const entry = findEntry(cls, step.action);
      if (!entry || entry.kind !== 'procedure')
        return `The ${step.actor} has no ${step.action} block.`;
      const known = new Set([...entry.params.map((p) => p.name), ...entry.details]);
      const unknown = step.details.find((d) => !known.has(d.name));
      if (unknown) return `A ${step.action} block has no ${unknown.name} setting.`;
      // Every setting the block needs is in the step, with a value, so the learner sees and can
      // change it, and the build is held to it (6.4). The step's target and line fill the
      // block's object and its words.
      const filled = (p: ParamDef) =>
        step.details.some((d) => d.name === p.name) ||
        (p.name === 'text' && step.line !== '') ||
        (classOfType(p.type) !== null && step.target !== '');
      const needed =
        step.details.find((d) => d.value.trim() === '')?.name ??
        entry.params.find((p) => !filled(p))?.name;
      return needed ? `A ${step.action} block needs a value for ${settingWords(needed)}.` : null;
    }
    case 'add':
      if (!world.isBackstageItem(step.action)) return `${step.action} isn't in Backstage.`;
      if (has(step.actor)) return `There's already something called ${step.actor} here.`;
      objects.set(step.actor, null);
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
  }
}

/** Every step that can't be built, in order. Empty means the plan can be shown. */
export function checkPlan(steps: readonly PlanStep[], world: PlanWorld): PlanProblem[] {
  const objects = new Map<string, ApiClass | null>(world.objects);
  return steps.flatMap((step, i) => {
    const message = stepProblem(step, objects, world);
    return message === null ? [] : [{ step: i + 1, message }];
  });
}

// ---- The build matches the plan (section 6.4) ------------------------------------------------

type Input = Readonly<Record<string, unknown>>;
const pairs = (value: unknown): NameValue[] => (Array.isArray(value) ? (value as NameValue[]) : []);
const text = (value: unknown) => (typeof value === 'string' ? value : '');

/** The step's details, each given with the same value somewhere in the call. */
function detailsMatch(step: PlanStep, given: readonly NameValue[]): boolean {
  return step.details.every((d) => given.some((g) => g.name === d.name && g.value === d.value));
}

/**
 * Why a change call doesn't match the agreed step it names, or `null` if it does. Supporting
 * calls are allowed for the step they serve: the `doTogether` for a step that runs together,
 * the `count` for one that repeats, a `doInOrder` to hold either, and a new procedure.
 * These messages go to Claude, not the learner.
 */
export function mismatch(tool: string, input: Input, step: PlanStep): string | null {
  const wrong = `Step "${step.words}" doesn't do that. Build exactly the agreed step.`;
  switch (tool) {
    case 'insert_statement': {
      if (step.kind !== 'do') return wrong;
      if (text(input.target) !== step.actor || text(input.procedure) !== step.action) return wrong;
      const given = [...pairs(input.arguments), ...pairs(input.details)];
      if (step.target !== '' && !given.some((g) => g.value === step.target)) return wrong;
      if (!detailsMatch(step, given)) return wrong;
      return text(input.line) === step.line ? null : wrong;
    }
    case 'insert_control': {
      const kind = text(input.kind);
      if (kind === 'doTogether' && step.together) return null;
      if (kind === 'count' && step.repeat > 1 && input.count === step.repeat) return null;
      if (kind === 'doInOrder' && (step.together || step.repeat > 1)) return null;
      return wrong;
    }
    case 'declare_procedure':
      return null;
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
