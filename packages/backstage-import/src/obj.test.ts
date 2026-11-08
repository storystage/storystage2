import { describe, expect, it } from 'vitest';
import type { Document, Primitive } from '@gltf-transform/core';
import { readObj } from './obj.ts';

const text = (s: string) => new TextEncoder().encode(s);

/** A PNG header of the given size: enough for the checks, which never decode it. */
function png(w: number, h: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, w);
  new DataView(b.buffer).setUint32(20, h);
  return b;
}

function read(obj: string, files: Record<string, Uint8Array | string> = {}) {
  const map = new Map(
    Object.entries(files).map(([k, v]) => [k, typeof v === 'string' ? text(v) : v]),
  );
  const r = readObj(text(obj), map);
  if (!r.ok) throw new Error(r.problem.message);
  return r.result;
}

const primitives = (doc: Document): Primitive[] =>
  doc
    .getRoot()
    .listMeshes()
    .flatMap((m) => m.listPrimitives());
const array = (p: Primitive, name: string) => [...(p.getAttribute(name)?.getArray() ?? [])];

const square = `
v 0 0 0
v 1 0 0
v 1 1 0
v 0 1 0
vt 0 0
vt 1 0
vt 1 1
vt 0 1
vn 0 0 1
f 1/1/1 2/2/1 3/3/1 4/4/1
`;

describe('readObj', () => {
  it('reads positions, texture coordinates and normals, and cuts polygons into triangles', () => {
    const { document } = read(square);
    const [p] = primitives(document);
    expect(array(p!, 'POSITION')).toEqual([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]);
    // glTF's texture coordinates run down from the top, OBJ's up from the bottom.
    expect(array(p!, 'TEXCOORD_0')).toEqual([0, 1, 1, 1, 1, 0, 0, 0]);
    expect(array(p!, 'NORMAL')).toEqual([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
    expect([...p!.getIndices()!.getArray()!]).toEqual([0, 1, 2, 0, 2, 3]);
  });

  it('shares a vertex between corners that are the same, and counts back from the end', () => {
    const { document } = read('v 0 0 0\nv 1 0 0\nv 0 1 0\nv 1 1 0\nf -4 -3 -2\nf 2 4 3\n');
    const [p] = primitives(document);
    expect(p!.getAttribute('POSITION')!.getCount()).toBe(4);
    expect(p!.getAttribute('NORMAL')).toBeNull();
    expect([...p!.getIndices()!.getArray()!]).toEqual([0, 1, 2, 1, 3, 2]);
  });

  it('makes a node for each object and group, and a primitive for each material', () => {
    const { document } = read(
      `mtllib cup.mtl
v 0 0 0
v 1 0 0
v 0 1 0
o Cup
usemtl red
f 1 2 3
usemtl glass
f 1 2 3
g Handle
f 1 2 3
`,
      {
        'cup.mtl': `newmtl red
Kd 1 0 0
newmtl glass
Kd 0.5 0.5 1
d 0.25
`,
      },
    );
    const nodes = document.getRoot().getDefaultScene()!.listChildren();
    expect(nodes.map((n) => n.getName())).toEqual(['Cup', 'Handle']);
    const cup = nodes[0]!.getMesh()!.listPrimitives();
    expect(cup.map((p) => p.getMaterial()!.getName())).toEqual(['red', 'glass']);
    expect(cup[0]!.getMaterial()!.getBaseColorFactor()).toEqual([1, 0, 0, 1]);
    const glass = cup[1]!.getMaterial()!;
    expect(glass.getBaseColorFactor()).toEqual([0.5, 0.5, 1, 0.25]);
    expect(glass.getAlphaMode()).toBe('BLEND');
    // The handle carries on with the last material used.
    expect(nodes[1]!.getMesh()!.listPrimitives()[0]!.getMaterial()!.getName()).toBe('glass');
  });

  it('takes a picture from the picked files by its last part, whatever path the .mtl gives', () => {
    const skin = png(64, 32);
    const { document } = read(`mtllib m.mtl\nusemtl skin\n${square}`, {
      'm.mtl':
        'newmtl skin\nKd 0.2 0.2 0.2\nmap_Kd -clamp on C:\\Users\\maker\\textures\\skin.png\n',
      'skin.png': skin,
    });
    const material = primitives(document)[0]!.getMaterial()!;
    const texture = material.getBaseColorTexture()!;
    expect(texture.getMimeType()).toBe('image/png');
    expect(texture.getImage()).toEqual(skin);
    expect(material.getBaseColorFactor()).toEqual([1, 1, 1, 1]);
  });

  it('refuses a picture over the size limits, from its header', () => {
    const r = readObj(
      text(`mtllib m.mtl\nusemtl skin\n${square}`),
      new Map([
        ['m.mtl', text('newmtl skin\nmap_Kd big.png\n')],
        ['big.png', png(20_000, 20_000)],
      ]),
    );
    expect(r).toMatchObject({ ok: false, problem: { code: 'pictureTooBig' } });
  });

  it('says what it left out, in plain words', () => {
    const { leftOut } = read(`mtllib m.mtl\nmtllib gone.mtl\nusemtl a\ns 1\nl 1 2\n${square}`, {
      'm.mtl': 'newmtl a\nNs 10\nillum 2\nmap_Kd missing.png\n',
    });
    expect(leftOut).toEqual([
      'lighting model',
      'lines',
      'materials from files that weren’t picked',
      'pictures that weren’t picked',
      'shine',
      'smoothing groups',
    ]);
  });

  it('refuses damaged files, rather than guessing', () => {
    for (const bad of [
      'v 0 0 0\nv 1 0 0\nf 1 2\n',
      'v 0 0 0\nf 1 2 9\n',
      'v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 0\n',
      'v 0 0 x\n',
      'v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1/5 2/5 3/5\n',
      '# nothing but a comment\n',
    ])
      expect(readObj(text(bad)).ok).toBe(false);
  });

  it('stops at the triangle ceiling without reading on', () => {
    const face = `f ${Array.from({ length: 1000 }, () => '1').join(' ')}\n`;
    const obj = `v 0 0 0\n${face.repeat(2100)}`;
    expect(readObj(text(obj))).toMatchObject({ ok: false, problem: { code: 'tooManyTriangles' } });
  });

  it('reads files from older exporters, in Latin-1 with Windows line endings', () => {
    const latin = new Uint8Array([
      ...text('o Caf'),
      0xe9,
      ...text('\r\nv 0 0 0\r\nv 1 0 0\r\nv 0 1 0\r\nf 1 2 3\r\n'),
    ]);
    const r = readObj(latin);
    expect(r.ok && r.result.document.getRoot().listNodes()[0]!.getName()).toBe('Café');
  });
});

describe('readObj, then the rest of the import', () => {
  it('writes a .glb that passes the same checks as any other model', async () => {
    const { WebIO } = await import('@gltf-transform/core');
    const { splitGlb, checkGltfJson } = await import('./checks.ts');
    const skin = png(64, 32);
    const { document } = read(`mtllib m.mtl\nusemtl skin\n${square}`, {
      'm.mtl': 'newmtl skin\nmap_Kd skin.png\n',
      'skin.png': skin,
    });
    const glb = await new WebIO().writeBinary(document);
    const split = splitGlb(glb);
    expect(split.ok).toBe(true);
    if (split.ok) expect(checkGltfJson(split.json)).toEqual([]);
  });
});
