/**
 * `getJoint` and `getJointChain` (spec 02 section 5, spec 18 section 1): the runtime's own
 * functions, run through `serve` with the Story API's blocks using what they give back.
 */
import {
  nodeId,
  type Args,
  type Expression,
  type FieldDecl,
  type NodeId,
  type Program,
  type Statement,
} from '@storystage/ast';
import { IDENTITY, STORY_LIBRARY, micros, type StageQueryResult } from '@storystage/story-api';
import { describe, expect, it } from 'vitest';
import { RUNTIME_PROTOCOL, inMemoryPorts, type FromRuntime, type ToRuntime } from './messages.ts';
import { serve, type Timers } from './serve.ts';

let counter = 0;
const id = (): NodeId => nodeId(`j${(counter++).toString(36).padStart(5, '0')}`);

const field = (name: string, type: string): FieldDecl => ({
  id: nodeId(`${name}fld`.padEnd(6, 'x')),
  kind: 'field',
  name,
  type: { kind: 'story', name: type },
  initial: null,
});
const PENGUIN = field('penguin', 'Flyer');
const CAT = field('cat', 'Quadruped');

const self = (): Expression => ({ id: id(), kind: 'this' });
const of = (f: FieldDecl): Expression => ({
  id: id(),
  kind: 'fieldRef',
  target: self(),
  field: f.id,
});
const choice = (type: string, value: string): Expression => ({
  id: id(),
  kind: 'enum',
  type,
  value,
});
const num = (value: number): Expression => ({ id: id(), kind: 'number', value });

const fn = (target: Expression, name: string, args: Args): Expression => ({
  id: id(),
  kind: 'functionCall',
  target,
  callee: { kind: 'story', name },
  args,
  details: {},
});
const getJoint = (who: FieldDecl, joint: string) =>
  fn(of(who), 'getJoint', { joint: choice('JointId', joint) });
const getJointChain = (who: FieldDecl, chain: string) =>
  fn(of(who), 'getJointChain', { chain: choice('JointChain', chain) });

/** `target.turn(left, turns)` in half a second. */
const turn = (target: Expression, turns: number): Statement => ({
  id: id(),
  kind: 'call',
  target,
  callee: { kind: 'story', name: 'turn' },
  args: { direction: choice('TurnDirection', 'left'), amount: num(turns) },
  details: { duration: num(0.5) },
});

const MAIN = nodeId('mainmt');
const program = (body: readonly Statement[]): Program => ({
  schemaVersion: '1.0.0',
  types: [
    {
      id: nodeId('scenet'),
      kind: 'type',
      name: 'Scene1',
      extends: { kind: 'story', name: 'Scene' },
      fields: [PENGUIN, CAT],
      methods: [
        { id: MAIN, kind: 'method', name: 'myFirstMethod', returns: null, params: [], body },
      ],
      listeners: [],
    },
  ],
});

/** Runs a program for a second on the Story API's blocks, answering its questions. */
async function run(p: Program, answer: (query: unknown) => StageQueryResult = () => fail()) {
  const { main, worker } = inMemoryPorts();
  const heard: FromRuntime[] = [];
  const settle = async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  };
  main.listen((m) => {
    heard.push(m);
    if (m.type === 'ask') main.post({ type: 'answer', id: m.id, result: answer(m.query) });
  });
  const timers: Timers = { now: () => 0, every: () => () => undefined };
  serve(worker, STORY_LIBRARY, timers);
  const send = async (m: ToRuntime) => {
    main.post(m);
    await settle();
  };
  await settle();
  await send({
    type: 'load',
    protocol: RUNTIME_PROTOCOL,
    program: p,
    scene: { backdrop: {}, objects: [], camera: { transform: IDENTITY }, markers: [] },
    entry: MAIN,
    seed: 1,
    disabled: [],
    scenes: ['s1'],
  });
  await send({ type: 'start', mode: { kind: 'fixed' } });
  await send({ type: 'advance', until: micros(2) });
  return {
    asked: heard.flatMap((m) => (m.type === 'ask' ? [m.query] : [])),
    errors: heard.flatMap((m) => (m.type === 'error' ? [m.error] : [])),
    joints: heard.flatMap((m) =>
      m.type === 'commands'
        ? m.commands.flatMap((c) =>
            c.kind === 'joint' ? [`${c.start / 1_000_000}s ${c.object} ${c.joint} ${c.turns}`] : [],
          )
        : [],
    ),
  };
}
const fail = (): never => {
  throw new Error('nothing should be asked');
};

describe('getJoint', () => {
  it('gives a joint that blocks can turn, without asking the stage', async () => {
    const { joints, asked, errors } = await run(program([turn(getJoint(PENGUIN, 'head'), 0.25)]));
    expect(errors).toEqual([]);
    expect(asked).toEqual([]);
    expect(joints).toEqual(['0s penguin head 0.25']);
  });

  it('refuses something that is not a joint name', async () => {
    const wrong = fn(of(PENGUIN), 'getJoint', { joint: choice('JointChain', 'neck') });
    const { errors } = await run(program([turn(wrong, 0.25)]));
    expect(errors).toMatchObject([{ code: 'bad_value', node: wrong.id }]);
  });

  it('refuses a joint of something that is not an object', async () => {
    const wrong = fn(num(3), 'getJoint', { joint: choice('JointId', 'head') });
    const { errors } = await run(program([turn(wrong, 0.25)]));
    expect(errors).toMatchObject([{ code: 'bad_value', node: wrong.id }]);
  });
});

describe('getJointChain', () => {
  const chain = getJointChain(CAT, 'tail');
  const loop = (items: Expression): Statement => {
    const item = {
      id: id(),
      kind: 'loopItem' as const,
      name: 'joint',
      type: { kind: 'story' as const, name: 'Joint' },
    };
    return {
      id: id(),
      kind: 'forEach',
      item,
      items,
      body: [turn({ id: id(), kind: 'variableRef', variable: item.id }, 0.1)],
    };
  };

  it("asks the stage for the chain's joints, root first, and gives each as a joint", async () => {
    const { asked, joints, errors } = await run(program([loop(chain)]), () => ({
      kind: 'jointChain',
      value: ['tail1', 'tail2'] as never,
    }));
    expect(errors).toEqual([]);
    expect(asked).toEqual([{ kind: 'jointChain', object: 'cat', chain: 'tail', at: 0 }]);
    expect(joints).toEqual(['0s cat tail1 0.1', '0.5s cat tail2 0.1']);
  });

  it('gives an empty list for a model with no such joints', async () => {
    const { joints, errors } = await run(program([loop(chain)]), () => ({
      kind: 'jointChain',
      value: [],
    }));
    expect(errors).toEqual([]);
    expect(joints).toEqual([]);
  });

  it('refuses a chain that is not neck or tail', async () => {
    const wrong = fn(of(CAT), 'getJointChain', { chain: choice('JointChain', 'wing') });
    const { errors, asked } = await run(program([loop(wrong)]));
    expect(asked).toEqual([]);
    expect(errors).toMatchObject([{ code: 'bad_value', node: wrong.id }]);
  });

  it('stops with a protocol error if the stage answers another question', async () => {
    const { errors } = await run(program([loop(chain)]), () => ({ kind: 'distance', value: 1 }));
    expect(errors).toMatchObject([{ code: 'protocol', node: chain.id }]);
  });
});
