import {
  IDENTITY,
  objectId,
  type SceneSetup,
  type Transform,
  type Vec3,
} from '@storystage/story-api';
import { describe, expect, it } from 'vitest';
import type { Box } from './hull.ts';
import { BACKDROP_TEMPLATES } from './backdrops.ts';
import { buildNavigation } from './navigation.ts';
import { Timeline, standInShape } from './timeline.ts';

const box = (x0: number, z0: number, x1: number, z1: number, height = 2): Box => ({
  min: { x: x0, y: 0, z: z0 },
  max: { x: x1, y: height, z: z1 },
});
const length = (path: readonly Vec3[]) =>
  path.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - path[i]!.x, p.z - path[i]!.z), 0);
const inside = (p: Vec3, b: Box) =>
  p.x > b.min.x && p.x < b.max.x && p.z > b.min.z && p.z < b.max.z;

const from = { x: -3, y: 0, z: 0 };
const to = { x: 3, y: 0, z: 0 };

describe('navigation', () => {
  it('goes straight across open ground', async () => {
    const nav = (await buildNavigation({ obstacles: [], include: [from, to] }))!;
    const path = nav.path(from, to)!;
    expect(path.length).toBe(2);
    expect(length(path)).toBeCloseTo(6, 1);
    nav.dispose();
  });

  it('goes round a wall in the way, keeping clear of it', async () => {
    const wall = box(-0.5, -2, 0.5, 2);
    const nav = (await buildNavigation({ obstacles: [wall], include: [from, to] }))!;
    const path = nav.path(from, to)!;
    expect(path.length).toBeGreaterThan(2);
    expect(length(path)).toBeGreaterThan(6.5);
    // Every corner is clear of the wall, by about a walker's width.
    const wider = box(-0.7, -2.2, 0.7, 2.2);
    for (const p of path) expect(inside(p, wider)).toBe(false);
    nav.dispose();
  });

  it('steps over something low, as it would a rug', async () => {
    const rug = box(-0.5, -2, 0.5, 2, 0.1);
    const nav = (await buildNavigation({ obstacles: [rug], include: [from, to] }))!;
    expect(nav.path(from, to)!.length).toBe(2);
    nav.dispose();
  });

  it('finds no way into a closed pen', async () => {
    const pen = [
      box(2, -1.5, 4, -1),
      box(2, 1, 4, 1.5),
      box(2, -1.5, 2.3, 1.5),
      box(3.7, -1.5, 4, 1.5),
    ];
    const nav = (await buildNavigation({ obstacles: pen, include: [from, to] }))!;
    expect(nav.path(from, to)).toBeNull();
    nav.dispose();
  });

  it('finds the same way every time', async () => {
    const area = { obstacles: [box(-0.5, -2, 0.5, 2)], include: [from, to] };
    const a = (await buildNavigation(area))!;
    const b = (await buildNavigation(area))!;
    expect(b.path(from, to)).toEqual(a.path(from, to));
    a.dispose();
    b.dispose();
  });
});

describe('a scene’s walkable area', () => {
  const at = (x: number): Transform => ({ ...IDENTITY, position: { x, y: 0, z: 0 } });
  const scene = (backdrop: SceneSetup['backdrop']): SceneSetup => ({
    backdrop,
    objects: [
      { id: objectId('ann'), model: { standIn: 'ann' }, class: 'Biped', transform: at(-3) },
      { id: objectId('bob'), model: { standIn: 'bob' }, class: 'Biped', transform: at(3) },
      // A crate stretched into a wall, 4 m across.
      {
        id: objectId('wall'),
        model: { standIn: 'wall' },
        class: 'Prop',
        transform: { ...at(0), scale: { x: 2, y: 2, z: 8 } },
      },
    ],
    camera: { transform: { ...IDENTITY, position: { x: 0, y: 1, z: -8 } } },
    markers: [],
  });
  const timeline = (backdrop: SceneSetup['backdrop'] = {}) => {
    const t = new Timeline();
    t.load(scene(backdrop), () => standInShape([]));
    return t;
  };

  it('is in the way of what stays put, not of the cast', () => {
    const area = timeline().navigationArea();
    expect(area.obstacles).toHaveLength(1);
    expect(area.obstacles[0]!.max.z).toBeCloseTo(2, 6);
    expect(area.include).toHaveLength(3);
    expect(area.bounds).toBeUndefined();
  });

  it('takes the cast round it', async () => {
    const nav = (await buildNavigation(timeline().navigationArea()))!;
    const path = nav.path({ x: -3, y: 0, z: 0 }, { x: 3, y: 0, z: 0 })!;
    expect(length(path)).toBeGreaterThan(6.5);
    nav.dispose();
  });

  it('stops at a room’s walls', () => {
    const room = BACKDROP_TEMPLATES.find((t) => t.id === 'room')!.backdrop;
    expect(timeline(room).navigationArea().bounds?.max.x).toBe(5);
  });
});
