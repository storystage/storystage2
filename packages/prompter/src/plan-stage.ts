/**
 * Who is in the scene at each step of a plan (`docs/spec/04-prompter.md` sections 6.3 and 6.9):
 * the scene's objects with their class and their type in the code, and the models earlier steps
 * add, typed as `add_model` would type them.
 */
import type { TypeRef } from '@storystage/ast';
import type { ApiClass } from '@storystage/story-api';
import { objectType, ownMove, type OwnMove } from './own-moves.ts';
import type { PlanStep, PlanWorld } from './plans.ts';

export interface Stage {
  /** By name. Null for an object added earlier whose class isn't known. */
  readonly objects: Map<string, ApiClass | null>;
  /** Their types in the code, where the code is known. */
  readonly types: Map<string, TypeRef>;
}

/** The scene as it is, before any step. */
export function stageNow(world: PlanWorld): Stage {
  const types = new Map<string, TypeRef>();
  if (world.code)
    for (const name of world.objects.keys()) {
      const type = objectType(world.code.scene, name);
      if (type) types.set(name, type);
    }
  return { objects: new Map(world.objects), types };
}

/** Puts an `add` step's model on the stage. */
export function stageAdd(stage: Stage, step: PlanStep, world: PlanWorld): void {
  const made = world.code?.added(step.action) ?? null;
  stage.objects.set(step.actor, made?.cls ?? null);
  if (made) stage.types.set(step.actor, made.type);
}

/** The scene after `steps`' adds. */
export function stageAfter(steps: readonly PlanStep[], world: PlanWorld): Stage {
  const stage = stageNow(world);
  for (const step of steps)
    if (step.kind === 'add' && !stage.objects.has(step.actor) && world.isBackstageItem(step.action))
      stageAdd(stage, step, world);
  return stage;
}

/** The learner's procedure a `do` step names, or null. */
export function stepMove(step: PlanStep, stage: Stage, world: PlanWorld): OwnMove | null {
  if (step.kind !== 'do' || !world.code) return null;
  return ownMove(world.code.program, stage.types.get(step.actor) ?? null, step.action);
}

/** For each step, the learner's procedure it names, with the objects the steps before it add. */
export function stepMoves(steps: readonly PlanStep[], world: PlanWorld): (OwnMove | null)[] {
  const stage = stageNow(world);
  return steps.map((step) => {
    const move = stepMove(step, stage, world);
    if (step.kind === 'add' && !stage.objects.has(step.actor) && world.isBackstageItem(step.action))
      stageAdd(stage, step, world);
    return move;
  });
}
