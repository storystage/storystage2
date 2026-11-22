import {
  nodeId,
  validateProgram,
  type Expression,
  type Program,
  type Statement,
} from '@storystage/ast';
import { STORY_LIBRARY, StoryFault, micros, type StageCommand } from '@storystage/story-api';
import { describe, expect, it } from 'vitest';
import { Interpreter } from './interpreter.ts';
import { Scheduler, type RuntimeFault } from './scheduler.ts';
import type { StoryLibrary } from './story.ts';

const CAT = nodeId('catfld');
const MAIN = nodeId('mainmt');

let counter = 0;
const id = () => nodeId(`f${(counter++).toString(36).padStart(5, '0')}`);
const cat = (): Expression => ({
  id: id(),
  kind: 'fieldRef',
  target: { id: id(), kind: 'this' },
  field: CAT,
});

const move = (amount: Expression): Statement => ({
  id: id(),
  kind: 'call',
  target: cat(),
  callee: { kind: 'story', name: 'move' },
  args: { direction: { id: id(), kind: 'enum', type: 'MoveDirection', value: 'forward' }, amount },
  details: {},
});

function program(body: readonly Statement[]): Program {
  return {
    schemaVersion: '1.0.0',
    types: [
      {
        id: nodeId('scenet'),
        kind: 'type',
        name: 'Scene1',
        extends: { kind: 'story', name: 'Scene' },
        fields: [
          {
            id: CAT,
            kind: 'field',
            name: 'cat',
            type: { kind: 'story', name: 'Quadruped' },
            initial: null,
          },
        ],
        methods: [
          { id: MAIN, kind: 'method', name: 'myFirstMethod', returns: null, params: [], body },
        ],
        listeners: [],
      },
    ],
  };
}

function run(body: readonly Statement[], library: StoryLibrary = STORY_LIBRARY) {
  const p = program(body);
  expect(validateProgram(p)).toEqual([]);
  const commands: StageCommand[] = [];
  let fault: RuntimeFault | null = null;
  const scheduler = new Scheduler({ onFault: (f) => (fault = f) });
  const interpreter = new Interpreter(p, {
    scheduler,
    library,
    emit: (c) => commands.push(c),
    disabled: [],
    seed: 1,
  });
  scheduler.spawn(interpreter.runMethod(MAIN));
  scheduler.runUntil(micros(10));
  return { commands, fault: fault as RuntimeFault | null };
}

describe("the Story API's library (WP4.3) in the runtime", () => {
  it('fits the runtime as it is', () => {
    const library: StoryLibrary = STORY_LIBRARY;
    expect(Object.keys(library)).toContain('move');
  });

  it('runs a block: move sends its command and takes its second', () => {
    const block = move({ id: id(), kind: 'number', value: 2 });
    const { commands, fault } = run([block, move({ id: id(), kind: 'number', value: 1 })]);
    expect(fault).toBeNull();
    expect(commands.map((c) => [c.kind, c.start])).toEqual([
      ['translate', 0],
      ['translate', micros(1)],
    ]);
  });

  it("reports a block's own refusal as a bad value at that block", () => {
    const block = move({ id: id(), kind: 'text', value: 'far' });
    const { fault } = run([block]);
    expect(fault?.code).toBe('bad_value');
    expect(fault?.node).toBe(block.id);
    expect(fault?.detail).toBe('amount must be a number.');
  });

  it('does the same when a block refuses after it has waited', () => {
    const late: StoryLibrary = {
      *move() {
        yield { kind: 'sleep', duration: micros(1) };
        throw new StoryFault('Not now.');
      },
    };
    const block = move({ id: id(), kind: 'number', value: 1 });
    const { fault } = run([block], late);
    expect(fault).toMatchObject({ code: 'bad_value', node: block.id, detail: 'Not now.' });
  });

  it('still reports a slip in a block as internal', () => {
    const broken: StoryLibrary = {
      // eslint-disable-next-line require-yield
      *move() {
        throw new TypeError('oops');
      },
    };
    expect(run([move({ id: id(), kind: 'number', value: 1 })], broken).fault?.code).toBe(
      'internal',
    );
  });
});
