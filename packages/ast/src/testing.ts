/**
 * A small, valid program for tests in this package and others. Every statement and expression
 * kind appears in it, so a walk over it reaches them all. Not exported from the package root:
 * use `@storystage/ast/testing`.
 */
import { nodeId } from './ids.ts';
import type { Expression, Program, Statement } from './nodes.ts';

export const ids = {
  scene: nodeId('scene1'),
  camera: nodeId('camera'),
  cat: nodeId('catcat'),
  score: nodeId('scorex'),
  main: nodeId('mainmm'),
  hop: nodeId('hopmth'),
  height: nodeId('height'),
  double: nodeId('double'),
  click: nodeId('clickl'),
  clicked: nodeId('clickp'),
  say: nodeId('saystm'),
  together: nodeId('togeth'),
  move: nodeId('movest'),
  turn: nodeId('turnst'),
  count: nodeId('countt'),
  add: nodeId('addstm'),
  local: nodeId('localx'),
  note: nodeId('noteaa'),
  loop: nodeId('forlop'),
  item: nodeId('itemvr'),
  each: nodeId('eachst'),
  eachItem: nodeId('eachvr'),
  branch: nodeId('ifstmt'),
  whileLoop: nodeId('whilel'),
  sequence: nodeId('inorde'),
  callHop: nodeId('callhp'),
  answer: nodeId('answer'),
} as const;

let next = 0;
const exprId = () => nodeId(`e${(next++).toString(36).padStart(5, '0')}`);

const number = (value: number): Expression => ({ id: exprId(), kind: 'number', value });
const whole = (value: number): Expression => ({ id: exprId(), kind: 'wholeNumber', value });
const self = (): Expression => ({ id: exprId(), kind: 'this' });
const catRef = (): Expression => ({
  id: exprId(),
  kind: 'fieldRef',
  target: self(),
  field: ids.cat,
});
const scoreRef = (): Expression => ({
  id: exprId(),
  kind: 'fieldRef',
  target: self(),
  field: ids.score,
});
const say = (id: Statement['id'], text: string): Statement => ({
  id,
  kind: 'call',
  target: catRef(),
  callee: { kind: 'story', name: 'say' },
  args: { text: { id: exprId(), kind: 'text', value: text } },
  details: {},
});

/** A fresh sample. Its expressions have new ids, but every run of a test sees the same sequence. */
export function sampleProgram(): Program {
  next = 0;
  const number_ = { kind: 'story', name: 'Number' } as const;
  const wholeNumber = { kind: 'story', name: 'WholeNumber' } as const;
  const quadruped = { kind: 'story', name: 'Quadruped' } as const;
  const list = { kind: 'array', of: quadruped } as const;
  const items = (): Expression => ({
    id: exprId(),
    kind: 'arrayOf',
    of: quadruped,
    items: [catRef()],
  });
  return {
    schemaVersion: '1.0.0',
    types: [
      {
        id: ids.scene,
        kind: 'type',
        name: 'Scene1',
        extends: { kind: 'story', name: 'Scene' },
        fields: [
          {
            id: ids.camera,
            kind: 'field',
            name: 'camera',
            type: { kind: 'story', name: 'Camera' },
            initial: null,
          },
          { id: ids.cat, kind: 'field', name: 'cat', type: quadruped, initial: null },
          { id: ids.score, kind: 'field', name: 'score', type: wholeNumber, initial: whole(0) },
        ],
        methods: [
          {
            id: ids.main,
            kind: 'method',
            name: 'myFirstMethod',
            returns: null,
            params: [],
            body: [
              say(ids.say, 'Hello'),
              {
                id: ids.together,
                kind: 'doTogether',
                body: [
                  {
                    id: ids.move,
                    kind: 'call',
                    target: catRef(),
                    callee: { kind: 'story', name: 'move' },
                    args: {
                      amount: number(1),
                      direction: {
                        id: exprId(),
                        kind: 'enum',
                        type: 'Direction',
                        value: 'forward',
                      },
                    },
                    details: { duration: number(2) },
                  },
                  {
                    id: ids.turn,
                    kind: 'call',
                    enabled: false,
                    target: catRef(),
                    callee: { kind: 'story', name: 'turn' },
                    args: {
                      amount: number(0.25),
                      direction: { id: exprId(), kind: 'enum', type: 'Direction', value: 'left' },
                    },
                    details: {},
                  },
                ],
              },
              {
                id: ids.count,
                kind: 'count',
                times: whole(3),
                body: [
                  {
                    id: ids.add,
                    kind: 'assign',
                    target: scoreRef(),
                    value: {
                      id: exprId(),
                      kind: 'arithmetic',
                      op: 'add',
                      left: scoreRef(),
                      right: whole(1),
                    },
                  },
                ],
              },
              {
                id: ids.local,
                kind: 'local',
                name: 'x',
                type: number_,
                value: {
                  id: exprId(),
                  kind: 'functionCall',
                  target: catRef(),
                  callee: { kind: 'story', name: 'getDistanceTo' },
                  args: { other: { id: exprId(), kind: 'none' } },
                  details: {},
                },
              },
              { id: ids.note, kind: 'comment', text: 'Now the cat looks around' },
              {
                id: ids.loop,
                kind: 'forEach',
                item: { id: ids.item, kind: 'loopItem', name: 'item', type: quadruped },
                items: items(),
                body: [],
              },
              {
                id: ids.each,
                kind: 'eachTogether',
                item: { id: ids.eachItem, kind: 'loopItem', name: 'item', type: quadruped },
                items: { id: exprId(), kind: 'fieldRef', target: self(), field: ids.cat },
                body: [],
              },
              {
                id: ids.branch,
                kind: 'if',
                condition: {
                  id: exprId(),
                  kind: 'logic',
                  op: 'and',
                  left: {
                    id: exprId(),
                    kind: 'compare',
                    op: 'less',
                    left: { id: exprId(), kind: 'variableRef', variable: ids.local },
                    right: number(2),
                  },
                  right: {
                    id: exprId(),
                    kind: 'not',
                    value: { id: exprId(), kind: 'boolean', value: false },
                  },
                },
                then: [say(nodeId('thenst'), 'Near')],
                else: [],
              },
              {
                id: ids.whileLoop,
                kind: 'while',
                condition: { id: exprId(), kind: 'boolean', value: false },
                body: [],
              },
              {
                id: ids.sequence,
                kind: 'doInOrder',
                body: [
                  {
                    id: ids.callHop,
                    kind: 'call',
                    target: self(),
                    callee: { kind: 'user', method: ids.hop },
                    args: { [ids.height]: number(2) },
                    details: {},
                  },
                ],
              },
            ],
          },
          {
            id: ids.hop,
            kind: 'method',
            name: 'hop',
            returns: null,
            params: [
              {
                id: ids.height,
                kind: 'parameter',
                name: 'height',
                type: number_,
                default: number(1),
              },
            ],
            body: [],
          },
          {
            id: ids.double,
            kind: 'method',
            name: 'double',
            returns: wholeNumber,
            params: [],
            body: [
              {
                id: ids.answer,
                kind: 'return',
                value: {
                  id: exprId(),
                  kind: 'join',
                  left: { id: exprId(), kind: 'text', value: 'a' },
                  right: {
                    id: exprId(),
                    kind: 'arrayLength',
                    array: {
                      id: exprId(),
                      kind: 'arrayOf',
                      of: list,
                      items: [],
                    },
                  },
                },
              },
            ],
          },
        ],
        listeners: [
          {
            id: ids.click,
            kind: 'listener',
            event: 'mouseClickObject',
            args: { objects: items() },
            params: [
              {
                id: ids.clicked,
                kind: 'parameter',
                name: 'clicked',
                type: quadruped,
                default: null,
              },
            ],
            body: [
              {
                id: nodeId('ouchst'),
                kind: 'call',
                target: { id: exprId(), kind: 'variableRef', variable: ids.clicked },
                callee: { kind: 'story', name: 'say' },
                args: {
                  text: {
                    id: exprId(),
                    kind: 'arrayItem',
                    array: {
                      id: exprId(),
                      kind: 'arrayOf',
                      of: { kind: 'story', name: 'Text' },
                      items: [],
                    },
                    index: whole(0),
                  },
                },
                details: {},
              },
            ],
          },
        ],
      },
    ],
  };
}
