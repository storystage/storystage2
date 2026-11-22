/**
 * A scene with one of everything the view draws, for the tests and the harness page: a
 * statement, do together, a switched-off statement, count, if with an empty else, and a note.
 */
import { nodeId } from '@storystage/ast';
import type { Expression, NodeId, Program, Statement, TypeRef } from '@storystage/ast';

export const IDS = {
  scene: nodeId('scenet'),
  main: nodeId('mainmt'),
  cat: nodeId('catfld'),
  chair: nodeId('chairf'),
  say: nodeId('saystm'),
  together: nodeId('togeth'),
  move: nodeId('movest'),
  amount: nodeId('moveam'),
  turn: nodeId('turnst'),
  count: nodeId('countt'),
  hop: nodeId('hopsay'),
  branch: nodeId('ifstmt'),
  ouch: nodeId('ouchst'),
  note: nodeId('notest'),
} as const;

let next = 0;
const id = (): NodeId => nodeId(`f${(next++).toString(36).padStart(5, '0')}`);
const story = (name: string): TypeRef => ({ kind: 'story', name });
const self = (): Expression => ({ id: id(), kind: 'this' });
const field = (f: NodeId): Expression => ({ id: id(), kind: 'fieldRef', target: self(), field: f });
const choice = (type: string, value: string): Expression => ({
  id: id(),
  kind: 'enum',
  type,
  value,
});
const say = (stmt: NodeId, words: string): Statement => ({
  id: stmt,
  kind: 'call',
  target: field(IDS.cat),
  callee: { kind: 'story', name: 'say' },
  args: { text: { id: id(), kind: 'text', value: words } },
  details: {},
});

export function fixture(): Program {
  next = 0;
  return {
    schemaVersion: '1.0.0',
    types: [
      {
        id: IDS.scene,
        kind: 'type',
        name: 'Scene1',
        extends: story('Scene'),
        fields: [
          {
            id: nodeId('camfld'),
            kind: 'field',
            name: 'camera',
            type: story('Camera'),
            initial: null,
          },
          { id: IDS.cat, kind: 'field', name: 'cat', type: story('Biped'), initial: null },
          { id: IDS.chair, kind: 'field', name: 'chair', type: story('Prop'), initial: null },
        ],
        methods: [
          {
            id: IDS.main,
            kind: 'method',
            name: 'myFirstMethod',
            returns: null,
            params: [],
            body: [
              say(IDS.say, 'Hello'),
              {
                id: IDS.together,
                kind: 'doTogether',
                body: [
                  {
                    id: IDS.move,
                    kind: 'call',
                    target: field(IDS.cat),
                    callee: { kind: 'story', name: 'move' },
                    args: {
                      direction: choice('MoveDirection', 'forward'),
                      amount: { id: IDS.amount, kind: 'number', value: 1 },
                    },
                    details: { duration: { id: id(), kind: 'number', value: 2 } },
                  },
                  {
                    id: IDS.turn,
                    kind: 'call',
                    enabled: false,
                    target: field(IDS.cat),
                    callee: { kind: 'story', name: 'turn' },
                    args: {
                      direction: choice('TurnDirection', 'left'),
                      amount: { id: id(), kind: 'number', value: 0.25 },
                    },
                    details: {},
                  },
                ],
              },
              {
                id: IDS.count,
                kind: 'count',
                times: { id: id(), kind: 'wholeNumber', value: 2 },
                body: [say(IDS.hop, 'Hop')],
              },
              {
                id: IDS.branch,
                kind: 'if',
                condition: {
                  id: id(),
                  kind: 'functionCall',
                  target: field(IDS.cat),
                  callee: { kind: 'story', name: 'isCollidingWith' },
                  args: { other: field(IDS.chair) },
                  details: {},
                },
                then: [say(IDS.ouch, 'Ouch')],
                else: [],
              },
              { id: IDS.note, kind: 'comment', text: 'Now the cat looks around' },
            ],
          },
        ],
        listeners: [],
      },
    ],
  };
}

/**
 * The same scene with its method grown to `size` statements, counting those inside containers,
 * for spec 14, 3h: a method of 500 statements stays responsive. Its first rows are the fixture's,
 * so the ids in `IDS` still work; the rest cycle through say, move, a count with two rows inside,
 * and a note.
 */
export function large(size: number): Program {
  const program = fixture();
  const method = program.types[0]!.methods[0]!;
  const body: Statement[] = [...method.body];
  let count = 0;
  const walk = (list: readonly Statement[]): void => {
    for (const s of list) {
      count++;
      if ('body' in s) walk(s.body);
      if (s.kind === 'if') {
        walk(s.then);
        walk(s.else);
      }
    }
  };
  walk(body);
  const move = (): Statement => ({
    id: id(),
    kind: 'call',
    target: field(IDS.cat),
    callee: { kind: 'story', name: 'move' },
    args: {
      direction: choice('MoveDirection', 'forward'),
      amount: { id: id(), kind: 'number', value: 1 },
    },
    details: {},
  });
  for (let i = 0; count < size; i++) {
    const left = size - count;
    if (i % 4 === 2 && left >= 3) {
      body.push({
        id: id(),
        kind: 'count',
        times: { id: id(), kind: 'wholeNumber', value: 2 },
        body: [say(id(), `Hop ${i}`), move()],
      });
      count += 3;
    } else {
      body.push(
        i % 4 === 0
          ? say(id(), `Line ${i}`)
          : i % 4 === 1
            ? move()
            : { id: id(), kind: 'comment', text: `Note ${i}` },
      );
      count++;
    }
  }
  return {
    ...program,
    types: [{ ...program.types[0]!, methods: [{ ...method, body }] }],
  };
}
