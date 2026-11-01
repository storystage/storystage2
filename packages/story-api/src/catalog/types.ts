/**
 * WP4.2: the shape of the Story API metadata. `docs/spec/02-story-api.md` is the readable form;
 * its tables are generated from this data, so the two can't disagree.
 *
 * Owner: S6. Blocks, Tiles, the Prompter, the `.a3p` import and the program check all read it.
 * The display words are kept apart, in `strings/en-GB.json`, so they can be translated.
 */
import type { StageCommandKind, StageEvent, StageQuery } from '../stage-commands.ts';
import { SHOT_TYPES, ANIMATION_STYLES, type StoryClass } from '../vocabulary.ts';

// ---- Classes ---------------------------------------------------------------------------------

/** Classes nothing is made from directly. They hold what several classes share. */
export const ABSTRACT_CLASSES = [
  'Thing',
  'Turnable',
  'MovableTurnable',
  'Model',
  'JointedModel',
] as const;
export type AbstractClass = (typeof ABSTRACT_CLASSES)[number];

/** Not gallery classes, but a program can hold one and act on it. */
export const PART_CLASSES = ['Joint', 'Marker'] as const;
export type PartClass = (typeof PART_CLASSES)[number];

export type ApiClass = StoryClass | AbstractClass | PartClass;

/** Every class's parent. A class has its own entries and those of its parents. */
export const CLASS_PARENTS: Readonly<Record<ApiClass, ApiClass | null>> = {
  Thing: null,
  Scene: 'Thing',
  Ground: 'Thing',
  Turnable: 'Thing',
  Joint: 'Turnable',
  MovableTurnable: 'Turnable',
  Camera: 'MovableTurnable',
  Marker: 'MovableTurnable',
  Model: 'MovableTurnable',
  Billboard: 'Model',
  Text: 'Model',
  JointedModel: 'Model',
  Prop: 'JointedModel',
  Transport: 'JointedModel',
  Biped: 'JointedModel',
  Quadruped: 'JointedModel',
  Flyer: 'JointedModel',
  Swimmer: 'JointedModel',
  Slitherer: 'JointedModel',
};

// ---- Value types -----------------------------------------------------------------------------

export const BASIC_TYPES = ['Number', 'WholeNumber', 'Text', 'Boolean'] as const;
export type BasicType = (typeof BASIC_TYPES)[number];

/**
 * Values that name something outside the program. `Paint` is a `Color`, a `#rrggbb` colour or a
 * Backstage surface; `JointId` is a joint from the joint map; `SceneId` is a production's scene;
 * `Audio` and `AnimationClip` are a production's sound or a model's clip.
 */
export const REFERENCE_TYPES = ['Paint', 'Audio', 'JointId', 'SceneId', 'AnimationClip'] as const;
export type ReferenceType = (typeof REFERENCE_TYPES)[number];

/** Enumerations, with Alice's constants in camel case. Added ones are in `ADDED_ENUMS`. */
export const ENUMS = {
  AnimationStyle: ANIMATION_STYLES,
  BubblePosition: ['automatic', 'left', 'center', 'right'],
  Color: [
    'black',
    'blue',
    'cyan',
    'darkGray',
    'gray',
    'green',
    'lightGray',
    'magenta',
    'orange',
    'pink',
    'red',
    'white',
    'yellow',
    'lightBlue',
    'darkBlue',
    'purple',
    'brown',
  ],
  HeldKeyPolicy: ['fireMultiple', 'fireOnceOnPress', 'fireOnceOnRelease'],
  MoveDirection: ['left', 'right', 'up', 'down', 'forward', 'backward'],
  MultipleEventPolicy: ['enqueue', 'ignore', 'combine'],
  PathStyle: ['beeLine', 'smooth'],
  RollDirection: ['left', 'right'],
  SetDimensionPolicy: ['preserveVolume', 'preserveAspectRatio', 'preserveNothing'],
  SpatialRelation: ['leftOf', 'rightOf', 'above', 'below', 'inFrontOf', 'behind'],
  TextFont: ['default', 'serif', 'sansSerif', 'monospaced'],
  TextStyle: ['plain', 'bold', 'italic'],
  TurnDirection: ['left', 'right', 'forward', 'backward'],
  Key: [
    ...'abcdefghijklmnopqrstuvwxyz',
    ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `digit${n}`),
    'left',
    'right',
    'up',
    'down',
    'space',
    'enter',
    'tab',
    'backSpace',
    'escape',
    'shift',
    'control',
    'alt',
    'comma',
    'period',
    'minus',
    'equals',
    'slash',
    'semicolon',
    'quote',
  ],
  // Not from Alice.
  ShotType: SHOT_TYPES,
  Gesture: ['wave', 'nod', 'shrug', 'clap', 'point'],
  Expression: ['happy', 'sad', 'angry', 'surprised', 'relaxed', 'blink'],
  SceneEdge: ['left', 'right', 'back', 'front'],
  JointChain: ['neck', 'tail'],
} as const satisfies Readonly<Record<string, readonly string[]>>;
export type EnumName = keyof typeof ENUMS;

/** Enumerations StoryStage adds; every other one comes from Alice. */
export const ADDED_ENUMS: readonly EnumName[] = [
  'ShotType',
  'Gesture',
  'Expression',
  'SceneEdge',
  'JointChain',
];

/**
 * A class as a type. `Text` is already the type of words (spec 01), so a variable holding the
 * `Text` class's 3D text is a `TextModel`.
 */
export type ClassType = Exclude<ApiClass, 'Text'> | 'TextModel';

type OneValue = BasicType | ReferenceType | EnumName | ClassType;
/** A type a parameter takes or a function returns. `[]` is a list. */
export type TypeName = OneValue | `${OneValue}[]`;

// ---- Entries ---------------------------------------------------------------------------------

/**
 * What runs an entry: a stage command or query from the contract (`stage-commands.ts`), the
 * runtime on its own, or `needs:`, something the contract doesn't have yet (`STAGE_NEEDS`).
 */
export type Runs =
  `command:${StageCommandKind}` | `query:${StageQuery['kind']}` | `needs:${string}` | 'runtime';

/** Alice's limits on a number: 0 to 1, above zero, or zero and above. */
export type NumberRange = 'portion' | 'positive' | 'positiveOrZero';

export interface ParamDef {
  readonly name: string;
  readonly type: TypeName;
  readonly range?: NumberRange;
}

export interface DetailDef {
  readonly type: TypeName;
  /** `null` when it depends on the block; `defaultMeans` says what it is. */
  readonly default: number | boolean | string | null;
  readonly defaultMeans?: string;
  readonly range?: NumberRange;
}

/** Workplan tasks that implement entries. 4.3 is Alice's own; the others are additions. */
export type Task = '4.3' | '4.4' | '4.5' | '4.6' | '4.10';

export interface EntryBase {
  readonly on: ApiClass;
  readonly name: string;
  readonly params: readonly ParamDef[];
  /** Names in `DETAILS`. */
  readonly details: readonly string[];
  readonly runs: Runs;
  readonly task: Task;
  /** The palette members (`palette.json`) this entry replaces: `SMovableTurnable.move`. */
  readonly alice: readonly string[];
  /** WP4.7: the BML 1.0 behaviour, where there is one. */
  readonly bml?: string;
  /** WP4.7: the Unreal Engine concept, the "under the hood" name. */
  readonly unreal: string;
}

export interface Procedure extends EntryBase {
  readonly kind: 'procedure';
}

export interface FunctionEntry extends EntryBase {
  readonly kind: 'function';
  readonly returns: TypeName;
}

export type ApiEntry = Procedure | FunctionEntry;

/** A value an event gives its handler, and the Alice accessors it replaces. */
export interface EventValue extends ParamDef {
  readonly alice?: readonly string[];
}

export interface EventDef {
  readonly name: string;
  /** What the listener needs: which objects, how many seconds. */
  readonly args: readonly ParamDef[];
  /** What the handler receives. */
  readonly gives: readonly EventValue[];
  readonly details: readonly string[];
  /** The stage event that fires it, or what the contract doesn't have yet. */
  readonly from: StageEvent['kind'] | 'runtime' | `needs:${string}`;
  readonly alice: readonly string[];
  readonly unreal: string;
}
