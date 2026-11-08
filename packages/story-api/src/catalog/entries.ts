/**
 * WP4.1, 4.2, 4.7: every procedure and function, with Alice's names and parameter names.
 *
 * The crosswalk fields come from `docs/spec/10-crosswalk.md`, section 3. Unreal names are from
 * general knowledge, as that section says, and aren't checked line by line.
 */
import { TIMED } from './details.ts';
import type {
  ApiClass,
  ApiEntry,
  FunctionEntry,
  ParamDef,
  Procedure,
  NumberRange,
  Runs,
  Task,
  TypeName,
} from './types.ts';

/** The Alice class behind each class that has a palette of its own. */
const ALICE: Partial<Record<ApiClass, string>> = {
  Thing: 'SThing',
  Scene: 'SScene',
  Ground: 'SGround',
  Turnable: 'STurnable',
  MovableTurnable: 'SMovableTurnable',
  Camera: 'SCamera',
  Joint: 'SJoint',
  Model: 'SModel',
  JointedModel: 'SJointedModel',
  Billboard: 'SBillboard',
  Text: 'STextModel',
  Flyer: 'SFlyer',
};

interface Options {
  readonly runs: Runs;
  readonly unreal: string;
  readonly bml?: string;
  readonly details?: readonly string[];
  readonly task?: Task;
  readonly alice?: readonly string[];
}

const param = (name: string, type: TypeName, range?: NumberRange): ParamDef =>
  range ? { name, type, range } : { name, type };

const fields = (on: ApiClass, name: string, params: readonly ParamDef[], o: Options) => ({
  on,
  name,
  params,
  details: o.details ?? [],
  runs: o.runs,
  task: o.task ?? '4.3',
  alice: o.alice ?? (o.task ? [] : [`${ALICE[on]}.${name}`]),
  ...(o.bml === undefined ? {} : { bml: o.bml }),
  unreal: o.unreal,
});

const proc = (on: ApiClass, name: string, params: readonly ParamDef[], o: Options): Procedure => ({
  kind: 'procedure',
  ...fields(on, name, params, o),
});

const func = (
  on: ApiClass,
  name: string,
  params: readonly ParamDef[],
  returns: TypeName,
  o: Options,
): FunctionEntry => ({ kind: 'function', returns, ...fields(on, name, params, o) });

const other = param('other', 'Thing');
const target = param('target', 'Thing');

const SET_ACTOR = 'Set Actor Location and Rotation, Timeline';
const MOVE_TO = 'Move Component To';
const LOOK_AT = 'Find Look at Rotation';
const ASK = 'A UI widget that waits for input';
const COMPONENT_BOUNDS = 'Get Component Bounds';
const SET_SCALE = 'Set Actor Scale 3D';
const MATERIAL = 'Dynamic material instance parameter';
const ATMOSPHERE = 'Sky Atmosphere and Directional Light settings';
const FOG = 'Exponential Height Fog';
const CINE_CAMERA = 'CineCamera with Sequencer camera cuts';
const RELATIVE = 'Get Actor Location, compared along an axis';

/** A test against one direction, with its "how far" twin. */
const direction = (word: string): readonly FunctionEntry[] => [
  func('Turnable', `getDistance${word}`, [other], 'Number', {
    details: ['asSeenBy'],
    runs: 'query:transform',
    unreal: RELATIVE,
  }),
  func('Turnable', `is${word}`, [other], 'Boolean', {
    details: ['asSeenBy'],
    runs: 'query:transform',
    unreal: RELATIVE,
  }),
];

/** Width, height and depth: get, set and resize. */
const dimension = (word: string): readonly ApiEntry[] => {
  const lower = word.toLowerCase();
  return [
    func('Model', `get${word}`, [], 'Number', { runs: 'query:size', unreal: COMPONENT_BOUNDS }),
    proc('Model', `set${word}`, [param(lower, 'Number', 'positive')], {
      details: [...TIMED, 'policy'],
      runs: 'command:setSize',
      unreal: SET_SCALE,
    }),
    proc('Model', `resize${word}`, [param('factor', 'Number', 'positive')], {
      details: [...TIMED, 'isVolumePreserved'],
      runs: 'command:resize',
      unreal: SET_SCALE,
    }),
  ];
};

/** Get and set for a colour of the scene. */
const sceneColor = (
  word: string,
  details: readonly string[],
  unreal: string,
): readonly ApiEntry[] => [
  func('Scene', `get${word}Color`, [], 'Color', { runs: 'query:sceneLook', unreal }),
  proc('Scene', `set${word}Color`, [param('color', 'Color')], {
    details,
    runs: word === 'Atmosphere' ? 'command:atmosphere' : 'command:light',
    unreal,
  }),
];

const paintAndOpacity = (on: 'Model' | 'Ground'): readonly ApiEntry[] => [
  func(on, 'getPaint', [], 'Paint', { runs: 'query:look', unreal: MATERIAL }),
  proc(on, 'setPaint', [param('paint', 'Paint')], {
    details: TIMED,
    runs: 'command:paint',
    unreal: MATERIAL,
    ...(on === 'Model' ? { alice: ['SModel.setPaint', 'SBillboard.setPaint'] } : {}),
  }),
  func(on, 'getOpacity', [], 'Number', { runs: 'query:look', unreal: MATERIAL }),
  proc(on, 'setOpacity', [param('opacity', 'Number', 'portion')], {
    details: TIMED,
    runs: 'command:opacity',
    unreal: MATERIAL,
  }),
];

const fromUser = (name: string, returns: TypeName): FunctionEntry =>
  func('Thing', name, [param('message', 'Text')], returns, { runs: 'needs:ask', unreal: ASK });

const BUBBLE = [
  'duration',
  'textScale',
  'textStyle',
  'fontType',
  'fontColor',
  'bubbleFillColor',
  'bubbleOutlineColor',
  'bubblePosition',
] as const;

const wings = (name: string): Procedure =>
  proc('Flyer', name, [], { details: TIMED, runs: 'command:pose', unreal: 'Play Montage' });

/** Alice's blocks and StoryStage's new ones (4.4–4.6, 4.10), most general class first. */
export const ENTRIES: readonly ApiEntry[] = [
  // Thing
  proc('Thing', 'delay', [param('duration', 'Number', 'positiveOrZero')], {
    runs: 'runtime',
    bml: 'wait',
    unreal: 'Delay',
  }),
  proc('Thing', 'playAudio', [param('audioSource', 'Audio')], {
    runs: 'needs:audio',
    unreal: 'Play Sound 2D',
  }),
  func('Thing', 'isCollidingWith', [other], 'Boolean', {
    runs: 'query:isColliding',
    unreal: 'Is Overlapping Actor',
  }),
  func('Thing', 'getVehicle', [], 'Thing', {
    runs: 'query:vehicle',
    unreal: 'Get Attach Parent',
  }),
  fromUser('getBooleanFromUser', 'Boolean'),
  fromUser('getStringFromUser', 'Text'),
  fromUser('getDoubleFromUser', 'Number'),
  fromUser('getIntegerFromUser', 'WholeNumber'),

  // Turnable
  proc('Turnable', 'turn', [param('direction', 'TurnDirection'), param('amount', 'Number')], {
    details: [...TIMED, 'asSeenBy'],
    runs: 'command:rotate',
    unreal: SET_ACTOR,
  }),
  proc('Turnable', 'roll', [param('direction', 'RollDirection'), param('amount', 'Number')], {
    details: [...TIMED, 'asSeenBy'],
    runs: 'command:rotate',
    unreal: SET_ACTOR,
  }),
  proc('Turnable', 'turnToFace', [target], {
    details: TIMED,
    runs: 'command:turnToFace',
    bml: 'gaze',
    unreal: LOOK_AT,
  }),
  proc('Turnable', 'orientToUpright', [], {
    details: [...TIMED, 'upAsSeenBy'],
    runs: 'command:orient',
    unreal: SET_ACTOR,
  }),
  proc('Turnable', 'pointAt', [target], {
    details: [...TIMED, 'upAsSeenBy'],
    runs: 'command:orient',
    bml: 'pointing',
    unreal: LOOK_AT,
  }),
  proc('Turnable', 'orientTo', [target], {
    details: TIMED,
    runs: 'command:orient',
    unreal: LOOK_AT,
  }),
  func('Turnable', 'isFacing', [other], 'Boolean', {
    runs: 'query:transform',
    unreal: 'Get Dot Product To',
  }),
  func('Turnable', 'getDistanceTo', [other], 'Number', {
    runs: 'query:distance',
    unreal: 'Get Distance To',
  }),
  ...['Above', 'Below', 'ToTheRightOf', 'ToTheLeftOf', 'InFrontOf', 'Behind'].flatMap(direction),

  // MovableTurnable
  proc(
    'MovableTurnable',
    'move',
    [param('direction', 'MoveDirection'), param('amount', 'Number')],
    { details: [...TIMED, 'asSeenBy'], runs: 'command:translate', unreal: SET_ACTOR },
  ),
  proc('MovableTurnable', 'moveToward', [target, param('amount', 'Number')], {
    details: TIMED,
    runs: 'command:moveToward',
    bml: 'locomotion',
    unreal: MOVE_TO,
  }),
  proc('MovableTurnable', 'moveAwayFrom', [target, param('amount', 'Number')], {
    details: TIMED,
    runs: 'command:moveToward',
    unreal: MOVE_TO,
  }),
  proc('MovableTurnable', 'moveTo', [target], {
    details: [...TIMED, 'pathStyle'],
    runs: 'command:moveTo',
    bml: 'locomotion',
    unreal: MOVE_TO,
  }),
  proc('MovableTurnable', 'moveAndOrientTo', [target], {
    details: [...TIMED, 'pathStyle'],
    runs: 'command:moveAndOrientTo',
    unreal: MOVE_TO,
  }),
  proc('MovableTurnable', 'place', [param('spatialRelation', 'SpatialRelation'), target], {
    details: [...TIMED, 'pathStyle', 'alongAxisOffset'],
    runs: 'command:place',
    unreal: 'Set Actor Location, from the target’s bounds',
  }),
  proc('MovableTurnable', 'setVehicle', [param('vehicle', 'Thing')], {
    runs: 'command:vehicle',
    unreal: 'Attach Actor To Actor',
    alice: ['SModel.setVehicle', 'SCamera.setVehicle', 'SMarker.setVehicle'],
  }),

  // Scene
  ...sceneColor('Atmosphere', TIMED, ATMOSPHERE),
  ...sceneColor('FromAboveLight', [], ATMOSPHERE),
  ...sceneColor('FromBelowLight', [], ATMOSPHERE),
  func('Scene', 'getFogDensity', [], 'Number', { runs: 'query:sceneLook', unreal: FOG }),
  proc('Scene', 'setFogDensity', [param('density', 'Number', 'portion')], {
    details: TIMED,
    runs: 'command:fog',
    unreal: FOG,
  }),
  // The three scene changes end the scene in the runtime, and the production's player makes the
  // transition (spec 18, 3.1; spec 03, 3.1).
  proc('Scene', 'goToScene', [param('scene', 'SceneId')], {
    task: '4.4',
    runs: 'runtime',
    unreal: 'Open Level, or level streaming',
  }),
  proc('Scene', 'fadeToBlack', [], {
    task: '4.4',
    details: ['duration'],
    runs: 'runtime',
    unreal: 'Fade track in Sequencer',
  }),
  proc('Scene', 'crossfade', [param('scene', 'SceneId')], {
    task: '4.4',
    details: ['duration'],
    runs: 'runtime',
    unreal: 'Shot blend in Sequencer',
  }),

  // Ground
  ...paintAndOpacity('Ground'),

  // Camera
  proc('Camera', 'moveAndOrientToAGoodVantagePointOf', [param('entity', 'Thing')], {
    details: TIMED,
    runs: 'command:moveAndOrientTo',
    unreal: CINE_CAMERA,
  }),
  func('Camera', 'getVerticalViewingAngle', [], 'Number', {
    runs: 'query:lens',
    unreal: 'CineCamera field of view',
  }),
  proc('Camera', 'setVerticalViewingAngle', [param('angle', 'Number')], {
    runs: 'command:lens',
    unreal: 'CineCamera field of view',
  }),
  proc('Camera', 'frameShot', [param('shot', 'ShotType'), param('targets', 'Thing[]')], {
    task: '4.10',
    details: TIMED,
    runs: 'command:shot',
    unreal: CINE_CAMERA,
  }),

  // Joint
  func('Joint', 'getWidth', [], 'Number', { runs: 'query:size', unreal: COMPONENT_BOUNDS }),
  func('Joint', 'getHeight', [], 'Number', { runs: 'query:size', unreal: COMPONENT_BOUNDS }),
  func('Joint', 'getDepth', [], 'Number', { runs: 'query:size', unreal: COMPONENT_BOUNDS }),

  // Model
  ...paintAndOpacity('Model'),
  ...['Width', 'Height', 'Depth'].flatMap(dimension),
  proc('Model', 'resize', [param('factor', 'Number', 'positive')], {
    details: TIMED,
    runs: 'command:resize',
    unreal: SET_SCALE,
  }),
  proc('Model', 'say', [param('text', 'Text')], {
    details: BUBBLE,
    runs: 'command:say',
    bml: 'speech',
    unreal: 'A UI widget; there is no built-in speech bubble',
  }),
  proc('Model', 'think', [param('text', 'Text')], {
    details: BUBBLE,
    runs: 'command:say',
    unreal: 'A UI widget; there is no built-in speech bubble',
  }),
  proc('Model', 'speakLine', [param('text', 'Text')], {
    task: '4.4',
    runs: 'needs:speech',
    bml: 'speech',
    unreal: 'Audio with lip-sync tools',
  }),

  // JointedModel
  func('JointedModel', 'getJoint', [param('joint', 'JointId')], 'Joint', {
    runs: 'runtime',
    unreal: 'Get Socket Transform',
    alice: [],
  }),
  func('JointedModel', 'getJointChain', [param('chain', 'JointChain')], 'Joint[]', {
    runs: 'runtime',
    unreal: 'Get Bone Names, filtered',
    alice: [],
  }),
  proc('JointedModel', 'straightenOutJoints', [], {
    details: TIMED,
    runs: 'command:pose',
    unreal: 'Reset the Control Rig pose',
  }),
  proc('JointedModel', 'playAnimation', [param('clip', 'AnimationClip')], {
    task: '4.6',
    runs: 'command:clip',
    unreal: 'Play Animation or Montage',
  }),

  // Billboard, Text, Flyer
  func('Billboard', 'getBackPaint', [], 'Paint', { runs: 'query:look', unreal: MATERIAL }),
  proc('Billboard', 'setBackPaint', [param('paint', 'Paint')], {
    details: TIMED,
    runs: 'command:backPaint',
    unreal: MATERIAL,
  }),
  func('Text', 'getValue', [], 'Text', { runs: 'query:look', unreal: 'Get Text' }),
  proc('Text', 'setValue', [param('text', 'Text')], { runs: 'command:text', unreal: 'Set Text' }),
  wings('foldWings'),
  wings('spreadWings'),

  // Biped: character actions (4.5) and faces (4.6)
  proc('Biped', 'walkTo', [target], {
    task: '4.5',
    runs: 'command:walk',
    bml: 'locomotion',
    unreal: 'AI MoveTo with a navigation mesh',
  }),
  proc('Biped', 'runTo', [target], {
    task: '4.5',
    runs: 'command:walk',
    bml: 'locomotion',
    unreal: 'AI MoveTo with a navigation mesh',
  }),
  proc('Biped', 'sitOn', [target], {
    task: '4.5',
    runs: 'command:posture',
    bml: 'posture',
    unreal: 'Montage with Attach To Component',
  }),
  proc('Biped', 'standUp', [], {
    task: '4.5',
    runs: 'command:posture',
    bml: 'posture',
    unreal: 'Play Montage',
  }),
  proc('Biped', 'lieDown', [], {
    task: '4.5',
    runs: 'command:posture',
    bml: 'posture',
    unreal: 'Play Montage',
  }),
  proc('Biped', 'fall', [], {
    task: '4.5',
    runs: 'command:posture',
    bml: 'posture',
    unreal: 'Play Montage',
  }),
  proc('Biped', 'touch', [target], {
    task: '4.5',
    runs: 'command:reach',
    unreal: 'Control Rig IK',
  }),
  proc('Biped', 'reachFor', [target], {
    task: '4.5',
    runs: 'command:reach',
    bml: 'pointing',
    unreal: 'Control Rig IK',
  }),
  proc('Biped', 'pickUp', [target], {
    task: '4.5',
    runs: 'command:pickUp',
    unreal: 'Control Rig IK with Attach To Component',
  }),
  proc('Biped', 'putDown', [target], {
    task: '4.5',
    runs: 'command:putDown',
    unreal: 'Detach From Actor',
  }),
  proc('Biped', 'enterFrom', [param('edge', 'SceneEdge')], {
    task: '4.5',
    runs: 'command:enter',
    unreal: 'Spawn Actor',
  }),
  proc('Biped', 'exitTo', [param('edge', 'SceneEdge')], {
    task: '4.5',
    runs: 'command:walk',
    unreal: 'Destroy Actor',
  }),
  proc('Biped', 'gesture', [param('gesture', 'Gesture')], {
    task: '4.6',
    runs: 'command:gesture',
    bml: 'gesture',
    unreal: 'Play Montage',
  }),
  proc('Biped', 'showExpression', [param('expression', 'Expression')], {
    task: '4.6',
    runs: 'command:expression',
    bml: 'faceLexeme',
    unreal: 'Morph targets or pose assets',
  }),
  proc('Biped', 'lookAt', [target], {
    task: '4.6',
    runs: 'command:lookAt',
    bml: 'gaze',
    unreal: 'Look At in Control Rig or an Animation Blueprint',
  }),
];

/**
 * What each `needs:` asks of the stage contract. The rest of WP4.3's needs are in the contract
 * now; these wait for their own work packages.
 */
export const STAGE_NEEDS: Readonly<Record<string, string>> = {
  audio: 'Play a sound at a scene time, for the export to mix (with WP11)',
  ask: 'Ask the learner for a value while a program runs (the runtime, not the stage)',
  speech: 'Speak a line with visemes (WP14)',
};

/** Changes to commands the contract already has, still to make. */
export const STAGE_CHANGES: readonly string[] = [];
