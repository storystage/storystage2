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
    func('Model', `get${word}`, [], 'Number', { runs: 'needs:size', unreal: COMPONENT_BOUNDS }),
    proc('Model', `set${word}`, [param(lower, 'Number', 'positive')], {
      details: [...TIMED, 'policy'],
      runs: 'needs:size',
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
  func('Scene', `get${word}Color`, [], 'Color', { runs: 'needs:sceneLook', unreal }),
  proc('Scene', `set${word}Color`, [param('color', 'Color')], {
    details,
    runs: 'needs:sceneLook',
    unreal,
  }),
];

const paintAndOpacity = (on: 'Model' | 'Ground'): readonly ApiEntry[] => [
  func(on, 'getPaint', [], 'Paint', { runs: 'needs:look', unreal: MATERIAL }),
  proc(on, 'setPaint', [param('paint', 'Paint')], {
    details: TIMED,
    runs: 'command:paint',
    unreal: MATERIAL,
    ...(on === 'Model' ? { alice: ['SModel.setPaint', 'SBillboard.setPaint'] } : {}),
  }),
  func(on, 'getOpacity', [], 'Number', { runs: 'needs:look', unreal: MATERIAL }),
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
  proc('Flyer', name, [], { details: TIMED, runs: 'needs:pose', unreal: 'Play Montage' });

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
    runs: 'needs:vehicle',
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
    runs: 'needs:orient',
    unreal: SET_ACTOR,
  }),
  proc('Turnable', 'pointAt', [target], {
    details: [...TIMED, 'upAsSeenBy'],
    runs: 'needs:orient',
    bml: 'pointing',
    unreal: LOOK_AT,
  }),
  proc('Turnable', 'orientTo', [target], {
    details: TIMED,
    runs: 'needs:orient',
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
    runs: 'needs:moveToward',
    bml: 'locomotion',
    unreal: MOVE_TO,
  }),
  proc('MovableTurnable', 'moveAwayFrom', [target, param('amount', 'Number')], {
    details: TIMED,
    runs: 'needs:moveToward',
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
    runs: 'needs:moveAndOrientTo',
    unreal: MOVE_TO,
  }),
  proc('MovableTurnable', 'place', [param('spatialRelation', 'SpatialRelation'), target], {
    details: [...TIMED, 'pathStyle', 'alongAxisOffset'],
    runs: 'needs:place',
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
  func('Scene', 'getFogDensity', [], 'Number', { runs: 'needs:sceneLook', unreal: FOG }),
  proc('Scene', 'setFogDensity', [param('density', 'Number', 'portion')], {
    details: TIMED,
    runs: 'needs:sceneLook',
    unreal: FOG,
  }),
  proc('Scene', 'goToScene', [param('scene', 'SceneId')], {
    task: '4.4',
    runs: 'needs:sceneChange',
    unreal: 'Open Level, or level streaming',
  }),
  proc('Scene', 'fadeToBlack', [], {
    task: '4.4',
    details: ['duration'],
    runs: 'needs:sceneChange',
    unreal: 'Fade track in Sequencer',
  }),
  proc('Scene', 'crossfade', [param('scene', 'SceneId')], {
    task: '4.4',
    details: ['duration'],
    runs: 'needs:sceneChange',
    unreal: 'Shot blend in Sequencer',
  }),

  // Ground
  ...paintAndOpacity('Ground'),

  // Camera
  proc('Camera', 'moveAndOrientToAGoodVantagePointOf', [param('entity', 'Thing')], {
    details: TIMED,
    runs: 'needs:moveAndOrientTo',
    unreal: CINE_CAMERA,
  }),
  func('Camera', 'getVerticalViewingAngle', [], 'Number', {
    runs: 'needs:cameraLens',
    unreal: 'CineCamera field of view',
  }),
  proc('Camera', 'setVerticalViewingAngle', [param('angle', 'Number')], {
    runs: 'needs:cameraLens',
    unreal: 'CineCamera field of view',
  }),
  proc('Camera', 'frameShot', [param('shot', 'ShotType'), param('targets', 'Thing[]')], {
    task: '4.10',
    details: TIMED,
    runs: 'command:shot',
    unreal: CINE_CAMERA,
  }),

  // Joint
  func('Joint', 'getWidth', [], 'Number', { runs: 'needs:size', unreal: COMPONENT_BOUNDS }),
  func('Joint', 'getHeight', [], 'Number', { runs: 'needs:size', unreal: COMPONENT_BOUNDS }),
  func('Joint', 'getDepth', [], 'Number', { runs: 'needs:size', unreal: COMPONENT_BOUNDS }),

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
    runs: 'needs:pose',
    unreal: 'Reset the Control Rig pose',
  }),
  proc('JointedModel', 'playAnimation', [param('clip', 'AnimationClip')], {
    task: '4.6',
    runs: 'needs:animation',
    unreal: 'Play Animation or Montage',
  }),

  // Billboard, Text, Flyer
  func('Billboard', 'getBackPaint', [], 'Paint', { runs: 'needs:look', unreal: MATERIAL }),
  proc('Billboard', 'setBackPaint', [param('paint', 'Paint')], {
    details: TIMED,
    runs: 'needs:look',
    unreal: MATERIAL,
  }),
  func('Text', 'getValue', [], 'Text', { runs: 'needs:look', unreal: 'Get Text' }),
  proc('Text', 'setValue', [param('text', 'Text')], { runs: 'needs:look', unreal: 'Set Text' }),
  wings('foldWings'),
  wings('spreadWings'),

  // Biped: character actions (4.5) and faces (4.6)
  proc('Biped', 'walkTo', [target], {
    task: '4.5',
    runs: 'needs:character',
    bml: 'locomotion',
    unreal: 'AI MoveTo with a navigation mesh',
  }),
  proc('Biped', 'runTo', [target], {
    task: '4.5',
    runs: 'needs:character',
    bml: 'locomotion',
    unreal: 'AI MoveTo with a navigation mesh',
  }),
  proc('Biped', 'sitOn', [target], {
    task: '4.5',
    runs: 'needs:character',
    bml: 'posture',
    unreal: 'Montage with Attach To Component',
  }),
  proc('Biped', 'standUp', [], {
    task: '4.5',
    runs: 'needs:character',
    bml: 'posture',
    unreal: 'Play Montage',
  }),
  proc('Biped', 'lieDown', [], {
    task: '4.5',
    runs: 'needs:character',
    bml: 'posture',
    unreal: 'Play Montage',
  }),
  proc('Biped', 'fall', [], {
    task: '4.5',
    runs: 'needs:character',
    bml: 'posture',
    unreal: 'Play Montage',
  }),
  proc('Biped', 'touch', [target], {
    task: '4.5',
    runs: 'needs:character',
    unreal: 'Control Rig IK',
  }),
  proc('Biped', 'reachFor', [target], {
    task: '4.5',
    runs: 'needs:character',
    bml: 'pointing',
    unreal: 'Control Rig IK',
  }),
  proc('Biped', 'pickUp', [target], {
    task: '4.5',
    runs: 'needs:character',
    unreal: 'Control Rig IK with Attach To Component',
  }),
  proc('Biped', 'putDown', [target], {
    task: '4.5',
    runs: 'needs:character',
    unreal: 'Detach From Actor',
  }),
  proc('Biped', 'enterFrom', [param('edge', 'SceneEdge')], {
    task: '4.5',
    runs: 'needs:character',
    unreal: 'Spawn Actor',
  }),
  proc('Biped', 'exitTo', [param('edge', 'SceneEdge')], {
    task: '4.5',
    runs: 'needs:character',
    unreal: 'Destroy Actor',
  }),
  proc('Biped', 'gesture', [param('gesture', 'Gesture')], {
    task: '4.6',
    runs: 'needs:animation',
    bml: 'gesture',
    unreal: 'Play Montage',
  }),
  proc('Biped', 'showExpression', [param('expression', 'Expression')], {
    task: '4.6',
    runs: 'needs:animation',
    bml: 'faceLexeme',
    unreal: 'Morph targets or pose assets',
  }),
  proc('Biped', 'lookAt', [target], {
    task: '4.6',
    runs: 'needs:animation',
    bml: 'gaze',
    unreal: 'Look At in Control Rig or an Animation Blueprint',
  }),
];

/** What each `needs:` asks of the stage contract. Empty once S3's contract work lands. */
export const STAGE_NEEDS: Readonly<Record<string, string>> = {
  size: 'Read and set a width, height or depth in metres, with `SetDimensionPolicy`',
  look: 'Read paint and opacity; set a billboard’s back paint and a text model’s words',
  sceneLook: 'Read and set the atmosphere colour, the two light colours and the fog density',
  orient: 'Orient to a target or to upright, with `upAsSeenBy`',
  moveToward: 'Move a distance towards or away from a target, worked out at the start',
  moveAndOrientTo: 'Take on a target’s position and orientation, and a good viewpoint on it',
  place: 'Place beside a target, using both bounding boxes and `alongAxisOffset`',
  vehicle: 'Read an object’s vehicle',
  pose: 'Straighten every joint; fold or spread wings',
  audio: 'Play a sound at a scene time, for the export to mix',
  ask: 'Ask the learner for a value while a program runs (the runtime, not the stage)',
  cameraLens: 'Read and set the camera’s vertical viewing angle',
  sceneChange: 'Fades and scene changes (WP8)',
  speech: 'Speak a line with visemes (WP14)',
  character: 'Navigation, posture and hand contact (WP5b)',
  animation: 'Clips, gestures, expressions and head turning (WP5b)',
  collisionEnd: 'The stage event for two objects no longer touching',
  proximityExit: 'The stage event for two objects moving apart',
};

/** Changes to commands the contract already has. */
export const STAGE_CHANGES: readonly string[] = [
  '`moveTo`, `turnToFace` and `shot` take a joint or a marker as a target, not only an object',
  '`paint` animates over its duration, as Alice’s does; the contract says it is instant',
  '`say` carries the bubble details: position, colours, font, style and scale',
  '`moveTo` carries `pathStyle`',
  '`resize` carries `isVolumePreserved`',
];
