/**
 * Spec 14, section 2.1: the blocks an object offers, in two tabs and Alice's categories, with
 * the learner's own procedures and functions first. Both editors draw their palette from this.
 */
import { copyNode, nodeId } from '@storystage/ast';
import type { Callee, Expression, NodeId, Program } from '@storystage/ast';
import { entriesOf } from '../catalog/catalog.ts';
import { newCall } from './build.ts';
import { describer, word, type WordsOptions } from './words.ts';

export const PALETTE_TABS = ['actions', 'questions'] as const;
export type PaletteTab = (typeof PALETTE_TABS)[number];

export interface Category {
  readonly tab: PaletteTab;
  /** The key of its words, `category.<key>`. */
  readonly key: string;
  readonly blocks: readonly string[];
}

const where = ['isAbove', 'isBelow', 'isToTheRightOf', 'isToTheLeftOf', 'isInFrontOf', 'isBehind'];
const distances = where.map((n) => `getDistance${n.slice(2)}`);

/** Alice's methods-panel categories, then StoryStage's, in the order the palette shows them. */
export const CATEGORIES: readonly Category[] = [
  { tab: 'actions', key: 'sayThink', blocks: ['say', 'think', 'speakLine'] },
  {
    tab: 'actions',
    key: 'position',
    blocks: ['move', 'moveToward', 'moveAwayFrom', 'moveTo', 'place'],
  },
  {
    tab: 'actions',
    key: 'orientation',
    blocks: ['turn', 'roll', 'turnToFace', 'orientTo', 'orientToUpright', 'pointAt'],
  },
  {
    tab: 'actions',
    key: 'positionAndOrientation',
    blocks: ['moveAndOrientTo', 'moveAndOrientToAGoodVantagePointOf'],
  },
  {
    tab: 'actions',
    key: 'size',
    blocks: [
      'setWidth',
      'setHeight',
      'setDepth',
      'resize',
      'resizeWidth',
      'resizeHeight',
      'resizeDepth',
    ],
  },
  { tab: 'actions', key: 'appearance', blocks: ['setPaint', 'setBackPaint', 'setOpacity'] },
  { tab: 'actions', key: 'rideOn', blocks: ['setVehicle'] },
  { tab: 'actions', key: 'timing', blocks: ['delay'] },
  { tab: 'actions', key: 'sound', blocks: ['playAudio'] },
  {
    tab: 'actions',
    key: 'skyAndLight',
    blocks: [
      'setAtmosphereColor',
      'setFromAboveLightColor',
      'setFromBelowLightColor',
      'setFogDensity',
    ],
  },
  { tab: 'actions', key: 'camera', blocks: ['setVerticalViewingAngle', 'frameShot'] },
  { tab: 'actions', key: 'words', blocks: ['setValue'] },
  { tab: 'actions', key: 'scenes', blocks: ['goToScene', 'fadeToBlack', 'crossfade'] },
  {
    tab: 'actions',
    key: 'body',
    blocks: [
      'straightenOutJoints',
      'foldWings',
      'spreadWings',
      'playAnimation',
      'gesture',
      'showExpression',
      'lookAt',
    ],
  },
  {
    tab: 'actions',
    key: 'movingAbout',
    blocks: ['walkTo', 'runTo', 'sitOn', 'standUp', 'lieDown', 'fall', 'enterFrom', 'exitTo'],
  },
  { tab: 'actions', key: 'hands', blocks: ['touch', 'reachFor', 'pickUp', 'putDown'] },
  { tab: 'questions', key: 'joints', blocks: ['getJoint', 'getJointChain'] },
  { tab: 'questions', key: 'size', blocks: ['getWidth', 'getHeight', 'getDepth'] },
  {
    tab: 'questions',
    key: 'appearance',
    blocks: ['getPaint', 'getBackPaint', 'getOpacity', 'getValue'],
  },
  {
    tab: 'questions',
    key: 'whereThingsAre',
    blocks: ['getDistanceTo', 'isFacing', 'isCollidingWith', 'getVehicle', ...where, ...distances],
  },
  {
    tab: 'questions',
    key: 'askTheAudience',
    blocks: ['getBooleanFromUser', 'getStringFromUser', 'getDoubleFromUser', 'getIntegerFromUser'],
  },
  {
    tab: 'questions',
    key: 'skyAndLight',
    blocks: [
      'getAtmosphereColor',
      'getFromAboveLightColor',
      'getFromBelowLightColor',
      'getFogDensity',
    ],
  },
  { tab: 'questions', key: 'camera', blocks: ['getVerticalViewingAngle'] },
];

export interface PaletteItem {
  readonly callee: Callee;
  readonly tab: PaletteTab;
  /** The block's words with `???` for every value: "cat move ??? ???". */
  readonly words: string;
}

export interface PaletteGroup {
  /** `yours` for the learner's own, otherwise a category key. */
  readonly key: string;
  readonly words: string;
  readonly items: readonly PaletteItem[];
}

/** Ids for nodes made only to be read, never put in the program. */
const scratch = () => {
  let n = 0;
  return () => nodeId(`zz${(n++).toString(36).padStart(4, '0')}`);
};

/**
 * The palette for `target` (a scene object, a joint, or `this`), as seen from a method of the
 * type `self`, on one tab.
 */
export function palette(
  program: Program,
  target: Expression,
  self: NodeId,
  tab: PaletteTab,
  options: WordsOptions = {},
): readonly PaletteGroup[] {
  const describe = describer(program, options);
  const { types } = describe;
  const selfType = { kind: 'user', type: self } as const;
  const targetType = types.typeOf(target, selfType);
  const cls = types.classOf(targetType);
  const mint = scratch();
  const item = (callee: Callee, isFunction: boolean): PaletteItem => {
    const node = newCall(program, copyNode(target, mint), callee, isFunction, mint, types, self);
    return { callee, tab, words: describe.inside(node, self) };
  };

  const groups: PaletteGroup[] = [];
  const own =
    targetType?.kind === 'user' ? types.parentsOf(targetType.type).flatMap((t) => t.methods) : [];
  const yours = own
    .filter((m) => (m.returns === null) === (tab === 'actions'))
    .map((m) => item({ kind: 'user', method: m.id }, m.returns !== null));
  if (yours.length > 0) groups.push({ key: 'yours', words: word('category.yours'), items: yours });

  if (cls) {
    const offered = new Set(entriesOf(cls).map((e) => e.name));
    for (const category of CATEGORIES.filter((c) => c.tab === tab)) {
      const items = category.blocks
        .filter((name) => offered.has(name))
        .map((name) => item({ kind: 'story', name }, tab === 'questions'));
      if (items.length > 0)
        groups.push({ key: category.key, words: word(`category.${category.key}`), items });
    }
  }
  return groups;
}
