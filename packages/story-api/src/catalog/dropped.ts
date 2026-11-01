/**
 * WP4.1: what StoryStage 2 doesn't take from Alice, and why. "Anything dropped or added is
 * listed": a test fails if a palette member is neither in the catalog nor here. The `.a3p`
 * import (WP9.2) reports each of these in plain words when a world uses one.
 */
import type { ApiClass } from './types.ts';

/** Where each of Alice's classes went. `null` means it has no StoryStage class. */
export const CLASS_MAP: Readonly<Record<string, ApiClass | null>> = {
  SThing: 'Thing',
  SScene: 'Scene',
  SGround: 'Ground',
  STurnable: 'Turnable',
  SMovableTurnable: 'MovableTurnable',
  SCamera: 'Camera',
  SJoint: 'Joint',
  SMarker: 'Marker',
  SCameraMarker: 'Marker',
  SThingMarker: 'Marker',
  STarget: 'Marker',
  SModel: 'Model',
  SJointedModel: 'JointedModel',
  SProp: 'Prop',
  STransport: 'Transport',
  SBiped: 'Biped',
  SQuadruped: 'Quadruped',
  SFlyer: 'Flyer',
  SSwimmer: 'Swimmer',
  SSlitherer: 'Slitherer',
  SBillboard: 'Billboard',
  STextModel: 'Text',
  // Shapes become built-in Props, so they appear in Backstage and on the storyboard (rule 5).
  SShape: 'Prop',
  SBox: 'Prop',
  SSphere: 'Prop',
  SCone: 'Prop',
  SCylinder: 'Prop',
  SDisc: 'Prop',
  STorus: 'Prop',
  SAxes: 'Prop',
  // Lighting belongs to the scene: `setFromAboveLightColor` and the Backdrops section.
  SSun: null,
  SVRUser: null,
  SVRHeadset: null,
  SVRHand: null,
};

export interface DroppedGroup {
  readonly why: string;
  /** `Class.member`, or `Class.*` for all of a class's members. */
  readonly members: readonly string[];
}

export const DROPPED: readonly DroppedGroup[] = [
  {
    why: 'Virtual reality isn’t in the first release. AR is its own work (WP21, WP22).',
    members: ['SVRUser.*', 'SVRHeadset.*', 'SCamera.getLeftHand', 'SCamera.getRightHand'],
  },
  {
    why: 'Shapes are Props now, so they use width, height and depth like every other model.',
    members: ['SCone.*', 'SCylinder.*', 'SDisc.*', 'SSphere.*', 'STorus.*'],
  },
  {
    why: 'Set by the stage for the device, or a second way to do the same thing. Filming uses the vertical viewing angle and shot types.',
    members: [
      'SCamera.getFarClippingPlaneDistance',
      'SCamera.setFarClippingPlaneDistance',
      'SCamera.getNearClippingPlaneDistance',
      'SCamera.setNearClippingPlaneDistance',
      'SCamera.getHorizontalViewingAngle',
      'SCamera.setHorizontalViewingAngle',
    ],
  },
  {
    why: 'The ground and the sky stay where they are.',
    members: ['SGround.setVehicle', 'SSun.setVehicle'],
  },
  {
    why: 'Aids for Alice’s own scene editor, not story blocks.',
    members: [
      'SJoint.isPivotVisible',
      'SJoint.setPivotVisible',
      'SMarker.getColorId',
      'SMarker.setColorId',
      'SThing.getVantagePoint',
    ],
  },
  {
    why: 'Java’s string editing, left over on Alice’s text model. `getValue` and `setValue` stay.',
    members: [
      'STextModel.append',
      'STextModel.charAt',
      'STextModel.delete',
      'STextModel.deleteCharAt',
      'STextModel.getLength',
      'STextModel.indexOf',
      'STextModel.insert',
      'STextModel.lastIndexOf',
      'STextModel.replace',
      'STextModel.setCharAt',
    ],
  },
  {
    why: 'Dragging objects while a film plays. Not in WP6.2, and it would change a film between takes.',
    members: ['SScene.addDefaultModelManipulation'],
  },
  {
    why: 'Not in WP6.2. View and occlusion tests run on every frame and haven’t been measured on the reference devices, so they stay out until a class needs them and they are.',
    members: [
      'SScene.addPointOfViewChangeListener',
      'SScene.addViewEnterListener',
      'SScene.addViewExitListener',
      'SScene.addOcclusionStartListener',
      'SScene.addOcclusionEndListener',
      'PointOfViewEvent.getEntity',
      'ViewEvent.getModel',
      'OcclusionEvent.getBackgroundModel',
      'OcclusionEvent.getForegroundModel',
    ],
  },
  {
    why: 'A handler gets the key itself, so it can compare it. `numberKeyPress` covers digits.',
    members: ['AbstractKeyEvent.isKey', 'KeyEvent.isDigit', 'KeyEvent.isLetter'],
  },
];

/** Alice's constants not taken across, by type. `Key` keeps a subset; see `ENUMS.Key`. */
export const DROPPED_VALUES: Readonly<Record<string, readonly string[] | 'rest'>> = {
  // Function keys, keypads, dead keys and input-method keys, which many keyboards and iPads lack.
  Key: 'rest',
  // "As often as possible" can't work with the time-slice budget (WP6.3); a timer has seconds.
  TimerFrequency: ['ASAP'],
  // Value types with no entry left to use them.
  Scale: ['IDENTITY'],
  VantagePoint: ['IDENTITY'],
};

/** Alice's joint getters become one function. `getLeftElbow` is `getJoint('leftLowerArm')`. */
export const JOINT_GETTERS = {
  SJoint: 'getJoint',
  'SJoint[]': 'getJointChain',
} as const;
