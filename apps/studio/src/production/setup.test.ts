import { exampleProduction } from '@storystage/production';
import { IDENTITY } from '@storystage/story-api';
import { describe, expect, it } from 'vitest';
import {
  fieldOf,
  inFrontOfCamera,
  rotationOf,
  turnOf,
  withField,
  withObjectTransform,
  dragKind,
  facingCamera,
  withCamera,
  withMarker,
} from './setup.ts';

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

describe('where a new object lands', () => {
  it('stands on the ground in front of the camera, facing it, and the next beside it', () => {
    const camera = { ...IDENTITY, position: { x: 0, y: 1.6, z: -5 } };
    const first = inFrontOfCamera(camera, 0);
    expect(first.position).toEqual({ x: 0, y: 0, z: -1 });
    // Facing back along -Z, to the camera: half a turn.
    expect(turnOf(first.rotation)).toBe(0.5);
    const second = inFrontOfCamera(camera, 1);
    expect(second.position.z).toBe(-1);
    expect(Math.abs(second.position.x)).toBeGreaterThan(1);
  });
});

describe('handle drags and the camera (07-ux 7.2)', () => {
  const at = (x: number) => ({ ...IDENTITY, position: { x, y: 0, z: 0 } });

  it('names a drag for what it did', () => {
    expect(dragKind(at(0), at(1))).toBe('move');
    expect(dragKind(at(0), { ...at(0), scale: { x: 2, y: 2, z: 2 } })).toBe('size');
    expect(dragKind(at(0), { ...at(0), rotation: rotationOf(0.25) })).toBe('turn');
  });

  it('moves the scene’s camera and a marker, leaving the other scenes alone', () => {
    const p = exampleProduction();
    const scene = p.scenes[0]!.id;
    const camera = withCamera(p, scene, at(3));
    expect(camera.scenes[0]!.setup.camera.transform).toEqual(at(3));
    expect(camera.scenes[1]).toBe(p.scenes[1]);
    const marked = {
      ...p,
      scenes: p.scenes.map((s, i) =>
        i === 0 ? { ...s, setup: { ...s.setup, markers: [{ id: 'm1', transform: at(0) }] } } : s,
      ),
    };
    expect(withMarker(marked, scene, 'm1', at(2)).scenes[0]!.setup.markers).toEqual([
      { id: 'm1', transform: at(2) },
    ]);
  });
});

describe('a model dropped on the scene view (07-ux 7.2)', () => {
  it('stands where it was dropped, facing the camera', () => {
    const camera = { ...IDENTITY, position: { x: 0, y: 1.5, z: -10 } };
    const t = facingCamera(camera, { x: 2, y: 0, z: 0 });
    expect(t.position).toEqual({ x: 2, y: 0, z: 0 });
    expect(t.scale).toEqual({ x: 1, y: 1, z: 1 });
    // Its +Z points back at the camera, across and towards -Z.
    const turned = 2 * Math.atan2(t.rotation.y, t.rotation.w);
    expect(Math.sin(turned)).toBeCloseTo(-2 / Math.hypot(2, 10));
    expect(Math.cos(turned)).toBeCloseTo(-10 / Math.hypot(2, 10));
  });
});
