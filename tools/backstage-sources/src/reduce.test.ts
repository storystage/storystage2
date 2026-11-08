import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { Document, WebIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { ITEM_BUDGETS, validateManifest } from '@storystage/backstage';
import { buildSources } from './build.ts';
import { sharpEncoder } from './sharp-encoder.ts';
import type { Fetcher } from './fetch.ts';

const COMMIT = 'b'.repeat(40);
const URL_ = `https://raw.githubusercontent.com/pack/props/${COMMIT}/rock.glb`;

/** A textured sphere of 40,000 triangles with a 2048-pixel picture: far over a prop's budget. */
async function heavyRock(): Promise<Uint8Array> {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const [rings, segments] = [100, 200];
  const positions: number[] = [];
  const uvs: number[] = [];
  for (let r = 0; r <= rings; r++)
    for (let s = 0; s <= segments; s++) {
      const phi = (Math.PI * r) / rings;
      const theta = (2 * Math.PI * s) / segments;
      positions.push(
        Math.sin(phi) * Math.cos(theta),
        Math.cos(phi) + 1,
        Math.sin(phi) * Math.sin(theta),
      );
      uvs.push(s / segments, r / rings);
    }
  const indices: number[] = [];
  const at = (r: number, s: number) => r * (segments + 1) + s;
  for (let r = 0; r < rings; r++)
    for (let s = 0; s < segments; s++)
      indices.push(
        at(r, s),
        at(r + 1, s),
        at(r, s + 1),
        at(r, s + 1),
        at(r + 1, s),
        at(r + 1, s + 1),
      );
  // A picture with real variation in it: a texture of one solid colour is rightly replaced by a
  // plain colour on the material when the model is cleaned up.
  const side = 2048;
  const pixels = new Uint8Array(side * side * 3);
  for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 7919) % 251;
  const picture = await sharp(pixels, { raw: { width: side, height: side, channels: 3 } })
    .png()
    .toBuffer();
  const texture = doc
    .createTexture('rock')
    .setImage(new Uint8Array(picture))
    .setMimeType('image/png');
  const prim = doc
    .createPrimitive()
    .setAttribute(
      'POSITION',
      doc.createAccessor().setType('VEC3').setArray(new Float32Array(positions)).setBuffer(buffer),
    )
    .setAttribute(
      'TEXCOORD_0',
      doc.createAccessor().setType('VEC2').setArray(new Float32Array(uvs)).setBuffer(buffer),
    )
    .setIndices(
      doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(indices)).setBuffer(buffer),
    )
    .setMaterial(doc.createMaterial('rock').setBaseColorTexture(texture));
  const node = doc.createNode('rock').setMesh(doc.createMesh('rock').addPrimitive(prim));
  doc.getRoot().setDefaultScene(doc.createScene().addChild(node));
  return new WebIO().writeBinary(doc);
}

let dir: string;
let rock: Uint8Array;
const fetcher: Fetcher = async (url) => {
  if (url !== URL_) throw new Error(`404 ${url}`);
  return rock;
};

beforeAll(async () => {
  rock = await heavyRock();
  dir = await mkdtemp(join(tmpdir(), 'backstage-reduce-'));
  await mkdir(join(dir, 'sources'));
  await writeFile(
    join(dir, 'sources/props.json'),
    JSON.stringify({
      source: 'pack',
      items: [
        {
          id: 'pack/Prop/rock',
          displayName: 'Rock',
          class: 'Prop',
          section: 'props',
          themes: ['outdoors'],
          licence: 'CC0-1.0',
          credit: 'Rock by a tester (CC0)',
          page: 'https://github.com/pack/props',
          fetch: { github: 'pack/props', commit: COMMIT, path: 'rock.glb' },
        },
      ],
    }),
  );
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('reduceModel with real pictures', () => {
  it('turns a texture of one solid colour into a plain colour on the material', async () => {
    const doc = new Document();
    const buffer = doc.createBuffer();
    const solid = await sharp({
      create: { width: 512, height: 512, channels: 3, background: { r: 255, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();
    const texture = doc
      .createTexture('red')
      .setImage(new Uint8Array(solid))
      .setMimeType('image/png');
    const material = doc.createMaterial('red').setBaseColorTexture(texture);
    const prim = doc
      .createPrimitive()
      .setAttribute(
        'POSITION',
        doc
          .createAccessor()
          .setType('VEC3')
          .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
          .setBuffer(buffer),
      )
      .setMaterial(material);
    const node = doc.createNode('n').setMesh(doc.createMesh('m').addPrimitive(prim));
    doc.getRoot().setDefaultScene(doc.createScene().addChild(node));
    const { reduceModel } = await import('@storystage/backstage/optimize');
    const report = await reduceModel(doc, ITEM_BUDGETS.props, { encodeTexture: sharpEncoder });
    expect(doc.getRoot().listTextures()).toHaveLength(0);
    expect(material.getBaseColorFactor().slice(0, 3)).toEqual([1, 0, 0]);
    expect(report.after.textureMaxPx).toBe(0);
  });
});

describe('buildSources reduces every glTF model to its budget', () => {
  it('simplifies it, shrinks its picture to WebP, and records before and after', async () => {
    const report = await buildSources(dir, { fetcher, today: '2026-11-07' });
    const budget = ITEM_BUDGETS.props;
    const p = report.provenance['pack/Prop/rock']!;
    expect(p.fetchedSize).toEqual({ triangles: 40_000, textureMaxPx: 2048 });
    expect(p.triangles).toBeLessThanOrEqual(budget.triangles);
    expect(p.textureMaxPx).toBe(budget.textureMaxPx);
    expect(p.fitsBudget).toBe(true);

    const manifest = JSON.parse(await readFile(join(dir, 'backstage.json'), 'utf8'));
    expect(validateManifest(manifest).ok).toBe(true);
    expect(manifest.items[0].budget).toEqual({ triangles: p.triangles, textureMaxPx: 1024 });

    const doc = await new WebIO()
      .registerExtensions(ALL_EXTENSIONS)
      .readBinary(await readFile(join(dir, 'models/pack/Prop/rock.glb')));
    expect(doc.getRoot().listTextures()[0]!.getMimeType()).toBe('image/webp');
    expect(
      doc
        .getRoot()
        .listExtensionsUsed()
        .map((e) => e.extensionName),
    ).toContain('EXT_texture_webp');

    const md = await readFile(join(dir, 'sources-report.md'), 'utf8');
    expect(md).toContain(`| 40000 → ${p.triangles} | 2048 → 1024 | yes |`);
  });
});
