/**
 * WP4.1: event kinds, the `event` of the AST's `listener` (spec 01). Alice's handlers receive an
 * event object and call accessors on it. Here they receive named values (spec 02, section 6), so
 * the accessors become `gives`.
 */
import type { EventDef, ParamDef, TypeName } from './types.ts';

const arg = (name: string, type: TypeName): ParamDef => ({ name, type });

const POLICY = ['multipleEventPolicy'];
const KEYS = ['heldKeyPolicy', 'multipleEventPolicy'];

const position = [
  { name: 'x', type: 'Number', alice: ['MouseClickEvent.getScreenDistanceFromLeft'] },
  { name: 'y', type: 'Number', alice: ['MouseClickEvent.getScreenDistanceFromBottom'] },
] as const;

const pair = [
  { name: 'a', type: 'Thing', alice: ['AbstractBinarySThingEvent.getSThingFromSetA'] },
  { name: 'b', type: 'Thing', alice: ['AbstractBinarySThingEvent.getSThingFromSetB'] },
] as const;

const sets = [arg('setA', 'Thing[]'), arg('setB', 'Thing[]')];
const OVERLAP = 'Actor overlap and hit events';

export const EVENTS: readonly EventDef[] = [
  {
    name: 'sceneStart',
    args: [],
    gives: [],
    details: [],
    from: 'runtime',
    alice: ['SScene.addSceneActivationListener', 'SScene.handleActiveChanged'],
    unreal: 'Event BeginPlay',
  },
  {
    name: 'clickOnScreen',
    args: [],
    gives: position,
    details: POLICY,
    from: 'click',
    alice: ['SScene.addMouseClickOnScreenListener'],
    unreal: 'Input actions',
  },
  {
    name: 'clickOnObject',
    args: [],
    gives: [
      { name: 'model', type: 'Model', alice: ['MouseClickOnObjectEvent.getModelAtMouseLocation'] },
      ...position,
    ],
    details: ['setOfVisuals', ...POLICY],
    from: 'click',
    alice: ['SScene.addMouseClickOnObjectListener'],
    unreal: 'OnClicked',
  },
  {
    name: 'keyPress',
    args: [],
    gives: [{ name: 'key', type: 'Key', alice: ['AbstractKeyEvent.getKey'] }],
    details: KEYS,
    from: 'key',
    alice: ['SScene.addKeyPressListener'],
    unreal: 'Input actions',
  },
  {
    name: 'arrowKeyPress',
    args: [],
    gives: [
      { name: 'moveDirection', type: 'MoveDirection', alice: ['ArrowKeyEvent.getMoveDirection'] },
      { name: 'turnDirection', type: 'TurnDirection', alice: ['ArrowKeyEvent.getTurnDirection'] },
    ],
    details: KEYS,
    from: 'key',
    alice: ['SScene.addArrowKeyPressListener'],
    unreal: 'Input actions',
  },
  {
    name: 'numberKeyPress',
    args: [],
    gives: [{ name: 'number', type: 'WholeNumber', alice: ['NumberKeyEvent.getNumber'] }],
    details: KEYS,
    from: 'key',
    alice: ['SScene.addNumberKeyPressListener'],
    unreal: 'Input actions',
  },
  {
    name: 'moveWithArrowKeys',
    args: [arg('object', 'MovableTurnable')],
    gives: [],
    details: [],
    from: 'key',
    alice: ['SScene.addObjectMoverFor'],
    unreal: 'Input actions with Add Movement Input',
  },
  {
    name: 'timer',
    args: [arg('seconds', 'Number')],
    gives: [{ name: 'seconds', type: 'Number', alice: ['TimeEvent.getTimeSinceLastFire'] }],
    details: POLICY,
    from: 'runtime',
    alice: ['SScene.addTimeListener'],
    unreal: 'Set Timer by Event',
  },
  {
    name: 'collisionStart',
    args: sets,
    gives: pair,
    details: POLICY,
    from: 'collisionStart',
    alice: ['SScene.addCollisionStartListener'],
    unreal: OVERLAP,
  },
  {
    name: 'collisionEnd',
    args: sets,
    gives: pair,
    details: POLICY,
    from: 'needs:collisionEnd',
    alice: ['SScene.addCollisionEndListener'],
    unreal: OVERLAP,
  },
  {
    name: 'proximityEnter',
    args: [...sets, arg('distance', 'Number')],
    gives: pair,
    details: POLICY,
    from: 'proximityEnter',
    alice: ['SScene.addProximityEnterListener'],
    unreal: OVERLAP,
  },
  {
    name: 'proximityExit',
    args: [...sets, arg('distance', 'Number')],
    gives: pair,
    details: POLICY,
    from: 'needs:proximityExit',
    alice: ['SScene.addProximityExitListener'],
    unreal: OVERLAP,
  },
];
