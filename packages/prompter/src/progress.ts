/**
 * Plan only's ticks (`docs/spec/04-prompter.md` section 6.6, WP13.9): which steps of a plan the
 * learner's own building matches, by the rule a build is held to (6.4). The learner builds every
 * block; code ticks a step off when one matches it. Pure: the runner gives it the scene as it is.
 */
import type { Expression, ListenerDecl, NodeId, Statement, TypeDecl } from '@storystage/ast';
import type { SceneObjectSetup } from '@storystage/story-api';
import { classOfType, findEntry, type ApiClass } from '@storystage/story-api';
import { targetOf, type PlanStep } from './plans.ts';
import { heldBy } from './repeats.ts';

/** What the ticks are worked out against: the scene now, and what counts as the learner's. */
export interface ProgressWorld {
  /** The scene's class in the program: its fields, methods and listeners. */
  readonly type: TypeDecl;
  /** An object's class, by its name in the scene (`this` is the scene). */
  readonly classOf: (name: string) => ApiClass | null;
  /** The scene's set-up objects, for `add` and `change` steps. */
  readonly objects: readonly SceneObjectSetup[];
  /** Script lines by id, with their words. */
  readonly lines: ReadonlyMap<string, string>;
  /**
   * Whether a block is the learner's work for this plan: added since the plan was shown, or
   * linked to its frame. Given the block and the blocks around it, innermost last.
   */
  readonly counts: (id: NodeId, around: readonly NodeId[]) => boolean;
  /** Whether the scene is set up from its storyboard card, with nothing left to add. */
  readonly staged: boolean;
}

/** A call in the scene, with what a step is matched by. */
interface Found {
  readonly id: NodeId;
  readonly target: string;
  readonly procedure: string;
  readonly values: ReadonlyMap<string, string>;
  readonly counts: readonly number[];
  readonly together: boolean;
  readonly mine: boolean;
}

/** A value as a step writes it, or null for one no step can give (an expression). */
function valueText(e: Expression, fields: ReadonlyMap<NodeId, string>): string | null {
  switch (e.kind) {
    case 'number':
    case 'wholeNumber':
      return String(e.value);
    case 'boolean':
      return e.value ? 'true' : 'false';
    case 'text':
    case 'enum':
      return e.value;
    case 'this':
      return 'this';
    case 'fieldRef':
      return e.target.kind === 'this' ? (fields.get(e.field) ?? null) : null;
    default:
      return null;
  }
}

/** Two values the same, as a step and a block give them: numbers by value ("2" is "2.0"). */
function same(a: string, b: string): boolean {
  if (a === b) return true;
  const x = Number(a);
  const y = Number(b);
  return a.trim() !== '' && b.trim() !== '' && Number.isFinite(x) && x === y;
}

/** A count block in the scene: its times, and whether it's the learner's work for this plan. */
interface Loop {
  readonly id: NodeId;
  readonly times: number;
  readonly mine: boolean;
}

function calls(world: ProgressWorld, loops: Loop[] = []): Found[] {
  const fields = new Map(world.type.fields.map((f) => [f.id, f.name] as const));
  const found: Found[] = [];
  const visit = (
    body: readonly Statement[],
    around: readonly NodeId[],
    counts: readonly number[],
    together: boolean,
  ): void => {
    for (const s of body) {
      const here = [...around, s.id];
      switch (s.kind) {
        case 'call': {
          if (s.callee.kind !== 'story') break;
          const target = valueText(s.target, fields);
          if (target === null) break;
          const values = new Map<string, string>();
          for (const [name, e] of [...Object.entries(s.args), ...Object.entries(s.details)]) {
            const v = valueText(e, fields);
            if (v !== null) values.set(name, v);
          }
          found.push({
            id: s.id,
            target,
            procedure: s.callee.name,
            values,
            counts,
            together,
            mine: world.counts(s.id, around),
          });
          break;
        }
        case 'count': {
          const times = s.times.kind === 'wholeNumber' || s.times.kind === 'number';
          if (times)
            loops.push({
              id: s.id,
              times: (s.times as { value: number }).value,
              mine: world.counts(s.id, around),
            });
          visit(
            s.body,
            here,
            times ? [...counts, (s.times as { value: number }).value] : counts,
            together,
          );
          break;
        }
        case 'doTogether':
          visit(s.body, here, counts, true);
          break;
        case 'doInOrder':
        case 'while':
        case 'forEach':
        case 'eachTogether':
          visit(s.body, here, counts, together);
          break;
        case 'if':
          visit(s.then, here, counts, together);
          visit(s.else, here, counts, together);
          break;
        default:
          break;
      }
    }
  };
  for (const m of world.type.methods) visit(m.body, [m.id], [], false);
  for (const l of world.type.listeners) visit(l.body, [l.id], [], false);
  return found;
}

/**
 * Whether a call does what a `do` step says, by the rule a build is held to (6.4, 6.3). A step
 * inside a repeat (6.8) must be inside a count with the repeat's times (`within`).
 */
function matches(step: PlanStep, call: Found, world: ProgressWorld, within?: number): boolean {
  if (within !== undefined && !call.counts.includes(within)) return false;
  if (call.target !== step.actor || call.procedure !== step.action) return false;
  for (const d of step.details) {
    const v = call.values.get(d.name);
    if (v === undefined || !same(v, d.value)) return false;
  }
  const target = targetOf(step);
  if (target !== '' && ![...call.values.values()].includes(target)) return false;
  if (step.line !== '') {
    const words = world.lines.get(step.line);
    if (words === undefined || call.values.get('text') !== words) return false;
  }
  // The block's own settings a step left out are its object and words, filled by target and line.
  const cls = world.classOf(step.actor);
  const entry = cls ? findEntry(cls, step.action) : undefined;
  if (entry)
    for (const p of entry.params) {
      if (step.details.some((d) => d.name === p.name)) continue;
      if (p.name === 'text' && step.line !== '') continue;
      if (classOfType(p.type) !== null && target !== '') continue;
      return false;
    }
  if (step.repeat > 1 && !call.counts.includes(step.repeat)) return false;
  if (step.together && !call.together) return false;
  return true;
}

const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;

/** Whether an object starts as a `change` step says. */
function starts(step: PlanStep, world: ProgressWorld): boolean {
  const o = world.objects.find((x) => x.id === step.actor);
  const value = step.details.find((d) => d.name === step.action || d.name === 'value')?.value;
  if (!o || value === undefined) return false;
  const n = Number(value);
  switch (step.action) {
    case 'position': {
      const [x, y, z] = value.split(',').map((p) => Number(p));
      const at = o.transform.position;
      return [x, y, z].every(Number.isFinite) && near(at.x, x!) && near(at.y, y!) && near(at.z, z!);
    }
    case 'turn_degrees': {
      const half = (n * Math.PI) / 360;
      const r = o.transform.rotation;
      return Number.isFinite(n) && near(r.y, Math.sin(half)) && near(r.w, Math.cos(half));
    }
    case 'scale':
      return Number.isFinite(n) && near(o.transform.scale.x, n);
    case 'paint':
      return o.paint === value;
    case 'opacity':
      return Number.isFinite(n) && near(o.opacity ?? 1, n);
    case 'vehicle':
      return (o.vehicle ?? null) === (value === 'scene' ? null : value);
    default:
      return false;
  }
}

function listens(
  step: PlanStep,
  listeners: readonly ListenerDecl[],
  world: ProgressWorld,
): NodeId[] {
  return listeners
    .filter((l) => l.event === step.action && world.counts(l.id, []))
    .map((l) => l.id);
}

/**
 * Which steps are done, one flag a step. Each block, and each listener, ticks one step, in plan
 * order, so two steps that are the same need two blocks.
 */
export function stepsDone(steps: readonly PlanStep[], world: ProgressWorld): boolean[] {
  const loops: Loop[] = [];
  const mine = calls(world, loops).filter((c) => c.mine);
  const held = heldBy(steps);
  const used = new Set<NodeId>();
  const take = (ids: readonly NodeId[]): boolean => {
    const id = ids.find((i) => !used.has(i));
    if (id === undefined) return false;
    used.add(id);
    return true;
  };
  return steps.map((step, i) => {
    const holder = held[i];
    const within = holder === null || holder === undefined ? undefined : steps[holder]!.repeat;
    switch (step.kind) {
      case 'do':
        return take(mine.filter((c) => matches(step, c, world, within)).map((c) => c.id));
      case 'add':
        return world.objects.some(
          (o) => o.id === step.actor && typeof o.model === 'string' && o.model === step.action,
        );
      case 'change':
        return starts(step, world);
      case 'when':
        return take(listens(step, world.type.listeners, world));
      case 'stage':
        return world.staged;
      case 'repeat':
        // A count of the learner's with the repeat's times (6.8); each count ticks one repeat.
        return take(loops.filter((l) => l.mine && l.times === step.repeat).map((l) => l.id));
    }
  });
}
