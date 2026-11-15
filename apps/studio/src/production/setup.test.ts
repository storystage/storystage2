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
  nudgeObject,
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

describe('the keyboard pick-up in Objects in this scene (07-ux 7.2)', () => {
  // The example's camera: at z -5, looking along +Z, so its right is -X.
  const camera = { ...IDENTITY, position: { x: 0, y: 1.6, z: -5 } };
  const at = { ...IDENTITY, position: { x: 1, y: 0, z: 2 } };
  const where = (key: string, shift = false, from = at, by = camera) => {
    const n = nudgeObject(from, key, shift, by);
    return (
      n && {
        kind: n.kind,
        x: n.transform.position.x,
        y: n.transform.position.y,
        z: n.transform.position.z,
      }
    );
  };

  it('moves along the ground as the camera sees it: 10 cm, or 1 m with Shift', () => {
    expect(where('ArrowUp')).toEqual({ kind: 'move', x: 1, y: 0, z: 2.1 });
    expect(where('ArrowDown', true)).toEqual({ kind: 'move', x: 1, y: 0, z: 1 });
    expect(where('ArrowRight')).toEqual({ kind: 'move', x: 0.9, y: 0, z: 2 });
    expect(where('ArrowLeft')).toEqual({ kind: 'move', x: 1.1, y: 0, z: 2 });
    // A camera turned a quarter, looking along +X: its right is +Z.
    const turned = { ...camera, rotation: rotationOf(0.25) };
    expect(where('ArrowUp', false, at, turned)).toEqual({ kind: 'move', x: 1.1, y: 0, z: 2 });
    expect(where('ArrowRight', false, at, turned)).toEqual({ kind: 'move', x: 1, y: 0, z: 2.1 });
  });

  it('raises and lowers with Page Up and Page Down, within the limits', () => {
    expect(where('PageUp')).toEqual({ kind: 'move', x: 1, y: 0.1, z: 2 });
    expect(where('PageDown', true)?.y).toBe(-1);
    const high = { ...at, position: { ...at.position, y: 49.95 } };
    expect(where('PageUp', false, high)?.y).toBe(50);
  });

  it('turns an eighth with [ and ], round past a whole turn', () => {
    const turn = (key: string, from = at) =>
      turnOf(nudgeObject(from, key, false, camera)!.transform.rotation);
    expect(turn(']')).toBe(0.125);
    expect(turn('[')).toBe(0.875);
    expect(turn(']', { ...at, rotation: rotationOf(0.875) })).toBe(0);
    expect(nudgeObject(at, ']', false, camera)!.kind).toBe('turn');
  });

  it('resizes by 10% with + and −, within the limits', () => {
    const size = (key: string, scale = 1) => {
      const n = nudgeObject(
        { ...at, scale: { x: scale, y: scale, z: scale } },
        key,
        false,
        camera,
      )!;
      return [n.kind, fieldOf(n.transform, 'size')];
    };
    expect(size('+')).toEqual(['size', 1.1]);
    expect(size('-')).toEqual(['size', 0.909]);
    expect(size('-', 0.1)).toEqual(['size', 0.1]);
    expect(size('=', 10)).toEqual(['size', 10]);
  });

  it('does nothing for any other key', () => {
    for (const key of ['a', 'Home', 'Tab', 'Enter'])
      expect(nudgeObject(at, key, false, camera)).toBeNull();
  });
});
