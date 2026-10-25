/**
 * Which sketches each Backstage item gets, where their files go, and what they are called
 * (WP10.5; `docs/spec/17-backstage.md`, section 7).
 */
import type { BackstageItem, Facing } from '@storystage/backstage';
import { FACINGS } from '@storystage/backstage';
import { POSES, type Pose } from './pose.ts';

export interface PlannedSketch {
  readonly facing: Facing;
  /** null is standing, or the model's own shape for anything that isn't posed. */
  readonly pose: Pose | null;
  /** Relative to the Backstage folder, as in the manifest. */
  readonly file: string;
}

export const sketchFile = (id: string, facing: Facing, pose: Pose | null): string =>
  `sketches/${id}/${facing}${pose ? `-${pose}` : ''}.svg`;

/**
 * Backdrops get one hand-made sketch. Everything else gets the four facings; Cast members that
 * map onto the joint map also get each standard pose in each facing.
 */
export function sketchPlan(
  item: Pick<BackstageItem, 'id' | 'section'>,
  posable: boolean,
): PlannedSketch[] {
  if (item.section === 'backdrops')
    return [{ facing: 'front', pose: null, file: `sketches/${item.id}/backdrop.svg` }];
  const poses: (Pose | null)[] = item.section === 'cast' && posable ? [null, ...POSES] : [null];
  return poses.flatMap((pose) =>
    FACINGS.map((facing) => ({ facing, pose, file: sketchFile(item.id, facing, pose) })),
  );
}

const FACING_WORDS: Readonly<Record<Facing, string>> = {
  front: 'front',
  threeQuarter: 'three-quarter',
  side: 'side',
  back: 'back',
};
const POSE_WORDS: Readonly<Record<Pose, string>> = {
  walk: 'walking',
  point: 'pointing',
  sit: 'sitting',
};

/** The words screen readers hear for a sketch: "Robot, side, walking". */
export const sketchTitle = (name: string, facing: Facing, pose: Pose | null): string =>
  [name, FACING_WORDS[facing], pose ? POSE_WORDS[pose] : null].filter(Boolean).join(', ');
