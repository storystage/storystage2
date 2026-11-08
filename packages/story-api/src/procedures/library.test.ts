import type { NodeId } from '@storystage/ast';
import { describe, expect, it } from 'vitest';
import { ENTRIES } from '../catalog/entries.ts';
import type { StageCommand, StageQuery, StageQueryResult } from '../stage-commands.ts';
import { CAMERA, IDENTITY, SCENE, micros, type Transform } from '../vocabulary.ts';
import { STORY_LIBRARY } from './library.ts';
import { StoryFault, type StoryCall, type StoryWait, type Value } from './types.ts';

const obj = (id: string): Value => ({ kind: 'object', id, type: null });
const choice = (type: string, value: string): Value => ({ kind: 'enum', type, value });

type Sent = Omit<StageCommand, 'seq' | 'start'>;

/** Runs one block to the end, answering its questions with `answer`. */
function run(
  name: string,
  call: Partial<StoryCall> = {},
  answer: (q: StageQuery) => StageQueryResult = () => {
    throw new Error('No questions expected.');
  },
) {
  const sent: Sent[] = [];
  const waits: StoryWait[] = [];
  const context = { now: micros(3), emit: (c: Sent) => sent.push(c), random: () => 0 };
  const block = STORY_LIBRARY[name];
  if (!block) throw new Error(`No block ${name}.`);
  const steps = block(
    { node: 'n1' as NodeId, target: obj('cat'), name, args: {}, details: {}, ...call },
    context,
  );
  let input: unknown;
  for (;;) {
    const step = steps.next(input);
    if (step.done) return { value: step.value, sent, waits };
    waits.push(step.value);
    input = step.value.kind === 'ask' ? answer(step.value.query) : undefined;
  }
}

const at = (x: number, y: number, z: number): Transform => ({ ...IDENTITY, position: { x, y, z } });

describe('the library', () => {
  it('has a block for every entry the stage runs, and nothing else', () => {
    const staged = ENTRIES.filter((e) => /^(command|query):/.test(e.runs)).map((e) => e.name);
    expect(Object.keys(STORY_LIBRARY).sort()).toEqual([...new Set(staged)].sort());
  });
});

describe('procedures', () => {
  it('send one command, with Alice’s default second and style, and wait for it', () => {
    const { sent, waits, value } = run('move', {
      args: { direction: choice('MoveDirection', 'left'), amount: 2 },
    });
    expect(sent).toEqual([
      {
        object: 'cat',
        kind: 'translate',
        by: { x: 2, y: 0, z: 0 },
        space: 'self',
        duration: micros(1),
        style: 'beginAndEndGently',
      },
    ]);
    expect(waits).toEqual([{ kind: 'sleep', duration: micros(1) }]);
    expect(value).toBeNull();
  });

  it('take their details: duration, style and the axes they go by', () => {
    const { sent, waits } = run('turn', {
      args: { direction: choice('TurnDirection', 'forward'), amount: 0.25 },
      details: {
        duration: 0,
        animationStyle: choice('AnimationStyle', 'beginAndEndAbruptly'),
        asSeenBy: obj('dog'),
      },
    });
    expect(sent[0]).toMatchObject({
      kind: 'rotate',
      axis: { x: 1, y: 0, z: 0 },
      turns: 0.25,
      space: { asSeenBy: 'dog' },
      duration: 0,
      style: 'beginAndEndAbruptly',
    });
    expect(waits).toEqual([]);
  });

  it('move away with a negative amount', () => {
    const { sent } = run('moveAwayFrom', { args: { target: obj('dog'), amount: 2 } });
    expect(sent[0]).toMatchObject({ kind: 'moveToward', target: 'dog', amount: -2 });
  });

  it('keep the volume when resizing one way, unless told not to', () => {
    const kept = run('resizeWidth', { args: { factor: 4 } }).sent[0];
    expect(kept).toMatchObject({ kind: 'resize', factor: { x: 4, y: 0.5, z: 0.5 } });
    const loose = run('resizeWidth', {
      args: { factor: 4 },
      details: { isVolumePreserved: false },
    });
    expect(loose.sent[0]).toMatchObject({ factor: { x: 4, y: 1, z: 1 } });
  });

  it('set a size with a policy', () => {
    const { sent } = run('setHeight', {
      args: { height: 2 },
      details: { policy: choice('SetDimensionPolicy', 'preserveNothing') },
    });
    expect(sent[0]).toMatchObject({
      kind: 'setSize',
      dimension: 'height',
      to: 2,
      policy: 'preserveNothing',
    });
  });

  it('say and think with Alice’s bubble', () => {
    const { sent } = run('think', { args: { text: 'Hmm' } });
    expect(sent[0]).toMatchObject({
      kind: 'say',
      text: 'Hmm',
      bubble: 'think',
      look: {
        position: 'automatic',
        textScale: 1,
        textStyle: 'plain',
        font: 'default',
        textColour: 'black',
        fillColour: 'white',
        outlineColour: 'white',
      },
    });
  });

  it('paint with a colour name or #rrggbb', () => {
    expect(run('setPaint', { args: { paint: choice('Color', 'red') } }).sent[0]).toMatchObject({
      paint: 'red',
    });
    expect(run('setPaint', { args: { paint: '#336699' } }).sent[0]).toMatchObject({
      paint: '#336699',
    });
  });

  it('ride on the scene again', () => {
    const { sent, waits } = run('setVehicle', { args: { vehicle: obj(SCENE) } });
    expect(sent[0]).toMatchObject({ kind: 'vehicle', vehicle: null, duration: 0 });
    expect(waits).toEqual([]);
  });

  it('send the scene’s and the camera’s blocks to them', () => {
    const sky = run('setAtmosphereColor', {
      target: obj(SCENE),
      args: { color: choice('Color', 'blue') },
    });
    expect(sky.sent[0]).toMatchObject({ object: SCENE, kind: 'atmosphere', colour: 'blue' });
    const light = run('setFromBelowLightColor', {
      target: obj(SCENE),
      args: { color: choice('Color', 'red') },
    });
    expect(light.sent[0]).toMatchObject({ kind: 'light', from: 'below', duration: micros(1) });
    const lens = run('setVerticalViewingAngle', { target: obj(CAMERA), args: { angle: 0.1 } });
    expect(lens.sent[0]).toMatchObject({
      object: CAMERA,
      kind: 'lens',
      verticalAngle: 0.1,
      duration: 0,
    });
    // fadeToBlack isn't here: it ends the scene in the runtime (spec 02, section 9, rule 8).
    expect(STORY_LIBRARY['fadeToBlack']).toBeUndefined();
  });

  it('refuse a value out of range or of the wrong kind', () => {
    const bad: [string, Partial<StoryCall>][] = [
      ['setOpacity', { args: { opacity: 2 } }],
      ['resize', { args: { factor: 0 } }],
      ['move', { args: { direction: choice('TurnDirection', 'left'), amount: 1 } }],
      ['move', { args: { direction: choice('MoveDirection', 'left'), amount: Number.NaN } }],
      ['turnToFace', { args: { target: 'dog' } }],
      ['say', { args: { text: 'Hi' }, details: { duration: -1 } }],
    ];
    for (const [name, call] of bad) expect(() => run(name, call), name).toThrow(StoryFault);
  });
});

describe('functions', () => {
  it('ask the stage at the current time and give back its answer', () => {
    const { value, waits } = run('getDistanceTo', { args: { other: obj('dog') } }, () => ({
      kind: 'distance',
      value: 4,
    }));
    expect(value).toBe(4);
    expect(waits).toEqual([
      { kind: 'ask', query: { kind: 'distance', from: 'cat', to: 'dog', at: micros(3) } },
    ]);
  });

  it('give a model’s own paint as white, and a colour by name where they can', () => {
    const look = (paint: string | null) => () =>
      ({ kind: 'look', value: { paint, opacity: 1, backPaint: null, text: null } }) as const;
    expect(run('getPaint', {}, look(null)).value).toEqual(choice('Color', 'white'));
    expect(run('getPaint', {}, look('red')).value).toEqual(choice('Color', 'red'));
    expect(run('getPaint', {}, look('#ff0000')).value).toEqual(choice('Color', 'red'));
    expect(run('getPaint', {}, look('#123456')).value).toBe('#123456');
  });

  it('name the sky’s colour, and give the fog as 0 to 1', () => {
    const sky = () =>
      ({
        kind: 'sceneLook',
        value: { atmosphere: '#0000ff', fromAbove: '#ffffff', fromBelow: '#010203', fog: 0.3 },
      }) as const;
    const scene = { target: obj(SCENE) };
    expect(run('getAtmosphereColor', scene, sky).value).toEqual(choice('Color', 'blue'));
    expect(run('getFromBelowLightColor', scene, sky).value).toBe('#010203');
    expect(run('getFogDensity', scene, sky).value).toBe(0.3);
  });

  it('give the scene as the vehicle of something riding on nothing', () => {
    const { value } = run('getVehicle', {}, () => ({ kind: 'vehicle', value: null }));
    expect(value).toEqual(obj(SCENE));
  });

  it('tell whether one thing faces another', () => {
    const where = (dogZ: number) => (q: StageQuery) =>
      ({
        kind: 'transform',
        value: q.kind === 'transform' && q.object === 'dog' ? at(0, 0, dogZ) : at(0, 0, 0),
      }) as const;
    expect(run('isFacing', { args: { other: obj('dog') } }, where(3)).value).toBe(true);
    expect(run('isFacing', { args: { other: obj('dog') } }, where(-3)).value).toBe(false);
  });

  it('measure above and to the left by the gap between their boxes', () => {
    // Both are a metre cube standing on its origin; the cat is 3 m up and 2 m to the left.
    const answer = (q: StageQuery): StageQueryResult => {
      if (q.kind === 'size') return { kind: 'size', value: { x: 1, y: 1, z: 1 } };
      if (q.kind !== 'transform') throw new Error(q.kind);
      return { kind: 'transform', value: q.object === 'cat' ? at(2, 3, 0) : at(0, 0, 0) };
    };
    const other = { args: { other: obj('dog') } };
    expect(run('getDistanceAbove', other, answer).value).toBeCloseTo(2, 6);
    expect(run('isBelow', other, answer).value).toBe(false);
    expect(run('getDistanceToTheLeftOf', other, answer).value).toBeCloseTo(1, 6);
    expect(run('isToTheRightOf', other, answer).value).toBe(false);
    expect(run('getDistanceInFrontOf', other, answer).value).toBe(-1);
  });
});
