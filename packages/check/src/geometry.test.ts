import { IDENTITY, type Quat, type Transform } from '@storystage/story-api';
import { describe, expect, it } from 'vitest';
import { facing, heightOnPicture, project } from './geometry.ts';

/** Alice's default lens: 0.5 radians, in turns. */
const LENS = 0.5 / (2 * Math.PI);

/** A turn about the vertical, in turns: 0.5 is half a turn. */
const aboutY = (turns: number): Quat => ({
  x: 0,
  y: Math.sin(turns * Math.PI),
  z: 0,
  w: Math.cos(turns * Math.PI),
});

const at = (x: number, y: number, z: number, rotation: Quat = IDENTITY.rotation): Transform => ({
  ...IDENTITY,
  position: { x, y, z },
  rotation,
});

describe('project', () => {
  it("puts the camera's +X on the left of the picture, and -X on the right", () => {
    const camera = at(0, 0, 0);
    const left = project(camera, LENS, { x: 0.5, y: 0, z: 5 });
    const right = project(camera, LENS, { x: -0.5, y: 0, z: 5 });
    expect(left.x).toBeLessThan(0.5);
    expect(right.x).toBeGreaterThan(0.5);
    expect(project(camera, LENS, { x: 0, y: 0, z: 5 })).toMatchObject({ x: 0.5, y: 0.5 });
  });

  it('puts higher things nearer the top of the picture', () => {
    expect(project(at(0, 0, 0), LENS, { x: 0, y: 1, z: 5 }).y).toBeLessThan(0.5);
  });

  it('says a point is on screen only when it is in front, inside the picture and nearer than 256 m', () => {
    const camera = at(0, 0, 0);
    expect(project(camera, LENS, { x: 0, y: 0, z: 5 }).onScreen).toBe(true);
    expect(project(camera, LENS, { x: 0, y: 0, z: -5 }).onScreen).toBe(false);
    expect(project(camera, LENS, { x: 50, y: 0, z: 5 }).onScreen).toBe(false);
    expect(project(camera, LENS, { x: 0, y: 0, z: 300 }).onScreen).toBe(false);
  });

  it('follows a turned camera', () => {
    // Turned half a turn, the camera looks along -Z: a point at z = -5 is in front of it.
    const camera = at(0, 0, 0, aboutY(0.5));
    expect(project(camera, LENS, { x: 0, y: 0, z: -5 }).onScreen).toBe(true);
    // And its +X is now the world's -X, still on the picture's left.
    expect(project(camera, LENS, { x: -0.5, y: 0, z: -5 }).x).toBeLessThan(0.5);
  });

  it('is wider than tall, as a 16:9 picture is', () => {
    const camera = at(0, 0, 0);
    // The same distance off the middle reaches less far across than up.
    const across = Math.abs(project(camera, LENS, { x: 1, y: 0, z: 5 }).x - 0.5);
    const up = Math.abs(project(camera, LENS, { x: 0, y: 1, z: 5 }).y - 0.5);
    expect(across).toBeLessThan(up);
  });
});

describe('facing', () => {
  const camera = at(0, 1, 0);
  it("is 'back' when the character faces the way the camera looks, and 'front' when it faces the camera", () => {
    expect(facing(at(0, 0, 5), camera).view).toBe('back');
    expect(facing(at(0, 0, 5, aboutY(0.5)), camera).view).toBe('front');
  });

  it("is 'threeQuarter' between, and 'side' across", () => {
    expect(facing(at(0, 0, 5, aboutY(0.5 + 0.125)), camera).view).toBe('threeQuarter');
    expect(facing(at(0, 0, 5, aboutY(0.25)), camera).view).toBe('side');
  });

  it('says which way a side view faces on the picture', () => {
    // A quarter turn takes +Z to +X, which is the picture's left.
    expect(facing(at(0, 0, 5, aboutY(0.25)), camera).towards).toBe('left');
    expect(facing(at(0, 0, 5, aboutY(-0.25)), camera).towards).toBe('right');
  });
});

describe('heightOnPicture', () => {
  it('is the share of the picture a character of this height fills at this distance', () => {
    const near = heightOnPicture(1.8, 2, LENS);
    const far = heightOnPicture(1.8, 20, LENS);
    expect(near).toBeGreaterThan(far * 9);
    // 1.8 m at 2 m, with a 0.5 radian lens: 1.8 / (2 × 2 × tan 0.25) ≈ 1.76, more than the picture.
    expect(near).toBeCloseTo(1.8 / (2 * 2 * Math.tan(0.25)), 5);
  });
});
