/**
 * A very small skinned glTF model made in code, so the tests need no model files: a flat
 * rectangle, a metre wide and two tall, facing +Z, bound to a chain of bones.
 */
const POSITIONS = [-0.5, 0, 0, 0.5, 0, 0, 0.5, 2, 0, -0.5, 2, 0];
const INDICES = [0, 1, 2, 0, 2, 3];
const VERTICES = POSITIONS.length / 3;
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

const pad4 = (n: number) => (n + 3) & ~3;

function chunk(type: number, bytes: Uint8Array, filler: number): Uint8Array {
  const out = new Uint8Array(8 + pad4(bytes.length)).fill(filler, 8);
  const view = new DataView(out.buffer);
  view.setUint32(0, pad4(bytes.length), true);
  view.setUint32(4, type, true);
  out.set(bytes, 8);
  return out;
}

function glb(json: object, bin: Uint8Array): Uint8Array {
  const text = new TextEncoder().encode(JSON.stringify(json));
  const chunks = [chunk(JSON_CHUNK, text, 0x20), chunk(BIN_CHUNK, bin, 0)];
  const total = 12 + chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true); // "glTF"
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  let at = 12;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/** A clip that turns one bone from its rest to `turns` about `axis` over a second, linearly. */
export interface TinyClip {
  readonly name: string;
  readonly bone: string;
  readonly axis: readonly [number, number, number];
  readonly turns: number;
}

/** A quaternion turning `turns` about a unit `axis`, as glTF keeps it: x, y, z, w. */
const quaternion = ([x, y, z]: readonly [number, number, number], turns: number) => {
  const s = Math.sin(turns * Math.PI);
  return [x * s, y * s, z * s, Math.cos(turns * Math.PI)];
};

/**
 * The model as a `data:` address, with one bone for each name, each the child of the last and
 * `step` above it (or along it), and any clips.
 */
export function tinyModelUrl(
  bones: readonly string[],
  {
    step = [0, 0.2, 0],
    clips = [],
  }: { step?: readonly number[]; clips?: readonly TinyClip[] } = {},
): string {
  const parts: Uint8Array[] = [
    new Uint8Array(new Float32Array(POSITIONS).buffer),
    new Uint8Array(new Uint16Array(INDICES).buffer),
    new Uint8Array(VERTICES * 4),
    new Uint8Array(new Float32Array(Array(VERTICES).fill([1, 0, 0, 0]).flat()).buffer),
    new Uint8Array(new Float32Array(bones.flatMap(() => IDENTITY)).buffer),
    // Every clip's two key times, 0 and 1 seconds, then each clip's two rotations.
    new Uint8Array(new Float32Array([0, 1]).buffer),
    ...clips.map(
      (c) => new Uint8Array(new Float32Array([0, 0, 0, 1, ...quaternion(c.axis, c.turns)]).buffer),
    ),
  ];
  const views: object[] = [];
  let length = 0;
  for (const part of parts) {
    length = pad4(length);
    views.push({ buffer: 0, byteOffset: length, byteLength: part.length });
    length += part.length;
  }
  const bin = new Uint8Array(length);
  parts.forEach((part, i) => bin.set(part, (views[i] as { byteOffset: number }).byteOffset));
  const FLOAT = 5126;
  const nodes: object[] = bones.map((name, i) => ({
    name,
    ...(i < bones.length - 1 ? { children: [i + 1] } : {}),
    ...(i > 0 ? { translation: [...step] } : {}),
  }));
  nodes.push({ name: 'Body', mesh: 0, skin: 0 });
  const json = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0, bones.length] }],
    nodes,
    meshes: [
      {
        primitives: [
          { attributes: { POSITION: 0, JOINTS_0: 2, WEIGHTS_0: 3 }, indices: 1, material: 0 },
        ],
      },
    ],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.2, 0.4, 0.6, 1] } }],
    skins: [{ joints: bones.map((_, i) => i), inverseBindMatrices: 4 }],
    buffers: [{ byteLength: length }],
    bufferViews: views,
    accessors: [
      {
        bufferView: 0,
        componentType: FLOAT,
        count: VERTICES,
        type: 'VEC3',
        min: [-0.5, 0, 0],
        max: [0.5, 2, 0],
      },
      { bufferView: 1, componentType: 5123, count: INDICES.length, type: 'SCALAR' },
      { bufferView: 2, componentType: 5121, count: VERTICES, type: 'VEC4' },
      { bufferView: 3, componentType: FLOAT, count: VERTICES, type: 'VEC4' },
      { bufferView: 4, componentType: FLOAT, count: bones.length, type: 'MAT4' },
      { bufferView: 5, componentType: FLOAT, count: 2, type: 'SCALAR', min: [0], max: [1] },
      ...clips.map((_, i) => ({ bufferView: 6 + i, componentType: FLOAT, count: 2, type: 'VEC4' })),
    ],
    ...(clips.length
      ? {
          animations: clips.map((c, i) => ({
            name: c.name,
            samplers: [{ input: 5, output: 6 + i, interpolation: 'LINEAR' }],
            channels: [{ sampler: 0, target: { node: bones.indexOf(c.bone), path: 'rotation' } }],
          })),
        }
      : {}),
  };
  const text = glb(json, bin).reduce((s, b) => s + String.fromCharCode(b), '');
  return `data:model/gltf-binary;base64,${btoa(text)}`;
}
