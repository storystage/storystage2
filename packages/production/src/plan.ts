/**
 * Format 1.6.0: a frame's agreed plan (spec 04 section 6.7). The studio keeps the plan the learner
 * agreed with the Prompter on its frame, as it was shown and as it was built, in the same step as
 * the build (one undo), so a teacher can see what the learner changed.
 */
import type { FrameId, FramePlan, Production } from './types.ts';
import { checkFramePlan } from './validate.ts';

/** Whether `v` is a plan the format keeps: exactly the shape and within `PLAN_LIMITS`. */
export const isFramePlan = (v: unknown): v is FramePlan => checkFramePlan(v, 'plan').length === 0;

/**
 * The production with `frame`'s plan set, or taken away with `null`. A pure change, for the
 * caller's own step: the build that agreed it, so the two undo together. A frame that isn't there
 * leaves the production as it was; a plan the format wouldn't keep is refused, as a file would
 * drop it.
 */
export function withFramePlan(p: Production, frame: FrameId, plan: FramePlan | null): Production {
  if (plan !== null && !isFramePlan(plan))
    throw new Error('withFramePlan: not a plan the format keeps.');
  if (!p.frames.some((f) => f.id === frame)) return p;
  return {
    ...p,
    frames: p.frames.map((f) => {
      if (f.id !== frame) return f;
      if (plan !== null) return { ...f, plan };
      const rest: { -readonly [K in keyof typeof f]?: (typeof f)[K] } = { ...f };
      delete rest.plan;
      return rest as typeof f;
    }),
  };
}
