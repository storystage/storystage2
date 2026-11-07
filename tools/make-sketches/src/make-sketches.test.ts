import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MANIFEST_VERSION, validateManifest } from '@storystage/backstage';
import { box, figure, glbFromMesh } from '@storystage/sketches/testing';
import { makeSketches } from './make-sketches.ts';

const item = (id: string, section: string, cls: string, displayName: string, model: string) => ({
  id,
  section,
  class: cls,
  displayName,
  themes: [],
  files: { model, thumbnail: `thumbs/${id}.webp` },
  joints: 'prop-only',
  defaultSize: { height: 1 },
  licence: 'CC0-1.0',
  credit: `${displayName} by a tester (CC0)`,
  source: { url: 'https://example.org/model' },
  origin: 'shipped',
  sketches: [],
});

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'make-sketches-'));
  await mkdir(join(dir, 'models'));
  await writeFile(join(dir, 'models/robot.glb'), await glbFromMesh(figure()));
  await writeFile(join(dir, 'models/crate.glb'), await glbFromMesh(box([0, 0, 0], [1, 1, 1])));
  await writeFile(
    join(dir, 'models/sign.glb'),
    await glbFromMesh(box([-0.5, 0, 0], [0.5, 1, 0.005])),
  );
  await writeFile(
    join(dir, 'backstage.json'),
    JSON.stringify({
      manifestVersion: MANIFEST_VERSION,
      items: [
        item('test/Biped/robot', 'cast', 'Biped', 'Robot', 'models/robot.glb'),
        item('test/Prop/crate', 'props', 'Prop', 'Crate', 'models/crate.glb'),
        item('test/Prop/sign', 'props', 'Billboard', 'Sign', 'models/sign.glb'),
        item('test/Ground/forest', 'backdrops', 'Ground', 'Forest floor', 'models/none.glb'),
      ],
    }),
  );
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('makeSketches', () => {
  it('draws every sketch, records them in the manifest and lists what to touch up', async () => {
    const report = await makeSketches(dir);
    expect(report.written).toBe(16 + 4 + 4 + 1);
    expect(report.unposed).toEqual([]);
    // The sign is a sliver from the side and the back is fine.
    expect(report.flagged.map((f) => f.file)).toEqual(['sketches/test/Prop/sign/side.svg']);

    const manifest = JSON.parse(await readFile(join(dir, 'backstage.json'), 'utf8'));
    expect(validateManifest(manifest).ok).toBe(true);
    const robot = manifest.items[0];
    expect(robot.sketches).toHaveLength(16);
    expect(robot.sketches).toContainEqual({
      facing: 'side',
      pose: 'walk',
      file: 'sketches/test/Biped/robot/side-walk.svg',
    });
    expect(robot.sketches[0]).toEqual({
      facing: 'front',
      file: 'sketches/test/Biped/robot/front.svg',
    });

    const svg = await readFile(join(dir, 'sketches/test/Biped/robot/side-walk.svg'), 'utf8');
    expect(svg).toContain('data-backstage-id="test/Biped/robot"');
    expect(svg).toContain('<title>Robot, side, walking</title>');
    const forest = await readFile(join(dir, 'sketches/test/Ground/forest/backdrop.svg'), 'utf8');
    expect(forest).toContain('data-sketch-id="backdrop/trees"');
    expect(forest).toContain('data-backstage-id="test/Ground/forest"');

    const list = await readFile(join(dir, 'sketches/touch-up.md'), 'utf8');
    expect(list).toContain('`sketches/test/Prop/sign/side.svg`');
    expect(list).toMatch(/hard to see/);
  });

  it('uses hand-drawn replacements named in touch-up.json', async () => {
    await writeFile(join(dir, 'sketches/sign-side.svg'), '<svg data-hand="yes"></svg>');
    await writeFile(
      join(dir, 'sketches/touch-up.json'),
      JSON.stringify({
        overrides: { 'sketches/test/Prop/sign/side.svg': 'sketches/sign-side.svg' },
        backdrops: { 'test/Ground/forest': 'backdrop/hills' },
      }),
    );
    const report = await makeSketches(dir);
    expect(report.flagged).toEqual([]);
    expect(report.overridden).toEqual([
      'sketches/test/Prop/sign/side.svg',
      'sketches/test/Ground/forest/backdrop.svg',
    ]);
    expect(await readFile(join(dir, 'sketches/test/Prop/sign/side.svg'), 'utf8')).toContain(
      'data-hand="yes"',
    );
    expect(await readFile(join(dir, 'sketches/test/Ground/forest/backdrop.svg'), 'utf8')).toContain(
      'backdrop/hills',
    );
  });

  it('writes nothing on a dry run', async () => {
    const before = await readFile(join(dir, 'backstage.json'), 'utf8');
    await rm(join(dir, 'sketches/test/Prop/crate'), { recursive: true });
    const report = await makeSketches(dir, { write: false });
    expect(report.written).toBe(25);
    expect(existsSync(join(dir, 'sketches/test/Prop/crate/front.svg'))).toBe(false);
    expect(await readFile(join(dir, 'backstage.json'), 'utf8')).toBe(before);
  });

  it('refuses a manifest that does not validate', async () => {
    const bad = await mkdtemp(join(tmpdir(), 'make-sketches-bad-'));
    await writeFile(
      join(bad, 'backstage.json'),
      JSON.stringify({ manifestVersion: '0', items: [] }),
    );
    await expect(makeSketches(bad)).rejects.toThrow(/not valid/);
    await rm(bad, { recursive: true, force: true });
  });
});
