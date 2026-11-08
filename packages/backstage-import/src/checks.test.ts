import { describe, expect, it } from 'vitest';
import { FILE_LIMIT } from '@storystage/host';
import {
  IMPORT_FILE_LIMIT,
  checkGltfJson,
  checkPicture,
  checkSizes,
  pictureSize,
  sortPicked,
  splitGlb,
} from './checks.ts';

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(
    parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p)),
  );
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const le16 = (n: number) => [n & 255, (n >>> 8) & 255];
const le24 = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255];
const be16 = (n: number) => [(n >>> 8) & 255, n & 255];

const png = (w: number, h: number) =>
  bytes([0x89], 'PNG\r\n\x1a\n', be32(13), 'IHDR', be32(w), be32(h), [8, 6, 0, 0, 0]);
const jpeg = (w: number, h: number) =>
  bytes(
    [0xff, 0xd8],
    [0xff, 0xe0, ...be16(16)],
    'JFIF\0',
    new Array(9).fill(0),
    [0xff, 0xc0, ...be16(17), 8, ...be16(h), ...be16(w), 3],
    new Array(9).fill(0),
  );
const webpLossy = (w: number, h: number) =>
  bytes(
    'RIFF',
    [0, 0, 0, 0],
    'WEBP',
    'VP8 ',
    [0, 0, 0, 0],
    [0, 0, 0],
    [0x9d, 0x01, 0x2a],
    le16(w),
    le16(h),
    [0, 0],
  );
const webpLossless = (w: number, h: number) => {
  const bits = (w - 1) | ((h - 1) << 14);
  return bytes(
    'RIFF',
    [0, 0, 0, 0],
    'WEBP',
    'VP8L',
    [0, 0, 0, 0],
    [0x2f],
    [bits & 255, (bits >>> 8) & 255, (bits >>> 16) & 255, (bits >>> 24) & 255],
    [0, 0, 0, 0, 0],
  );
};
const webpExtended = (w: number, h: number) =>
  bytes(
    'RIFF',
    [0, 0, 0, 0],
    'WEBP',
    'VP8X',
    [10, 0, 0, 0],
    [0, 0, 0, 0],
    le24(w - 1),
    le24(h - 1),
    [0, 0],
  );

/** A binary glTF from its JSON and binary chunk, padded as the format asks. */
function glb(json: unknown, bin?: Uint8Array): Uint8Array {
  let text = JSON.stringify(json);
  while (text.length % 4) text += ' ';
  const j = new TextEncoder().encode(text);
  const b = bin ? new Uint8Array(Math.ceil(bin.length / 4) * 4) : null;
  if (b && bin) b.set(bin);
  const total = 12 + 8 + j.length + (b ? 8 + b.length : 0);
  const out = new Uint8Array(total);
  const v = new DataView(out.buffer);
  v.setUint32(0, 0x46546c67, true);
  v.setUint32(4, 2, true);
  v.setUint32(8, total, true);
  v.setUint32(12, j.length, true);
  v.setUint32(16, 0x4e4f534a, true);
  out.set(j, 20);
  if (b) {
    v.setUint32(20 + j.length, b.length, true);
    v.setUint32(24 + j.length, 0x004e4942, true);
    out.set(b, 28 + j.length);
  }
  return out;
}

const asset = { version: '2.0' };
const codes = (problems: { code: string }[]) => problems.map((p) => p.code);

describe('sortPicked', () => {
  it('finds one model and what comes with it', () => {
    expect(sortPicked(['robot.GLB'])).toEqual({
      ok: true,
      picked: { kind: 'glb', model: 'robot.GLB', others: [] },
    });
    expect(sortPicked(['scene.bin', 'robot.gltf', 'skin.png'])).toMatchObject({
      picked: { kind: 'gltf', model: 'robot.gltf', others: ['scene.bin', 'skin.png'] },
    });
    expect(sortPicked(['cup.obj', 'cup.mtl', 'cup.jpg'])).toMatchObject({
      picked: { kind: 'obj' },
    });
    expect(sortPicked(['avatar.vrm'])).toMatchObject({ picked: { kind: 'vrm' } });
  });

  it('refuses FBX, two models, no model and other files, in plain words', () => {
    expect(sortPicked(['robot.fbx'])).toMatchObject({ problem: { code: 'fbx' } });
    expect(sortPicked(['a.glb', 'b.obj'])).toMatchObject({ problem: { code: 'severalModels' } });
    expect(sortPicked(['skin.png'])).toMatchObject({ problem: { code: 'noModel' } });
    expect(sortPicked(['robot.blend'])).toMatchObject({
      problem: { code: 'notAModel', message: expect.stringContaining('(robot.blend)') },
    });
    expect(sortPicked(['robot.glb', 'run.exe'])).toMatchObject({ problem: { code: 'notAModel' } });
  });
});

describe('checkSizes', () => {
  it("is the host's FILE_LIMIT", () => {
    expect(IMPORT_FILE_LIMIT).toBe(FILE_LIMIT);
  });

  it('refuses a file over the limit before it is read', () => {
    expect(checkSizes([{ name: 'a.glb', bytes: 10 }])).toBeNull();
    expect(checkSizes([{ name: 'a.glb', bytes: IMPORT_FILE_LIMIT + 1 }])).toMatchObject({
      code: 'tooBig',
    });
  });
});

describe('pictures, from their headers (spec 15, section 3.4)', () => {
  it('reads PNG, JPEG and WebP sizes without decoding', () => {
    expect(pictureSize(png(1024, 512))).toEqual({ kind: 'png', width: 1024, height: 512 });
    expect(pictureSize(jpeg(640, 480))).toEqual({ kind: 'jpeg', width: 640, height: 480 });
    expect(pictureSize(webpLossy(300, 200))).toEqual({ kind: 'webp', width: 300, height: 200 });
    expect(pictureSize(webpLossless(16, 9))).toEqual({ kind: 'webp', width: 16, height: 9 });
    expect(pictureSize(webpExtended(4000, 3000))).toEqual({
      kind: 'webp',
      width: 4000,
      height: 3000,
    });
    expect(pictureSize(bytes('GIF89a', [1, 0, 1, 0]))).toBeNull();
  });

  it('refuses a picture of 20,000 by 20,000, and one over 40 million pixels', () => {
    expect(checkPicture(png(8192, 4096))).toBeNull();
    expect(checkPicture(png(20_000, 20_000))).toMatchObject({ code: 'pictureTooBig' });
    expect(checkPicture(png(8192, 8192))).toMatchObject({ code: 'pictureTooBig' });
    expect(checkPicture(jpeg(0, 10))).toMatchObject({ code: 'pictureTooBig' });
    expect(checkPicture(bytes('BM', [0, 0]))).toMatchObject({ code: 'pictureKind' });
  });

  it('stops at a damaged JPEG rather than reading past it', () => {
    expect(pictureSize(bytes([0xff, 0xd8, 0xff, 0xe0, 0, 1, 0, 0, 0, 0, 0, 0]))).toBeNull();
    expect(pictureSize(bytes([0xff, 0xd8, 0x00, 0x00, 0, 0, 0, 0, 0, 0, 0, 0]))).toBeNull();
  });
});

describe('splitGlb', () => {
  it('splits a binary glTF into its JSON and binary chunk', () => {
    const r = splitGlb(glb({ asset }, new Uint8Array([1, 2, 3])));
    expect(r.ok && r.json).toEqual({ asset });
    expect(r.ok && [...r.bin!.subarray(0, 3)]).toEqual([1, 2, 3]);
  });

  it('refuses lengths that run past the file, and anything else', () => {
    const file = glb({ asset });
    expect(splitGlb(file.subarray(0, file.length - 4))).toMatchObject({ ok: false });
    const lying = glb({ asset });
    new DataView(lying.buffer).setUint32(12, 1_000_000, true);
    expect(splitGlb(lying)).toMatchObject({ ok: false, problem: { code: 'damaged' } });
    expect(splitGlb(bytes('not a model at all'))).toMatchObject({ ok: false });
  });
});

describe('checkGltfJson', () => {
  it('passes a plain model', () => {
    expect(checkGltfJson({ asset, extensionsRequired: ['KHR_texture_transform'] })).toEqual([]);
  });

  it("refuses a required extension the stage doesn't use, and Draco in its own words", () => {
    expect(codes(checkGltfJson({ asset, extensionsRequired: ['EXT_unknown_thing'] }))).toEqual([
      'extension',
    ]);
    expect(
      codes(checkGltfJson({ asset, extensionsRequired: ['KHR_draco_mesh_compression'] })),
    ).toEqual(['draco']);
    // Used but not required: dropped on reading, never a reason to refuse.
    expect(checkGltfJson({ asset, extensionsUsed: ['EXT_unknown_thing'] })).toEqual([]);
  });

  it('allows only embedded data and picked files, by plain name (F9)', () => {
    const json = (uri: string) => ({ asset, images: [{ uri }] });
    expect(checkGltfJson(json('data:image/png;base64,AAAA'))).toEqual([]);
    expect(checkGltfJson(json('skin%20one.png'), ['skin one.png'])).toEqual([]);
    expect(codes(checkGltfJson(json('https://example.org/skin.png')))).toEqual(['remoteFile']);
    expect(codes(checkGltfJson(json('file:///C:/skin.png')))).toEqual(['remoteFile']);
    expect(codes(checkGltfJson(json('../skin.png'), ['skin.png']))).toEqual(['outsideFile']);
    expect(codes(checkGltfJson(json('textures/skin.png'), ['skin.png']))).toEqual(['outsideFile']);
    expect(codes(checkGltfJson(json('..'), []))).toEqual(['outsideFile']);
    expect(codes(checkGltfJson(json('skin.png')))).toEqual(['missingFile']);
    expect(codes(checkGltfJson({ asset, buffers: [{ uri: 'scene.bin', byteLength: 4 }] }))).toEqual(
      ['missingFile'],
    );
  });

  it('refuses a model over a ceiling, before reducing anything', () => {
    const big = {
      asset,
      accessors: [{ count: 6_000_003 }, { count: 3 }],
      meshes: [{ primitives: [{ attributes: { POSITION: 1 }, indices: 0 }] }],
    };
    expect(codes(checkGltfJson(big))).toEqual(['tooManyTriangles']);
    const strip = {
      asset,
      accessors: [{ count: 2_000_003 }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, mode: 5 }] }],
    };
    expect(codes(checkGltfJson(strip))).toEqual(['tooManyTriangles']);
    const nodes = Array.from({ length: 300 }, () => ({}));
    expect(
      codes(checkGltfJson({ asset, nodes, skins: [{ joints: nodes.map((_, i) => i) }] })),
    ).toEqual(['tooManyJoints']);
    expect(codes(checkGltfJson({ asset, nodes: Array(10_001).fill({}) }))).toEqual([
      'tooManyNodes',
    ]);
    expect(
      codes(checkGltfJson({ asset, images: Array(65).fill({ uri: 'data:image/png;base64,' }) })),
    ).toEqual(['tooManyPictures']);
  });

  it("refuses what isn't glTF 2", () => {
    expect(codes(checkGltfJson({ asset: { version: '1.0' } }))).toEqual(['damaged']);
    expect(codes(checkGltfJson([]))).toEqual(['damaged']);
    expect(codes(checkGltfJson({ asset, images: [{ uri: 7 }] }))).toEqual(['damaged']);
  });

  it('never quotes a uri that is long or strange', () => {
    const [p] = checkGltfJson({ asset, images: [{ uri: `${'x'.repeat(100)}.png` }] });
    expect(p!.message).not.toContain('xxxx');
  });
});
