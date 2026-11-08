/**
 * A small scene for the editing model's tests: a cat (a biped), a chair (a prop), a camera, a
 * whole-number score, and rex, of the learner's own class `Pet` with a `hop` procedure. Not
 * exported from the package.
 */
import { nodeId } from '@storystage/ast';
import type { Expression, NodeId, Program, Statement, TypeRef } from '@storystage/ast';

export const ID = {
  scene: nodeId('scenet'),
  camera: nodeId('camfld'),
  cat: nodeId('catfld'),
  chair: nodeId('chairf'),
  score: nodeId('scorfd'),
  rex: nodeId('rexfld'),
  pet: nodeId('pettyp'),
  hop: nodeId('hopmth'),
  height: nodeId('hopprm'),
  main: nodeId('mainmt'),
  say: nodeId('saystm'),
  together: nodeId('togeth'),
  move: nodeId('movest'),
  direction: nodeId('movedr'),
  amount: nodeId('moveam'),
} as const;

let next = 0;
/** Fresh ids for nodes the tests make. */
export const mint = (): NodeId => nodeId(`t${(next++).toString(36).padStart(5, '0')}`);

const story = (name: string): TypeRef => ({ kind: 'story', name });
export const self = (): Expression => ({ id: mint(), kind: 'this' });
export const field = (f: NodeId): Expression => ({
  id: mint(),
  kind: 'fieldRef',
  target: self(),
  field: f,
});
export const num = (value: number): Expression => ({ id: mint(), kind: 'number', value });
export const text = (value: string): Expression => ({ id: mint(), kind: 'text', value });
export const none = (): Expression => ({ id: mint(), kind: 'none' });
export const choice = (type: string, value: string): Expression => ({
  id: mint(),
  kind: 'enum',
  type,
  value,
});

export const call = (
  target: Expression,
  name: string,
  args: Readonly<Record<string, Expression>> = {},
  id: NodeId = mint(),
): Statement & { kind: 'call' } => ({
  id,
  kind: 'call',
  target,
  callee: { kind: 'story', name },
  args,
  details: {},
});

/** The scene, with `body` as `myFirstMethod`'s statements after "cat say Hello" and a do together. */
export function scene(body: readonly Statement[] = [], more: readonly Statement[] = []): Program {
  return {
    schemaVersion: '1.0.0',
    types: [
      {
        id: ID.scene,
        kind: 'type',
        name: 'Scene1',
        extends: story('Scene'),
        fields: [
          { id: ID.camera, kind: 'field', name: 'camera', type: story('Camera'), initial: null },
          { id: ID.cat, kind: 'field', name: 'cat', type: story('Biped'), initial: null },
          { id: ID.chair, kind: 'field', name: 'chair', type: story('Prop'), initial: null },
          {
            id: ID.score,
            kind: 'field',
            name: 'score',
            type: story('WholeNumber'),
            initial: { id: mint(), kind: 'wholeNumber', value: 0 },
          },
          {
            id: ID.rex,
            kind: 'field',
            name: 'rex',
            type: { kind: 'user', type: ID.pet },
            initial: null,
          },
        ],
        methods: [
          {
            id: ID.main,
            kind: 'method',
            name: 'myFirstMethod',
            returns: null,
            params: [],
            body: [
              call(field(ID.cat), 'say', { text: text('Hello') }, ID.say),
              {
                id: ID.together,
                kind: 'doTogether',
                body: [
                  call(
                    field(ID.cat),
                    'move',
                    {
                      direction: {
                        id: ID.direction,
                        kind: 'enum',
                        type: 'MoveDirection',
                        value: 'forward',
                      },
                      amount: { id: ID.amount, kind: 'number', value: 1 },
                    },
                    ID.move,
                  ),
                ],
              },
              ...body,
            ],
          },
          ...(more.length > 0
            ? [
                {
                  id: nodeId('othrmt'),
                  kind: 'method' as const,
                  name: 'other',
                  returns: null,
                  params: [],
                  body: more,
                },
              ]
            : []),
        ],
        listeners: [],
      },
      {
        id: ID.pet,
        kind: 'type',
        name: 'Pet',
        extends: story('Quadruped'),
        fields: [],
        methods: [
          {
            id: ID.hop,
            kind: 'method',
            name: 'hop',
            returns: null,
            params: [
              {
                id: ID.height,
                kind: 'parameter',
                name: 'height',
                type: story('Number'),
                default: null,
              },
            ],
            body: [],
          },
        ],
        listeners: [],
      },
    ],
  };
}

/** A joint list for `jointsOf`, as the manifest would give it for the cat. */
export const catJoints = (f: NodeId) =>
  f === ID.cat
    ? [
        { id: 'head', words: 'head' },
        { id: 'leftLowerArm', words: 'left elbow' },
      ]
    : [];
