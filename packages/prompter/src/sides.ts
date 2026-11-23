/**
 * A plan step's side (`docs/spec/04-prompter.md` section 6.3): words that put a model on one side
 * of the picture must agree with the position the step gives it. The owner's rerun of 22 Nov 2026
 * showed a learner "Add a fox on the left" for a fox the step put on the right, and the learner
 * agrees to the words.
 *
 * It reads only plain phrases: a side of the picture, not of another object or of a row. And only
 * where the side is sure: the start camera in the middle with no turn, whose picture has +x on
 * the left (section 2.5).
 */
import type { SceneSetup } from '@storystage/story-api';
import type { PlanProblem, PlanStep } from './plans.ts';

const PICTURE = '(?: of (?:the |your )?(?:picture|screen|scene|stage|grass))';
const SIDE = new RegExp(
  [
    `\\bon the (left|right)(?: side)?${PICTURE}?(?=[.,;:!?]|$)`,
    `\\bto the (left|right)(?: side)?${PICTURE}(?=[.,;:!?]|$)`,
    '\\bto the (left|right) side(?=[.,;:!?]|$)',
  ].join('|'),
  'gi',
);

/** The one side of the picture some words name, or null for none or both. */
export function sideNamed(words: string): 'left' | 'right' | null {
  const sides = new Set(
    [...words.matchAll(SIDE)].map((m) => (m[1] ?? m[2] ?? m[3])!.toLowerCase()),
  );
  if (sides.size !== 1) return null;
  return sides.has('left') ? 'left' : 'right';
}

/** The x an add or a move of where something starts gives it, or null. */
function startX(step: PlanStep): number | null {
  if (step.kind !== 'add' && !(step.kind === 'change' && step.action === 'position')) return null;
  if (step.actor === 'camera') return null;
  const given = step.details.find(
    (d) => d.name === 'position' || (step.kind === 'change' && d.name === 'value'),
  );
  const parts = given?.value.split(',');
  if (parts?.length !== 3 || parts[0]!.trim() === '') return null;
  const x = Number(parts[0]);
  return Number.isFinite(x) ? x : null;
}

/** Steps whose words name the other side from their position, for Claude to put right. */
export function sideProblems(
  steps: readonly PlanStep[],
  camera: SceneSetup['camera'] | undefined,
): PlanProblem[] {
  if (!camera) return [];
  const { position, rotation } = camera.transform;
  if (position.x !== 0 || rotation.x !== 0 || rotation.y !== 0 || rotation.z !== 0) return [];
  if (steps.some((s) => s.kind === 'change' && s.actor === 'camera')) return [];
  return steps.flatMap((step, i) => {
    const x = startX(step);
    const said = sideNamed(step.words);
    if (x === null || x === 0 || said === null) return [];
    const placed = x > 0 ? 'left' : 'right';
    return said === placed
      ? []
      : [
          {
            step: i + 1,
            message: `Its words say ${said}, but x ${x} is on the ${placed} of the picture. Make the words and the position agree.`,
          },
        ];
  });
}
