import { validateProgram, type Expression } from '@storystage/ast';
import { describe, expect, it } from 'vitest';
import { checkProgram } from '../catalog/program-check.ts';
import { call, choice, field, ID, mint, none, num, scene, self } from './testing.ts';
import { describer, fill, splitWords } from './words.ts';

describe('the fixture', () => {
  it('is a valid program, for S2 and the Story API', () => {
    const program = scene();
    expect(validateProgram(program)).toEqual([]);
    expect(checkProgram(program)).toEqual([]);
  });
});

describe('describer', () => {
  const program = scene();
  const describe_ = describer(program);
  const node = (id: string) => {
    const found = program.types[0]!.methods[0]!.body.flatMap((s) =>
      s.kind === 'doTogether' ? [s, ...s.body] : [s],
    );
    return found.find((s) => s.id === id)!;
  };

  it('reads a statement with its values, in the Story API’s words', () => {
    expect(describe_(node(ID.say))).toBe('cat say Hello');
    expect(describe_(node(ID.move))).toBe('cat move forward 1');
    expect(describe_(node(ID.together))).toBe('do together');
  });

  it('shows an empty value as ???', () => {
    const empty = call(field(ID.cat), 'move', { direction: none(), amount: none() });
    expect(describe_.inside(empty, ID.scene)).toBe('cat move ??? ???');
  });

  it('reads the learner’s own procedures, with their parameters', () => {
    const hop = {
      ...call(field(ID.rex), 'x'),
      callee: { kind: 'user', method: ID.hop },
      args: { [ID.height]: num(2) },
    } as const;
    expect(describe_.inside(hop, ID.scene)).toBe('rex hop height 2');
  });

  it('reads `this` as the scene, in a scene', () => {
    const fade = call(self(), 'fadeToBlack');
    expect(describe_.inside(fade, ID.scene)).toBe('the scene fade to black');
  });

  it('reads joints with the joint map’s words, or splits the id', () => {
    const elbow: Expression = {
      id: mint(),
      kind: 'functionCall',
      target: field(ID.cat),
      callee: { kind: 'story', name: 'getJoint' },
      args: { joint: choice('JointId', 'leftLowerArm') },
      details: {},
    };
    expect(describe_.inside(elbow, ID.scene)).toBe('cat left lower arm');
    const named = describer(program, {
      jointWord: (j) => (j === 'leftLowerArm' ? 'left elbow' : j),
    });
    expect(named.inside(elbow, ID.scene)).toBe('cat left elbow');
  });

  it('brackets sums inside sums', () => {
    const sum: Expression = {
      id: mint(),
      kind: 'arithmetic',
      op: 'multiply',
      left: { id: mint(), kind: 'arithmetic', op: 'add', left: num(1), right: num(2) },
      right: num(3),
    };
    expect(describe_.inside(sum, ID.scene)).toBe('(1 + 2) × 3');
  });

  it('gives a block’s short name without its values', () => {
    expect(describe_.short(node(ID.move))).toBe('cat move');
    expect(describe_.short(node(ID.together))).toBe('do together');
  });
});

describe('helpers', () => {
  it('fills a phrase, with ??? for what’s missing', () => {
    expect(fill('move {direction} {amount}', { direction: 'up' })).toBe('move up ???');
  });

  it('splits an id into words', () => {
    expect(splitWords('leftLowerArm')).toBe('left lower arm');
  });
});
