import { describe, expect, it } from 'vitest';
import { WebIO } from '@gltf-transform/core';
import { MANIFEST_VERSION, validateManifest } from '@storystage/backstage';
import type { TextureEncoder } from '@storystage/backstage/optimize';
import {
  box,
  documentFromMesh,
  figure,
  glbFromMesh,
  vrmFromMesh,
} from '@storystage/sketches/testing';
import { splitGlb } from './checks.ts';
import { classModelId, importModel, type ImportChoices, type ImportTools } from './import.ts';

const text = (s: string) => new TextEncoder().encode(s);

/** A PNG header of the given size: all the checks and the reducer read. */
function png(w: number, h: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, w);
  new DataView(b.buffer).setUint32(20, h);
  return b;
}

/** Stand-ins for the browser's canvas: PNG pictures of the size asked for, as Safari makes. */
const encodeTexture: TextureEncoder = async (_image, _mime, maxPx, size) => {
  const scale = Math.min(1, maxPx / Math.max(...size));
  return {
    bytes: png(Math.round(size[0] * scale), Math.round(size[1] * scale)),
    mimeType: 'image/png',
  };
};
const tools: ImportTools = {
  encodeTexture,
  encodeThumbnail: async (picture) => ({
    bytes: new Uint8Array([picture.width & 255]),
    mimeType: 'image/webp',
  }),
};

const prop: ImportChoices = {
  section: 'props',
  class: 'Prop',
  name: 'Robot',
  licence: { choice: 'CC BY', sourceUrl: 'https://example.org/robot', maker: 'A. Maker' },
};
const person: ImportChoices = {
  section: 'cast',
  class: 'Biped',
  name: 'Pip',
  licence: { choice: 'own-work' },
};

const picked = (files: Record<string, Uint8Array>) => new Map(Object.entries(files));

async function imported(files: Record<string, Uint8Array>, choices: ImportChoices) {
  const r = await importModel(picked(files), choices, tools);
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r;
}

const fileNames = (r: { files: readonly { path: string }[] }) => r.files.map((f) => f.path);

describe('importModel (spec 17, section 5)', () => {
  it('imports a prop: a record the manifest accepts, its files, and a report', async () => {
    const r = await imported(
      { 'robot.glb': await glbFromMesh(box([0, 0, 0], [0.5, 1.2, 0.5])) },
      prop,
    );
    expect(r.item).toMatchObject({
      id: 'class/Prop/robot',
      section: 'props',
      class: 'Prop',
      displayName: 'Robot',
      files: { model: 'model.glb', thumbnail: 'thumbnail.webp' },
      joints: 'prop-only',
      defaultSize: { height: 1.2 },
      budget: { triangles: 12, textureMaxPx: 0 },
      licence: 'CC-BY-4.0',
      credit: 'Robot by A. Maker, CC BY 4.0, changed for StoryStage',
      source: { url: 'https://example.org/robot' },
      origin: 'imported',
    });
    expect(r.item).not.toHaveProperty('vrm');
    expect(validateManifest({ manifestVersion: MANIFEST_VERSION, items: [r.item] }).ok).toBe(true);
    expect(fileNames(r)).toEqual([
      'model.glb',
      'thumbnail.webp',
      'sketches/front.svg',
      'sketches/threeQuarter.svg',
      'sketches/side.svg',
      'sketches/back.svg',
    ]);
    // Every file the record names is among the files, and nothing else is.
    const named = [
      r.item.files.model,
      r.item.files.thumbnail,
      ...r.item.sketches.map((s) => s.file),
    ];
    expect(new Set(named)).toEqual(new Set(fileNames(r)));
    expect(r.report.lines).toEqual([
      '12 triangles: no simplifying needed.',
      "It's 1.2 metres tall.",
      'Credit: "Robot by A. Maker, CC BY 4.0, changed for StoryStage".',
    ]);
    expect(r.report.skeleton).toBeNull();
  });

  it('maps a character’s skeleton, and draws it in its poses', async () => {
    const r = await imported({ 'pip.glb': await glbFromMesh(figure()) }, person);
    expect(Array.isArray(r.item.joints)).toBe(true);
    expect(r.report.skeleton).toMatchObject({ status: 'mapped' });
    expect(r.report.lines).toContainEqual(
      expect.stringMatching(/^Skeleton mapped: \d+ of \d+ joints/),
    );
    expect(r.item.sketches.some((s) => s.pose === 'walk')).toBe(true);
    expect(r.item.credit).toBe('Pip, made by our class');
  });

  it('says a character missing joints is prop only, naming what it lacks', async () => {
    const legless = figure();
    const doc = documentFromMesh(legless);
    for (const n of doc.getRoot().listNodes())
      if (/Leg|Foot/.test(n.getName())) n.setName(`Stick${n.getName().length}`);
    const r = await imported({ 'pip.glb': await new WebIO().writeBinary(doc) }, person);
    expect(r.item.joints).toBe('prop-only');
    expect(r.report.skeleton).toMatchObject({ status: 'prop-only' });
    expect(r.report.lines).toContainEqual(
      expect.stringMatching(
        /^Prop only: it can move and turn, but not walk or gesture\. Its skeleton has no /,
      ),
    );
  });

  it('saves a VRM 0.x avatar as an ordinary glTF, turned to face the front', async () => {
    const r = await imported({ 'pip.vrm': await vrmFromMesh(figure(), '0') }, person);
    expect(r.item).not.toHaveProperty('vrm');
    expect(r.item.files.model).toBe('model.glb');
    const split = splitGlb(r.files[0]!.bytes);
    if (!split.ok) throw new Error('not a .glb');
    const json = split.json as { extensions?: object; nodes: { name?: string }[] };
    expect(json.extensions ?? {}).not.toHaveProperty('VRM');
    // Bones named from the VRM's own table, so the stage maps them as it maps any model.
    expect(json.nodes.map((n) => n.name)).toContain('leftUpperLeg');
    expect(json.nodes.map((n) => n.name)).toContain('storystage-face-plus-z');
    expect(r.report.lines).toContain('Turned round to face the front, as StoryStage models do.');
    expect(r.report.skeleton).toMatchObject({ status: 'mapped' });
  });

  it('reads a VRM 1.0 avatar without turning it', async () => {
    const r = await imported({ 'pip.vrm': await vrmFromMesh(figure(), '1') }, person);
    expect(r.report.lines.join(' ')).not.toMatch(/Turned round/);
    expect(r.report.skeleton).toMatchObject({ status: 'mapped' });
  });

  it('simplifies an OBJ over its budget, and reports what the reader left out', async () => {
    const n = 80; // 80 x 80 squares: 12,800 triangles, over a prop's 8,000
    const lines = ['s 1'];
    for (let y = 0; y <= n; y++) for (let x = 0; x <= n; x++) lines.push(`v ${x / n} 0 ${y / n}`);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const a = y * (n + 1) + x + 1;
        lines.push(`f ${a} ${a + 1} ${a + n + 2} ${a + n + 1}`);
      }
    const r = await imported({ 'mat.obj': text(lines.join('\n')) }, { ...prop, name: 'Mat' });
    expect(r.report.triangles.before).toBe(12_800);
    expect(r.report.triangles.after).toBeLessThanOrEqual(8_000);
    expect(r.report.lines[0]).toMatch(/^Simplified from 12,800 to [\d,]+ triangles\.$/);
    expect(r.report.lines).toContain('Left out of the file: smoothing groups.');
  });

  it('reads a .gltf with its .bin and picture, and makes the picture fit its budget', async () => {
    const doc = documentFromMesh(box([0, 0, 0], [1, 1, 1]));
    const texture = doc.createTexture('skin').setImage(png(4096, 2048)).setMimeType('image/png');
    texture.setURI('skin.png');
    doc
      .getRoot()
      .listMeshes()[0]!
      .listPrimitives()[0]!
      .setMaterial(doc.createMaterial('skin').setBaseColorTexture(texture));
    doc.getRoot().listBuffers()[0]!.setURI('box.bin');
    const { json, resources } = await new WebIO().writeJSON(doc);
    const r = await imported(
      {
        'box.gltf': text(JSON.stringify(json)),
        'box.bin': resources['box.bin']!,
        'skin.png': resources['skin.png']!,
      },
      { ...prop, name: 'Box' },
    );
    expect(r.report.textureMaxPx).toEqual({ before: 4096, after: 1024 });
    expect(r.report.lines).toContain('Pictures made smaller, from 4,096 to 1,024 pixels across.');
    expect(r.item.budget.textureMaxPx).toBe(1024);
  });

  it('flags a model that must stay in school', async () => {
    const r = await imported(
      { 'robot.glb': await glbFromMesh(box([0, 0, 0], [1, 1, 1])) },
      { ...prop, licence: { choice: 'not-sure', sourceUrl: 'https://example.org/r' } },
    );
    expect(r.report.staysInClass).toMatch(/shown in school but not shared outside it/);
    expect(r.report.lines).toContain("It's 1 metre tall.");
    expect(r.report.lines.at(-1)).toBe(r.report.staysInClass);
  });
});

describe('importModel refuses, in plain words', () => {
  it('a licence step that isn’t finished, before reading anything', async () => {
    const r = await importModel(
      picked({ 'x.fbx': new Uint8Array() }),
      {
        ...prop,
        licence: { choice: 'CC BY' },
      },
      tools,
    );
    expect(r).toEqual({ ok: false, licence: ['needsMaker', 'needsSource'] });
  });

  it('files it can’t import, and models that ask for files from elsewhere', async () => {
    expect(await importModel(picked({ 'x.fbx': new Uint8Array() }), prop, tools)).toMatchObject({
      problems: [{ code: 'fbx' }],
    });
    const remote = { asset: { version: '2.0' }, images: [{ uri: 'https://example.org/skin.png' }] };
    expect(
      await importModel(picked({ 'x.gltf': text(JSON.stringify(remote)) }), prop, tools),
    ).toMatchObject({ problems: [{ code: 'remoteFile' }] });
  });

  it('a picture inside a .glb that is too big, from its header', async () => {
    const doc = documentFromMesh(box([0, 0, 0], [1, 1, 1]));
    const texture = doc
      .createTexture('skin')
      .setImage(png(20_000, 20_000))
      .setMimeType('image/png');
    doc
      .getRoot()
      .listMeshes()[0]!
      .listPrimitives()[0]!
      .setMaterial(doc.createMaterial('skin').setBaseColorTexture(texture));
    const r = await importModel(
      picked({ 'x.glb': await new WebIO().writeBinary(doc) }),
      prop,
      tools,
    );
    expect(r).toMatchObject({ ok: false, problems: [{ code: 'pictureTooBig' }] });
  });

  it('a .glb whose accessors claim more than its buffer holds', async () => {
    const glb = await glbFromMesh(box([0, 0, 0], [1, 1, 1]));
    const split = splitGlb(glb);
    if (!split.ok) throw new Error('not a .glb');
    const json = split.json as { accessors: { count: number }[] };
    json.accessors[0]!.count = 1_000;
    const { glbFromJSON } = await import('@storystage/sketches/testing');
    const r = await importModel(picked({ 'x.glb': glbFromJSON(json, split.bin!) }), prop, tools);
    expect(r).toMatchObject({ ok: false, problems: [{ code: 'damaged' }] });
  });
});

describe('classModelId', () => {
  it('makes class/<Class>/<name>, never one already used', () => {
    expect(classModelId('Prop', 'Big Red Robot!', new Set())).toBe('class/Prop/big-red-robot');
    expect(classModelId('Prop', 'Café', new Set())).toBe('class/Prop/cafe');
    expect(classModelId('Prop', '***', new Set())).toBe('class/Prop/model');
    const taken = new Set(['class/Prop/robot', 'class/Prop/robot-2']);
    expect(classModelId('Prop', 'Robot', taken)).toBe('class/Prop/robot-3');
  });

  it('stays quick and plain whatever the name (no slow matching)', () => {
    const started = Date.now();
    expect(classModelId('Prop', '-'.repeat(100_000), new Set())).toBe('class/Prop/model');
    expect(classModelId('Prop', `a${'-'.repeat(50_000)}b`, new Set())).toBe('class/Prop/a');
    expect(classModelId('Prop', 'x'.repeat(39) + ' yz', new Set())).toBe(
      `class/Prop/${'x'.repeat(39)}`,
    );
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
