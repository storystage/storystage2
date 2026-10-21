import { StageError, backstageId, jointName, micros, objectId } from '@storystage/story-api';
import { describe, expect, it } from 'vitest';
import { SETUP, cmd, describeStageContract } from './conformance.ts';
import { FakeStage } from './fake-stage.ts';

describeStageContract('FakeStage', () => new FakeStage());

const cat = objectId('cat');
const dog = objectId('dog');

describe('FakeStage', () => {
  it('records the calls made to it', async () => {
    const stage = new FakeStage();
    await stage.load(SETUP);
    stage.seek(micros(1));
    expect(stage.calls.map((c) => c.method)).toEqual(['load', 'seek']);
    expect(stage.calls[1]!.args).toEqual([micros(1)]);
  });

  it('lets a test fire stage events, and stop listening', async () => {
    const stage = new FakeStage();
    await stage.load(SETUP);
    const heard: string[] = [];
    const stop = stage.onEvent((e) => heard.push(e.kind));
    stage.emit({ kind: 'click', object: cat, at: 0 });
    stop();
    stage.emit({ kind: 'click', object: dog, at: 0 });
    expect(heard).toEqual(['click']);
  });

  it('gives actors a head and neck, and refuses a joint an object does not have', async () => {
    const stage = new FakeStage();
    await stage.load(SETUP);
    expect(stage.joints(cat)).toEqual([jointName('head'), jointName('neck')]);
    stage.schedule([
      cmd(0, 1, {
        object: cat,
        kind: 'joint',
        joint: jointName('head'),
        axis: { x: 0, y: 1, z: 0 },
        turns: 0.1,
      }),
    ]);
    expect(() =>
      stage.schedule([
        cmd(0, 1, {
          object: cat,
          kind: 'joint',
          joint: jointName('tail'),
          axis: { x: 0, y: 1, z: 0 },
          turns: 0.1,
        }),
      ]),
    ).toThrow(StageError);
  });

  it('refuses an unknown model when it is told which models exist', async () => {
    const stage = new FakeStage({ knownModels: [backstageId('Quadruped/Cat/AbyssinianCat')] });
    const setup = {
      ...SETUP,
      objects: [{ ...SETUP.objects[0]!, model: backstageId('Dragon/Big') }],
    };
    await expect(stage.load(setup)).rejects.toMatchObject({ code: 'unknown_model' });
  });

  it('turns to face the other way round the short way', async () => {
    const stage = new FakeStage();
    await stage.load(SETUP);
    stage.schedule([cmd(0, 1, { object: cat, kind: 'turnToFace', target: dog })]);
    stage.seek(micros(1));
    const r = stage.transform(cat).rotation;
    // Facing +X from facing +Z is a quarter turn: sin(45°) about Y.
    expect(Math.abs(r.y)).toBeCloseTo(Math.SQRT1_2, 5);
  });

  it('refuses bad numbers', async () => {
    const stage = new FakeStage();
    await stage.load(SETUP);
    expect(() => stage.schedule([cmd(0, 1, { object: cat, kind: 'opacity', to: 2 })])).toThrow(
      /0 to 1/,
    );
    expect(() =>
      stage.schedule([
        cmd(0, 1, { object: cat, kind: 'translate', by: { x: NaN, y: 0, z: 0 }, space: 'scene' }),
      ]),
    ).toThrow(StageError);
  });
});
