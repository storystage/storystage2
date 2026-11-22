import { describe, expect, it } from 'vitest';
import { IDENTITY, type SceneSetup, type Transform } from '@storystage/story-api';
import type { PlanStep } from './plans.ts';
import { sideNamed, sideProblems } from './sides.ts';

const cameraAt = (transform: Partial<Transform> = {}): SceneSetup['camera'] => ({
  transform: { ...IDENTITY, position: { x: 0, y: 1.6, z: -5 }, ...transform },
});
const add = (words: string, x: number, s: Partial<PlanStep> = {}): PlanStep => ({
  words,
  kind: 'add',
  actor: 'fox',
  action: 'vuena/Quadruped/fox',
  target: '',
  details: [{ name: 'position', value: `${x}, 0, 0` }],
  line: '',
  sketch: '',
  together: false,
  repeat: 1,
  holds: 0,
  why: '',
  ...s,
});
const found = (step: PlanStep, camera = cameraAt()) => sideProblems([step], camera).length;

describe("a plan step's side (spec 04, section 6.3)", () => {
  it('refuses the step the rerun of 22 Nov 2026 showed a learner', () => {
    expect(
      sideProblems([add('Add a fox on the left, facing the penguin.', -1)], cameraAt()),
    ).toEqual([
      {
        step: 1,
        message:
          'Its words say left, but x -1 is on the right of the picture. Make the words and the position agree.',
      },
    ]);
  });

  it.each([
    ['Add a fox on the right, facing the penguin.', -1, 0],
    ['Add a cow on the left.', 2.5, 0],
    ['Add a cow on the left.', -2.5, 1],
    ['Add a cat on the right side of the grass, facing the dog.', 0.8, 1],
    ['Move the penguin to the left of the picture.', -1, 1],
    ['Move the penguin to the left side, like your sketch.', -1, 1],
    ['Add a fox on the left.', 0, 0],
  ])('reads "%s" at x %d', (words, x, problems) => {
    expect(found(add(words, x))).toBe(problems);
  });

  it.each([
    'Add a person standing just to the right of the horse.',
    'The penguin starts two metres to the left of the tree.',
    'Add a cow on the left of the row.',
    'The cat turns a quarter turn to the left.',
    'Add a fox on the left, looking at the owl on the right.',
  ])('says nothing about "%s"', (words) => {
    expect(sideNamed(words)).toBeNull();
  });

  it('reads a change of where something starts, by either name of its value', () => {
    const change = (name: string) =>
      add('Move the penguin to the left side.', 0, {
        kind: 'change',
        action: 'position',
        details: [{ name, value: '-1, 0, 0' }],
      });
    expect(found(change('position'))).toBe(1);
    expect(found(change('value'))).toBe(1);
  });

  it("says nothing where the picture's left isn't sure", () => {
    const wrong = add('Add a fox on the left.', -1);
    expect(found(wrong, cameraAt({ position: { x: 3, y: 1, z: -5 } }))).toBe(0);
    expect(found(wrong, cameraAt({ rotation: { x: 0, y: 1, z: 0, w: 0 } }))).toBe(0);
    const turned = add('Turn the camera round.', 0, {
      kind: 'change',
      actor: 'camera',
      action: 'turn_degrees',
      details: [{ name: 'turn_degrees', value: '180' }],
    });
    expect(sideProblems([wrong, turned], cameraAt())).toEqual([]);
  });
});
