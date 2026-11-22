import { describe, expect, it } from 'vitest';
import { Document, WebIO, type Node } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import sharp from 'sharp';
import {
  PALETTE,
  applyKitbash,
  kitbashProblems,
  recolour,
  type Cell,
  type Kitbash,
} from './kitbash.ts';
import { validateSources } from './sources.ts';

const io = new WebIO().registerExtensions(ALL_EXTENSIONS);
const W = 64;
const H = 32;
/** A palette texture of 8 × 4 cells, each a flat grey of its own: cell (c, r) is 10 + 8·(c + 8r). */
async function palette(): Promise<Uint8Array> {
  const data = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const c = Math.floor((x / W) * PALETTE.columns);
      const r = Math.floor((y / H) * PALETTE.rows);
      const g = 10 + 8 * (c + 8 * r);
      data.set([g, g, g, 255], (y * W + x) * 4);
    }
  return new Uint8Array(
    await sharp(data, { raw: { width: W, height: H, channels: 4 } })
      .png()
      .toBuffer(),
  );
}
/** The middle of a cell, as a texture coordinate. */
const at = ([c, r]: Cell) => [(c + 0.5) / PALETTE.columns, (r + 0.5) / PALETTE.rows];

/**
 * A tiny character: joints hips → chest → head, and a skinned "Head" mesh of three triangles, the
 * first two drawn in cell (1, 0) (an eyebrow high up, the hair low down), the third in cell (3, 0)
 * (an earring). A hat hangs on the head joint in another file.
 */
async function character(joints = ['hips', 'chest', 'head']): Promise<Document> {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene();
  const nodes: Node[] = joints.map((name, i) =>
    doc.createNode(name).setTranslation([0, i === 0 ? 0.4 : 0.4, 0]),
  );
  nodes.forEach((n, i) => (i ? nodes[i - 1]!.addChild(n) : scene.addChild(n)));
  const skin = doc.createSkin().setSkeleton(nodes[0]!);
  nodes.forEach((n) => skin.addJoint(n));
  skin.setInverseBindMatrices(
    doc
      .createAccessor()
      .setType('MAT4')
      .setArray(
        new Float32Array(joints.flatMap(() => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])),
      )
      .setBuffer(buffer),
  );
  const tris: [number[][], Cell][] = [
    [
      [
        [0, 1.7, 0.4],
        [0.1, 1.7, 0.4],
        [0.05, 1.8, 0.4],
      ],
      [1, 0],
    ], // eyebrow
    [
      [
        [0, 1.2, 0],
        [0.5, 1.2, 0],
        [0.25, 2.1, 0],
      ],
      [1, 0],
    ], // hair
    [
      [
        [0.5, 1.5, 0],
        [0.55, 1.5, 0],
        [0.52, 1.45, 0],
      ],
      [3, 0],
    ], // earring
  ];
  const pos = tris.flatMap(([p]) => p.flat());
  const uv = tris.flatMap(([, cell]) => [...at(cell), ...at(cell), ...at(cell)]);
  const n = tris.length * 3;
  const texture = doc
    .createTexture('palette')
    .setImage(await palette())
    .setMimeType('image/png');
  const prim = doc
    .createPrimitive()
    .setAttribute(
      'POSITION',
      doc.createAccessor().setType('VEC3').setArray(new Float32Array(pos)).setBuffer(buffer),
    )
    .setAttribute(
      'TEXCOORD_0',
      doc.createAccessor().setType('VEC2').setArray(new Float32Array(uv)).setBuffer(buffer),
    )
    .setAttribute(
      'JOINTS_0',
      doc
        .createAccessor()
        .setType('VEC4')
        .setArray(new Uint16Array(n * 4).map((_, i) => (i % 4 === 0 ? 2 : 0)))
        .setBuffer(buffer),
    )
    .setAttribute(
      'WEIGHTS_0',
      doc
        .createAccessor()
        .setType('VEC4')
        .setArray(new Float32Array(n * 4).map((_, i) => (i % 4 === 0 ? 1 : 0)))
        .setBuffer(buffer),
    )
    .setIndices(
      doc
        .createAccessor()
        .setType('SCALAR')
        .setArray(new Uint16Array([...Array(n).keys()]))
        .setBuffer(buffer),
    )
    .setMaterial(doc.createMaterial('palette').setBaseColorTexture(texture));
  scene.addChild(
    doc.createNode('Head').setMesh(doc.createMesh('Head').addPrimitive(prim)).setSkin(skin),
  );
  return doc;
}

/** Another character's file, with a skinned "Beard" and a "Hat" hung on its head joint. */
async function otherFile(joints?: string[]): Promise<Uint8Array> {
  const doc = await character(joints);
  const head = doc
    .getRoot()
    .listNodes()
    .find((n) => n.getName() === 'Head')!;
  head.setName('Beard');
  const hatPrim = head.getMesh()!.listPrimitives()[0]!.clone();
  const hat = doc
    .createNode('Hat')
    .setMesh(doc.createMesh('Hat').addPrimitive(hatPrim))
    .setTranslation([0, 0.5, 0]);
  // On the last joint: the head, on this skeleton.
  const last = (joints ?? ['hips', 'chest', 'head']).at(-1)!;
  doc
    .getRoot()
    .listNodes()
    .find((n) => n.getName() === last)!
    .addChild(hat);
  return io.writeBinary(doc);
}

const read = (bytes: Uint8Array) => io.readBinary(bytes);
const node = (doc: Document, name: string) =>
  doc
    .getRoot()
    .listNodes()
    .find((n) => n.getName() === name);
const bake = async (
  recipe: Kitbash,
  fetchPart = async (_: string): Promise<Uint8Array> => otherFile(),
) => read(await applyKitbash(await io.writeBinary(await character()), recipe, fetchPart));
const pixel = async (png: Uint8Array, [c, r]: Cell) => {
  const { data } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const x = Math.floor((c + 0.5) * (W / PALETTE.columns));
  const y = Math.floor((r + 0.5) * (H / PALETTE.rows));
  return [...data.subarray((y * W + x) * 4, (y * W + x) * 4 + 3)];
};

describe('kitbashProblems', () => {
  it('passes a recipe of every step, and names what is wrong in plain words', () => {
    const good: Kitbash = {
      parts: [{ path: 'Barbarian.glb', nodes: ['Barbarian_Head'] }],
      copy: [{ node: 'ArmLeft', name: 'ArmLeft2', turn: [0, 0, -10], bone: 'chest' }],
      trim: [{ node: 'Head', cell: [3, 0] }],
      thin: [
        {
          node: 'Head',
          cell: [1, 0],
          within: [
            [-1, 1.6, 0],
            [1, 1.9, 1],
          ],
          scale: 0.5,
        },
      ],
      recolour: [{ cells: [[0, 1]], hue: 350, saturation: 1, value: 0.9 }],
      add: [
        {
          name: 'Circlet',
          shape: 'ring',
          joint: 'head',
          at: [0, 0.6, 0],
          radius: 0.5,
          thickness: 0.03,
          cell: [1, 3],
        },
      ],
    };
    expect(kitbashProblems(good)).toEqual([]);
    expect(kitbashProblems({ paint: [] })).toEqual(['kitbash has no step called paint.']);
    expect(kitbashProblems({ recolour: [{ cells: [[8, 0]], hue: 400 }] })).toEqual([
      'kitbash.recolour[0].cells must list cells [column, row].',
      'kitbash.recolour[0].hue must be degrees, 0 to 359.',
    ]);
    expect(
      kitbashProblems({
        add: [
          { name: 'Hat', shape: 'ring', joint: 'head', at: [0, 0, 0], radius: 1, cell: [0, 0] },
        ],
      }),
    ).toEqual(['kitbash.add[0] (Hat): a ring needs a thickness.']);
    expect(
      kitbashProblems({
        recolour: [{ cells: [[0, 0]], colour: 'orange', hue: 30 }],
        add: [
          {
            name: 'Leg',
            shape: 'path',
            joint: 'chest',
            at: [0, 0, 0],
            radius: 0.1,
            bands: [[2, 3]],
          },
        ],
      }),
    ).toEqual([
      'kitbash.recolour[0].colour must be rrggbb.',
      'kitbash.recolour[0] takes a colour or a hue, not both.',
      'kitbash.add[0] (Leg): bands must list two or more cells [column, row].',
      'kitbash.add[0] (Leg): a path needs 2 to 32 points [x, y, z].',
    ]);
  });

  it('is checked with the source list, which wants a glTF base from GitHub', () => {
    const item = (fetch: unknown) => ({
      id: 'storybook/Biped/maid-marian',
      displayName: 'Maid Marian',
      class: 'Biped',
      section: 'cast',
      themes: ['storybook'],
      licence: 'CC0-1.0',
      credit: 'Maid Marian, made from Rogue by Kay Lousberg, KayKit (CC0)',
      page: 'https://kaylousberg.com/game-assets',
      fetch,
      kitbash: { trim: [{ node: 'Rogue_Head', cell: [3, 0] }] },
    });
    const github = { github: 'KayKit-Game-Assets/pack', commit: 'a'.repeat(40), path: 'Rogue.glb' };
    expect(validateSources({ source: 'storybook', items: [item(github)] }).ok).toBe(true);
    const fromUrl = validateSources({
      source: 'storybook',
      items: [item({ url: 'https://arweave.net/' + 'a'.repeat(43), ext: 'glb' })],
    });
    expect(fromUrl.ok ? [] : fromUrl.errors).toEqual([
      'items[0] (storybook/Biped/maid-marian): kitbash needs a glTF base fetched from GitHub, so its parts come from the same commit.',
    ]);
  });
});

describe('applyKitbash', () => {
  it('recolours only the cells named, keeping each one’s shading', async () => {
    const png = await recolour(await palette(), [{ cells: [[1, 0]], value: 2 }]);
    expect(await pixel(png, [1, 0])).toEqual([36, 36, 36]);
    expect(await pixel(png, [2, 0])).toEqual([26, 26, 26]);
    const doc = await bake({ recolour: [{ cells: [[1, 0]], value: 2 }] });
    expect(await pixel(doc.getRoot().listTextures()[0]!.getImage()!, [1, 0])).toEqual([36, 36, 36]);
  });

  it('gives a grey cell a colour outright, keeping its shading', async () => {
    const png = await recolour(await palette(), [{ cells: [[2, 0]], colour: 'ff8000' }]);
    // Grey 26 has no hue to turn; it becomes orange at its own brightness.
    expect(await pixel(png, [2, 0])).toEqual([26, 13, 0]);
    expect(await pixel(png, [3, 0])).toEqual([34, 34, 34]);
  });

  it('trims the triangles drawn in a cell (an earring), and nothing else', async () => {
    const doc = await bake({ trim: [{ node: 'Head', cell: [3, 0] }] });
    expect(node(doc, 'Head')!.getMesh()!.listPrimitives()[0]!.getIndices()!.getCount()).toBe(6);
  });

  it('trims only inside its box, when given one (a beard, not the hair it shares a cell with)', async () => {
    const box = [
      [-1, 1.6, 0.3],
      [1, 1.9, 0.6],
    ] as const;
    const doc = await bake({ trim: [{ node: 'Head', cell: [1, 0], within: box }] });
    const prim = node(doc, 'Head')!.getMesh()!.listPrimitives()[0]!;
    // The eyebrow (corners 0 to 2) is gone; the hair and the earring stay.
    expect([...prim.getIndices()!.getArray()!]).toEqual([3, 4, 5, 6, 7, 8]);
  });

  it('stripes a path in its bands, each stripe its own cell', async () => {
    const doc = await bake({
      add: [
        {
          name: 'Leg',
          shape: 'path',
          joint: 'chest',
          at: [0.2, 0.2, -0.3],
          radius: 0.07,
          points: [
            [0, 0, 0],
            [0.5, 0.6, 0],
            [1.2, 0.2, 0],
            [1.4, -1, 0],
          ],
          bands: [
            [2, 3],
            [3, 3],
          ],
          stripes: 6,
        },
      ],
    });
    const uv = node(doc, 'Leg')!.getMesh()!.listPrimitives()[0]!.getAttribute('TEXCOORD_0')!;
    const cells = new Set<string>();
    for (let i = 0; i < uv.getCount(); i++) {
      const [u, v] = uv.getElement(i, [] as number[]);
      cells.add(`${Math.floor(u! * PALETTE.columns)},${Math.floor(v! * PALETTE.rows)}`);
    }
    expect([...cells].sort()).toEqual(['2,3', '3,3']);
    expect(node(doc, 'Leg')!.getParentNode()?.getName()).toBe('chest');
  });

  it('thins an island inside its box toward its middle (an eyebrow), leaving the hair', async () => {
    const doc = await bake({
      thin: [
        {
          node: 'Head',
          cell: [1, 0],
          within: [
            [-1, 1.6, 0.3],
            [1, 1.9, 0.6],
          ],
          scale: 0.5,
        },
      ],
    });
    const pos = node(doc, 'Head')!.getMesh()!.listPrimitives()[0]!.getAttribute('POSITION')!;
    const ys = [0, 1, 2, 3, 4, 5].map((i) => +pos.getElement(i, [] as number[])[1]!.toFixed(3));
    expect(ys).toEqual([1.725, 1.725, 1.775, 1.2, 1.2, 2.1]);
  });

  it('hangs a shape on a joint, coloured from a cell of the character’s own texture', async () => {
    const doc = await bake({
      add: [
        {
          name: 'Circlet',
          shape: 'ring',
          joint: 'head',
          at: [0, 0.6, 0],
          turn: [-10, 0, 0],
          radius: 0.5,
          thickness: 0.03,
          cell: [1, 3],
        },
      ],
    });
    const circlet = node(doc, 'Circlet')!;
    expect(circlet.getParentNode()?.getName()).toBe('head');
    const prim = circlet.getMesh()!.listPrimitives()[0]!;
    expect(prim.getMaterial()!.getBaseColorTexture()).toBe(doc.getRoot().listTextures()[0]);
    const uv = prim.getAttribute('TEXCOORD_0')!;
    for (let i = 0; i < uv.getCount(); i++) {
      const [u, v] = uv.getElement(i, [] as number[]);
      expect([Math.floor(u! * PALETTE.columns), Math.floor(v! * PALETTE.rows)]).toEqual([1, 3]);
    }
  });

  it('copies a mesh with its own primitives, turned about a pivot and held by one joint', async () => {
    const doc = await bake({
      copy: [{ node: 'Head', name: 'Head2', pivot: [0, 1.2, 0], turn: [0, 0, 90], bone: 'chest' }],
    });
    const original = node(doc, 'Head')!.getMesh()!.listPrimitives()[0]!;
    const copy = node(doc, 'Head2')!.getMesh()!.listPrimitives()[0]!;
    expect(copy).not.toBe(original);
    // The original is as it was; the copy's hair tip, 0.9 above the pivot, now points along -x.
    expect(
      original
        .getAttribute('POSITION')!
        .getElement(5, [] as number[])
        .map((x) => +x.toFixed(3)),
    ).toEqual([0.25, 2.1, 0]);
    expect(
      copy
        .getAttribute('POSITION')!
        .getElement(5, [] as number[])
        .map((x) => +x.toFixed(3)),
    ).toEqual([-0.9, 1.45, 0]);
    expect(copy.getAttribute('JOINTS_0')!.getElement(0, [] as number[])).toEqual([1, 0, 0, 0]);
    expect(original.getAttribute('JOINTS_0')!.getElement(0, [] as number[])).toEqual([2, 0, 0, 0]);
  });

  it('brings parts from another file: skinned ones bound to this skeleton, hats hung on its joint', async () => {
    const asked: string[] = [];
    const doc = await bake(
      { parts: [{ path: 'Barbarian.glb', nodes: ['Beard', 'Hat'] }] },
      async (p) => {
        asked.push(p);
        return otherFile();
      },
    );
    expect(asked).toEqual(['Barbarian.glb']);
    const skin = node(doc, 'Head')!.getSkin();
    expect(node(doc, 'Beard')!.getSkin()).toBe(skin);
    expect(node(doc, 'Hat')!.getParentNode()?.getName()).toBe('head');
    expect(doc.getRoot().listBuffers()).toHaveLength(1);
    expect(doc.getRoot().listTextures()).toHaveLength(2);
  });

  it('refuses a part on another skeleton, and a node or joint that isn’t there', async () => {
    await expect(
      bake({ parts: [{ path: 'Other.glb', nodes: ['Beard'] }] }, async () =>
        otherFile(['root', 'spine', 'neck']),
      ),
    ).rejects.toThrow("kitbash: Other.glb's skeleton isn't this character's.");
    await expect(bake({ trim: [{ node: 'Tail', cell: [0, 0] }] })).rejects.toThrow(
      'kitbash: the model has no node called Tail.',
    );
  });
});
