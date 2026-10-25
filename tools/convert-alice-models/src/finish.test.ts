import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { meshFromDocument } from '@storystage/sketches';
import { box, documentFromMesh } from '@storystage/sketches/testing';
import { finishAliceModels } from './finish.ts';

const ALICE_QUADRUPED = [
  'ROOT',
  'SPINE_BASE',
  'SPINE_MIDDLE',
  'SPINE_UPPER',
  'NECK',
  'HEAD',
  'MOUTH',
  'FRONT_LEFT_CLAVICLE',
  'FRONT_LEFT_SHOULDER',
  'FRONT_LEFT_KNEE',
  'FRONT_RIGHT_CLAVICLE',
  'FRONT_RIGHT_SHOULDER',
  'FRONT_RIGHT_KNEE',
  'PELVIS_LOWER_BODY',
  'BACK_LEFT_HIP',
  'BACK_LEFT_KNEE',
  'BACK_RIGHT_HIP',
  'BACK_RIGHT_KNEE',
];

let dir: string;
const io = new NodeIO();
const zRange = async (file: string) => {
  const m = meshFromDocument(await io.read(file));
  const zs = Array.from({ length: m.positions.length / 3 }, (_, i) => m.positions[i * 3 + 2]!);
  return [Math.min(...zs), Math.max(...zs)].map((z) => Math.round(z * 100) / 100);
};

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'alice-finish-'));
  await mkdir(join(dir, 'Quadruped/Cat'), { recursive: true });
  await mkdir(join(dir, 'Prop/Crate'), { recursive: true });
  // Alice models face -Z: this one's "nose" box is at z -1 to -0.5.
  await io.write(
    join(dir, 'Quadruped/Cat/Cat_DEFAULT.glb'),
    documentFromMesh(box([0, 0, -1], [1, 1, -0.5])),
  );
  await io.write(
    join(dir, 'Prop/Crate/Crate_DEFAULT.glb'),
    documentFromMesh(box([0, 0, -1], [1, 1, 0])),
  );
  await writeFile(
    join(dir, 'conversion-report.json'),
    JSON.stringify({
      models: [
        {
          key: 'Quadruped/Cat',
          variant: 'DEFAULT',
          file: 'Quadruped/Cat/Cat_DEFAULT.glb',
          bytes: 1,
          joints: ALICE_QUADRUPED,
          error: null,
        },
        {
          key: 'Prop/Crate',
          variant: 'DEFAULT',
          file: 'Prop/Crate/Crate_DEFAULT.glb',
          bytes: 1,
          joints: [],
          error: null,
        },
        {
          key: 'Prop/Bamboo',
          variant: 'THICKET',
          file: null,
          bytes: 0,
          joints: [],
          error: "skipped: drawn from The Sims 2's art (WP17.7)",
        },
      ],
    }),
  );
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('finishAliceModels', () => {
  it('turns each model to face +Z, once, however often it runs', async () => {
    expect(await zRange(join(dir, 'Quadruped/Cat/Cat_DEFAULT.glb'))).toEqual([-1, -0.5]);
    await finishAliceModels(dir);
    expect(await zRange(join(dir, 'Quadruped/Cat/Cat_DEFAULT.glb'))).toEqual([0.5, 1]);
    await finishAliceModels(dir);
    expect(await zRange(join(dir, 'Quadruped/Cat/Cat_DEFAULT.glb'))).toEqual([0.5, 1]);
  });

  it('records class, section, joints, size and problems for each variant', async () => {
    const summary = await finishAliceModels(dir);
    expect(summary.models).toEqual([
      expect.objectContaining({
        key: 'Quadruped/Cat',
        variant: 'DEFAULT',
        storyClass: 'Quadruped',
        section: 'cast',
        triangles: 12,
        textureMaxPx: 0,
        skeleton: 'mapped',
        missingJoints: [],
      }),
      expect.objectContaining({
        key: 'Prop/Crate',
        storyClass: 'Prop',
        section: 'props or set',
        skeleton: 'none',
      }),
      expect.objectContaining({
        key: 'Prop/Bamboo',
        problem: "skipped: drawn from The Sims 2's art (WP17.7)",
      }),
    ]);
    const written = JSON.parse(await readFile(join(dir, 'alice-models.json'), 'utf8'));
    expect(written.models).toHaveLength(3);
    const md = await readFile(join(dir, 'conversion-report.md'), 'utf8');
    expect(md).toContain('| `Quadruped/Cat` | DEFAULT | Quadruped | cast | 12 |');
    expect(md).toMatch(/Not to be published until the licence audit clears/);
  });

  it('marks a character whose skeleton does not map as prop only, with what is missing', async () => {
    await writeFile(
      join(dir, 'conversion-report.json'),
      JSON.stringify({
        models: [
          {
            key: 'Quadruped/Cat',
            variant: 'DEFAULT',
            file: 'Quadruped/Cat/Cat_DEFAULT.glb',
            bytes: 1,
            joints: ALICE_QUADRUPED.filter((j) => !j.startsWith('BACK_')),
            error: null,
          },
        ],
      }),
    );
    const [cat] = (await finishAliceModels(dir)).models;
    expect(cat!.skeleton).toBe('prop-only');
    expect(cat!.missingJoints).toEqual([
      'backLeftHip',
      'backLeftKnee',
      'backRightHip',
      'backRightKnee',
    ]);
  });
});
