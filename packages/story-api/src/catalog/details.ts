/**
 * WP4.1: the details (Alice's optional keyword arguments), with Alice's defaults as her source
 * sets them: `Duration.DEFAULT_VALUE`, `AnimationStyle.DEFAULT_VALUE` and so on.
 */
import type { DetailDef } from './types.ts';

export const DETAILS: Readonly<Record<string, DetailDef>> = {
  duration: { type: 'Number', default: 1, range: 'positiveOrZero' },
  animationStyle: { type: 'AnimationStyle', default: 'beginAndEndGently' },
  asSeenBy: { type: 'Thing', default: null, defaultMeans: 'the object itself' },
  pathStyle: { type: 'PathStyle', default: 'beeLine' },
  alongAxisOffset: { type: 'Number', default: 0 },
  upAsSeenBy: { type: 'Thing', default: null, defaultMeans: 'the scene' },
  isVolumePreserved: { type: 'Boolean', default: true },
  policy: { type: 'SetDimensionPolicy', default: 'preserveAspectRatio' },
  textScale: { type: 'Number', default: 1, range: 'positive' },
  textStyle: { type: 'TextStyle', default: 'plain' },
  fontType: { type: 'TextFont', default: 'default' },
  fontColor: { type: 'Color', default: 'black' },
  bubbleFillColor: { type: 'Color', default: 'white' },
  bubbleOutlineColor: { type: 'Color', default: 'white' },
  bubblePosition: { type: 'BubblePosition', default: 'automatic' },
  heldKeyPolicy: { type: 'HeldKeyPolicy', default: 'fireMultiple' },
  multipleEventPolicy: { type: 'MultipleEventPolicy', default: 'ignore' },
  setOfVisuals: { type: 'Thing[]', default: null, defaultMeans: 'every object' },
};

/** Alice accepts these but ignores them, so they aren't offered: `member.detail`. */
export const IGNORED_DETAILS: readonly string[] = [
  'SMovableTurnable.moveToward.asSeenBy',
  'SMovableTurnable.moveAwayFrom.asSeenBy',
];

/** The two details almost every procedure has. */
export const TIMED = ['duration', 'animationStyle'] as const;
