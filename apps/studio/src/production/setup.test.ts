import { exampleProduction } from '@storystage/production';
import { IDENTITY } from '@storystage/story-api';
import { describe, expect, it } from 'vitest';
import { fieldOf, rotationOf, turnOf, withField, withObjectTransform } from './setup.ts';

// An object's place, turn and size in the set-up (07-ux 7.2).

describe('turns', () => {
  it('reads a rotation about the vertical in turns, and back', () => {
    for (const t of [0, 0.125, 0.25, 0.5, 0.75, 0.875]) expect(turnOf(rotationOf(t))).toBe(t);
    expect(turnOf(IDENTITY.rotation)).toBe(0);
  });
});

describe('a field', () => {
  it('sets one value and keeps it within its limits', () => {
    const t = withField(IDENTITY, 'x', 2.5);
    expect(t.position).toEqual({ x: 2.5, y: 0, z: 0 });
    expect(withField(IDENTITY, 'x', 1e9).position.x).toBe(100);
    expect(fieldOf(withField(IDENTITY, 'turn', 0.25), 'turn')).toBe(0.25);
    expect(withField(IDENTITY, 'size', 2).scale).toEqual({ x: 2, y: 2, z: 2 });
    expect(withField(IDENTITY, 'size', 0).scale.x).toBe(0.1);
  });
});

describe('withObjectTransform', () => {
  it('moves one object of one scene, and nothing else', () => {
    const p = exampleProduction();
    const s1 = p.scenes[0]!;
    const moved = withField(s1.setup.objects[0]!.transform, 'x', 3);
    const next = withObjectTransform(p, s1.id, s1.setup.objects[0]!.id, moved);
    expect(next.scenes[0]!.setup.objects[0]!.transform).toEqual(moved);
    expect(next.scenes[0]!.setup.objects[1]).toBe(s1.setup.objects[1]);
    expect(next.scenes[1]).toBe(p.scenes[1]);
    expect(next.program).toBe(p.program);
  });
});
