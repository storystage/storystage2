import type { Statement } from '@storystage/ast';
import { describe, expect, it } from 'vitest';
import { newCall, newControl } from './build.ts';
import {
  answer,
  cascadeFor,
  detailsToAdd,
  emptySlots,
  rangeAt,
  scopeAt,
  wantedAt,
  type Choice,
} from './cascade.ts';
import { canDrop, type ValuePlace } from './drop.ts';
import { call, catJoints, field, ID, mint, num, scene } from './testing.ts';

const words = (choices: readonly Choice[]) => choices.map((c) => c.words);
const suggested = (choices: readonly Choice[]) => choices.find((c) => c.suggested)?.words;

/** The scene with one more statement at the end of `myFirstMethod`, and a place in it. */
function withBlock(block: Statement, slot = 'args', param?: string) {
  const program = scene([block]);
  const place: ValuePlace = { kind: 'value', node: block.id, slot, ...(param ? { param } : {}) };
  return { program, place };
}

describe('what a slot wants', () => {
  const program = scene();
  it('reads the Story API’s parameter types', () => {
    expect(
      wantedAt(program, { kind: 'value', node: ID.move, slot: 'args', param: 'direction' }),
    ).toEqual({
      kind: 'story',
      name: 'MoveDirection',
    });
    expect(
      wantedAt(program, { kind: 'value', node: ID.move, slot: 'details', param: 'duration' }),
    ).toEqual({
      kind: 'story',
      name: 'Number',
    });
  });

  it('reads a limit', () => {
    const { program: p, place } = withBlock(
      call(field(ID.cat), 'setOpacity', { opacity: num(1) }),
      'args',
      'opacity',
    );
    expect(rangeAt(p, place)).toBe('portion');
  });
});

describe('cascadeFor', () => {
  it('offers a value type’s values in its words, with a suggestion', () => {
    const choices = cascadeFor(
      scene(),
      { kind: 'value', node: ID.move, slot: 'args', param: 'direction' },
      mint,
    );
    expect(words(choices)).toEqual(['left', 'right', 'up', 'down', 'forward', 'backward']);
    expect(suggested(choices)).toBe('forward');
  });

  it('offers Alice’s numbers, then lets the learner type one', () => {
    const choices = cascadeFor(
      scene(),
      { kind: 'value', node: ID.move, slot: 'args', param: 'amount' },
      mint,
    );
    expect(words(choices).slice(0, 7)).toEqual([
      '0.25',
      '0.5',
      '1',
      '2',
      '5',
      '10',
      'Other number…',
    ]);
    expect(suggested(choices)).toBe('1');
    expect(choices[6]).toMatchObject({ ask: 'number' });
  });

  it('suggests a quarter turn for turning', () => {
    const turn = newCall(
      scene(),
      field(ID.cat),
      { kind: 'story', name: 'turn' },
      false,
      mint,
    ) as Statement;
    const { program, place } = withBlock(turn, 'args', 'amount');
    expect(suggested(cascadeFor(program, place, mint))).toBe('0.25');
  });

  it('offers the scene’s objects that fit, then joints, then the scene', () => {
    const moveTo = newCall(
      scene(),
      field(ID.cat),
      { kind: 'story', name: 'moveTo' },
      false,
      mint,
    ) as Statement;
    const { program, place } = withBlock(moveTo, 'args', 'target');
    const choices = cascadeFor(program, place, mint, { jointsOf: catJoints });
    expect(words(choices)).toEqual(['camera', 'cat', 'chair', 'rex', 'the scene']);
    expect(words(choices.find((c) => c.words === 'cat')?.choices ?? [])).toEqual([
      'head',
      'left elbow',
    ]);
  });

  it('offers only the objects of the class wanted', () => {
    const shot = newCall(
      scene(),
      field(ID.camera),
      { kind: 'story', name: 'setVehicle' },
      false,
      mint,
    ) as Statement;
    const { program, place } = withBlock(shot, 'args', 'vehicle');
    expect(words(cascadeFor(program, place, mint))).toContain('chair');
    const count = newControl('count', mint);
    const counted = withBlock(count, 'times');
    expect(words(cascadeFor(counted.program, counted.place, mint))).toEqual([
      '1',
      '2',
      '3',
      '5',
      '10',
      'Other whole number…',
    ]);
  });

  it('offers true, false and each object’s yes-or-no questions for a condition', () => {
    const branch = newControl('if', mint);
    const { program, place } = withBlock(branch, 'condition');
    const choices = cascadeFor(program, place, mint);
    expect(words(choices).slice(0, 2)).toEqual(['true', 'false']);
    expect(words(choices.find((c) => c.words === 'cat')?.choices ?? [])).toContain(
      'cat is touching ???',
    );
  });

  it('offers variables in scope, and not those declared later', () => {
    const local = (name: string, id: string): Statement => ({
      id: id as never,
      kind: 'local',
      name,
      type: { kind: 'story', name: 'Number' },
      value: num(3),
    });
    const move = newCall(
      scene(),
      field(ID.cat),
      { kind: 'story', name: 'move' },
      false,
      mint,
    ) as Statement;
    const program = scene([local('speed', 'speedv'), move, local('later', 'laterv')]);
    const place: ValuePlace = { kind: 'value', node: move.id, slot: 'args', param: 'amount' };
    expect(scopeAt(program, move.id).map((v) => v.name)).toEqual(['speed']);
    expect(words(cascadeFor(program, place, mint))).toContain('speed');
    expect(words(cascadeFor(program, place, mint))).not.toContain('later');
  });

  it('leaves out variables of another type', () => {
    const named: Statement = {
      id: 'namevr' as never,
      kind: 'local',
      name: 'nickname',
      type: { kind: 'story', name: 'Text' },
      value: { id: mint(), kind: 'text', value: 'Tom' },
    };
    const move = newCall(
      scene(),
      field(ID.cat),
      { kind: 'story', name: 'move' },
      false,
      mint,
    ) as Statement;
    const program = scene([named, move]);
    const place: ValuePlace = { kind: 'value', node: move.id, slot: 'args', param: 'amount' };
    expect(scopeAt(program, move.id).map((v) => v.name)).toEqual(['nickname']);
    expect(words(cascadeFor(program, place, mint))).not.toContain('nickname');
  });

  it('offers only values that fit: every one can be dropped there', () => {
    const moveTo = newCall(
      scene(),
      field(ID.cat),
      { kind: 'story', name: 'moveTo' },
      false,
      mint,
    ) as Statement;
    const { program, place } = withBlock(moveTo, 'args', 'target');
    const all = cascadeFor(program, place, mint, { jointsOf: catJoints }).flatMap((c) => [
      c,
      ...(c.choices ?? []),
    ]);
    for (const c of all.filter((x) => x.value))
      expect(canDrop(program, place, c.value!).ok, c.words).toBe(true);
  });
});

describe('after a drop', () => {
  it('asks for each empty value in the block’s order', () => {
    const move = newCall(scene(), field(ID.cat), { kind: 'story', name: 'move' }, false, mint);
    expect(emptySlots(move).map((s) => s.param)).toEqual(['direction', 'amount']);
    expect(emptySlots(newControl('while', mint)).map((s) => s.slot)).toEqual(['condition']);
  });

  it('lists the details a block can still take', () => {
    expect(detailsToAdd(scene(), ID.move).map((d) => d.words)).toEqual([
      'how long',
      'how it starts and ends',
      'as seen by',
    ]);
    expect(detailsToAdd(scene(), ID.say).map((d) => d.name)).not.toContain('animationStyle');
  });

  it('never offers a speak line’s script line, which only the script sets (spec 06, 4.1)', () => {
    const speak = call(field(ID.cat), 'speakLine', {
      text: { id: mint(), kind: 'text', value: 'Hi' },
    });
    const { program } = withBlock(speak);
    expect(detailsToAdd(program, speak.id).map((d) => d.name)).toEqual(['duration']);
  });
});

describe('answer', () => {
  it('takes a number, with a comma or a point', () => {
    expect(answer('number', '2,5', mint)).toMatchObject({
      ok: true,
      value: { kind: 'number', value: 2.5 },
    });
  });

  it('refuses what isn’t a number, a fraction for a whole number, and a value past its limit', () => {
    expect(answer('number', 'far', mint)).toMatchObject({ ok: false });
    expect(answer('wholeNumber', '1.5', mint)).toEqual({
      ok: false,
      reason: 'That needs a whole number, like 3.',
    });
    expect(answer('number', '2', mint, 'portion')).toEqual({
      ok: false,
      reason: 'That needs a number from 0 to 1.',
    });
  });

  it('takes any words', () => {
    expect(answer('text', 'Hello there', mint)).toMatchObject({
      ok: true,
      value: { kind: 'text' },
    });
  });
});
