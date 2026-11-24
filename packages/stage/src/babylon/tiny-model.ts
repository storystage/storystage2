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

/** A bone of a tiny skeleton: where it is under its parent, and how it's turned there. */
export interface TinyBone {
  readonly name: string;
  readonly parent?: string;
  readonly at?: readonly [number, number, number];
  /** x, y, z, w. */
  readonly turn?: readonly [number, number, number, number];
}

/**
 * The model as a `data:` address, with one bone for each name, each the child of the last and
 * `step` above it (or along it), and any clips.
 */
export function tinyModelUrl(
  bones: readonly string[],
  {
    step = [0, 0.2, 0],
    clips = [],
    emissive,
  }: {
    step?: readonly number[];
    clips?: readonly TinyClip[];
    /** The surface's own light, glTF's `emissiveFactor`. */
    emissive?: readonly [number, number, number];
  } = {},
): string {
  const at = step as unknown as readonly [number, number, number];
  return tinySkeletonUrl(
    bones.map((name, i) => (i > 0 ? { name, parent: bones[i - 1]!, at } : { name })),
    { clips, ...(emissive ? { emissive } : {}) },
  );
}

/** The model with a skeleton of any shape, and any clips. */
export function tinySkeletonUrl(
  skeleton: readonly TinyBone[],
  {
    clips = [],
    extensions,
    emissive,
    cutOut = false,
  }: {
    clips?: readonly TinyClip[];
    extensions?: object;
    emissive?: readonly [number, number, number];
    /** Whether the surface is a cut-out, glTF's `alphaMode: 'MASK'`. */
    cutOut?: boolean;
  } = {},
): string {
  const bones = skeleton.map((b) => b.name);
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
  const nodes: object[] = skeleton.map((bone) => {
    const children = skeleton.flatMap((b, i) => (b.parent === bone.name ? [i] : []));
    return {
      name: bone.name,
      ...(children.length ? { children } : {}),
      ...(bone.at ? { translation: [...bone.at] } : {}),
      ...(bone.turn ? { rotation: [...bone.turn] } : {}),
    };
  });
  const tops = skeleton.flatMap((b, i) => (b.parent === undefined ? [i] : []));
  nodes.push({ name: 'Body', mesh: 0, skin: 0 });
  const json = {
    asset: { version: '2.0' },
    ...(extensions ? { extensions } : {}),
    scene: 0,
    scenes: [{ nodes: [...tops, bones.length] }],
    nodes,
    meshes: [
      {
        primitives: [
          { attributes: { POSITION: 0, JOINTS_0: 2, WEIGHTS_0: 3 }, indices: 1, material: 0 },
        ],
      },
    ],
    materials: [
      {
        pbrMetallicRoughness: { baseColorFactor: [0.2, 0.4, 0.6, 1] },
        ...(emissive ? { emissiveFactor: [...emissive] } : {}),
        ...(cutOut ? { alphaMode: 'MASK' } : {}),
      },
    ],
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

/** Panels 1 m wide and 2 m tall, a mesh of each colour, on the nodes given. */
function panelsUrl(nodes: readonly object[], colours: readonly (readonly number[])[]): string {
  const positions = new Uint8Array(new Float32Array(POSITIONS).buffer);
  const indices = new Uint8Array(new Uint16Array(INDICES).buffer);
  const start = pad4(positions.length);
  const bin = new Uint8Array(pad4(start + indices.length));
  bin.set(positions);
  bin.set(indices, start);
  const json = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: nodes.map((_, i) => i) }],
    nodes,
    meshes: colours.map((_, material) => ({
      primitives: [{ attributes: { POSITION: 0 }, indices: 1, material }],
    })),
    materials: colours.map((c) => ({ pbrMetallicRoughness: { baseColorFactor: [...c, 1] } })),
    buffers: [{ byteLength: bin.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.length },
      { buffer: 0, byteOffset: start, byteLength: indices.length },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: VERTICES,
        type: 'VEC3',
        min: [-0.5, 0, 0],
        max: [0.5, 2, 0],
      },
      { bufferView: 1, componentType: 5123, count: INDICES.length, type: 'SCALAR' },
    ],
  };
  const text = glb(json, bin).reduce((s, b) => s + String.fromCharCode(b), '');
  return `data:model/gltf-binary;base64,${btoa(text)}`;
}

/** A prop of one mesh on two nodes a metre apart, as Anansi's and the Roman temple's parts are. */
export function tinyTwinsUrl(): string {
  return panelsUrl(
    [
      { name: 'Left', mesh: 0, translation: [-0.5, 0, 0] },
      { name: 'Right', mesh: 0, translation: [0.5, 0, 0] },
    ],
    [[0.2, 0.4, 0.6]],
  );
}

/**
 * A prop of two panels, a red one 0.2 m in front of a green one (along +Z), each its own mesh,
 * as clothes are over a body.
 */
export function tinyLayersUrl(): string {
  return panelsUrl(
    [
      { name: 'Front', mesh: 0, translation: [0, 0, 0.1] },
      { name: 'Back', mesh: 1, translation: [0, 0, -0.1] },
    ],
    [
      [0.8, 0.1, 0.1],
      [0.1, 0.8, 0.1],
    ],
  );
}

/** Where each bone of a small humanoid is, in a T-pose facing +Z (+X on its left), in metres. */
const HUMAN: readonly (readonly [string, string | undefined, number, number, number])[] = [
  ['hips', undefined, 0, 1, 0],
  ['spine', 'hips', 0, 1.1, 0],
  ['chest', 'spine', 0, 1.3, 0],
  ['neck', 'chest', 0, 1.5, 0],
  ['head', 'neck', 0, 1.6, 0],
  ['leftUpperArm', 'chest', 0.2, 1.45, 0],
  ['leftLowerArm', 'leftUpperArm', 0.5, 1.45, 0],
  ['leftHand', 'leftLowerArm', 0.75, 1.45, 0],
  ['rightUpperArm', 'chest', -0.2, 1.45, 0],
  ['rightLowerArm', 'rightUpperArm', -0.5, 1.45, 0],
  ['rightHand', 'rightLowerArm', -0.75, 1.45, 0],
  ['leftUpperLeg', 'hips', 0.1, 0.95, 0],
  ['leftLowerLeg', 'leftUpperLeg', 0.1, 0.5, 0],
  ['leftFoot', 'leftLowerLeg', 0.1, 0.08, 0],
  ['rightUpperLeg', 'hips', -0.1, 0.95, 0],
  ['rightLowerLeg', 'rightUpperLeg', -0.1, 0.5, 0],
  ['rightFoot', 'rightLowerLeg', -0.1, 0.08, 0],
];

/** Eyes, for a humanoid that has them, as many VRMs made in VRoid do. */
const EYES: typeof HUMAN = [
  ['leftEye', 'head', 0.03, 1.65, 0.08],
  ['rightEye', 'head', -0.03, 1.65, 0.08],
];

type Q = readonly [number, number, number, number];
const qmul = ([ax, ay, az, aw]: Q, [bx, by, bz, bw]: Q): Q => [
  aw * bx + ax * bw + ay * bz - az * by,
  aw * by - ax * bz + ay * bw + az * bx,
  aw * bz + ax * by - ay * bx + az * bw,
  aw * bw - ax * bx - ay * by - az * bz,
];
const qrotate = (q: Q, [x, y, z]: readonly number[]): [number, number, number] => {
  const [, rx, ry, rz] = [0, ...qmul(qmul(q, [x!, y!, z!, 0]), [-q[0], -q[1], -q[2], q[3]])];
  return [rx!, ry!, rz!];
};

/**
 * A small humanoid with VRM's bone names, resting in a T-pose, or with `arms: 'A'` in an A-pose. `facing: 'back'` makes it face
 * -Z, and marks it as a VRM 0.x avatar, as they do. `twisted` gives every bone its own odd axes, as real rigs have,
 * without moving any of them: a pose should look the same either way. `eyes` gives it eye bones.
 * `byTable` gives its nodes names that say nothing, and a VRM bone table that says which is which.
 */
export function tinyHumanUrl({
  facing = 'front',
  twisted = false,
  arms = 'T',
  eyes = false,
  byTable = false,
}: {
  facing?: 'front' | 'back';
  twisted?: boolean;
  arms?: 'T' | 'A';
  eyes?: boolean;
  byTable?: boolean;
} = {}): string {
  const flip = facing === 'back' ? -1 : 1;
  // Resting in an A-pose, as MakeHuman's people do: each arm hangs 45 degrees from the shoulder.
  const hang = (name: string, x: number, y: number): [number, number] => {
    if (arms === 'T' || !/(Lower|Hand)/.test(name) || !/Arm|Hand/.test(name)) return [x, y];
    const out = Math.abs(x) - 0.2;
    const k = Math.SQRT1_2;
    return [Math.sign(x) * (0.2 + out * k), 1.45 - out * k];
  };
  const world = new Map<string, { at: [number, number, number]; turn: Q }>();
  const bones: TinyBone[] = [...HUMAN, ...(eyes ? EYES : [])].map(
    ([name, parent, x0, y0, z], i) => {
      const [x, y] = hang(name, x0, y0);
      const angle = twisted ? 0.7 + i * 0.37 : 0;
      const axis = [Math.sin(i), Math.cos(i * 1.3), 0.5].map((n, _, a) => n / Math.hypot(...a));
      const own: Q = [
        axis[0]! * Math.sin(angle / 2),
        axis[1]! * Math.sin(angle / 2),
        axis[2]! * Math.sin(angle / 2),
        Math.cos(angle / 2),
      ];
      const at: [number, number, number] = [x * flip, y, z * flip];
      const above = parent
        ? world.get(parent)!
        : { at: [0, 0, 0] as [number, number, number], turn: [0, 0, 0, 1] as Q };
      world.set(name, { at, turn: qmul(above.turn, own) });
      const back: Q = [-above.turn[0], -above.turn[1], -above.turn[2], above.turn[3]];
      const local = qrotate(back, [at[0] - above.at[0], at[1] - above.at[1], at[2] - above.at[2]]);
      return { name, ...(parent ? { parent } : {}), at: local, turn: own };
    },
  );
  if (byTable) {
    const own = (name: string) => `Object_${bones.findIndex((b) => b.name === name)}`;
    const nodes = bones.map(({ name, parent, ...rest }) => ({
      ...rest,
      name: own(name),
      ...(parent ? { parent: own(parent) } : {}),
    }));
    const table = bones.map(({ name }, node) => ({ bone: name, node }));
    const extensions =
      facing === 'back'
        ? { VRM: { humanoid: { humanBones: table } } }
        : {
            VRMC_vrm: {
              humanoid: {
                humanBones: Object.fromEntries(table.map(({ bone, node }) => [bone, { node }])),
              },
            },
          };
    return tinySkeletonUrl(nodes, { extensions });
  }
  // Facing -Z is what a VRM 0.x avatar does, so it says it is one.
  return tinySkeletonUrl(
    bones,
    facing === 'back' ? { extensions: { VRM: { specVersion: '0.0' } } } : {},
  );
}

/** A glTF file of one textured mesh, the picture embedded, as a `data:` address. */
function texturedUrl(
  positions: readonly number[],
  uvs: readonly number[],
  indices: readonly number[],
  png: Uint8Array,
  unlit: boolean,
  alphaMode: 'OPAQUE' | 'MASK' | 'BLEND' = 'OPAQUE',
  /** A plain green panel of the same shape 0.2 m behind it (along -Z), its own mesh. */
  behind = false,
): string {
  const floats = (a: readonly number[]) => new Uint8Array(new Float32Array(a).buffer);
  const parts = [
    floats(positions),
    floats(uvs),
    new Uint8Array(new Uint32Array(indices).buffer),
    png,
  ];
  const offsets: number[] = [];
  let length = 0;
  for (const p of parts) {
    offsets.push(length);
    length = pad4(length + p.length);
  }
  const bin = new Uint8Array(length);
  parts.forEach((p, i) => bin.set(p, offsets[i]));
  const count = positions.length / 3;
  const axis = (k: number, f: (a: number, b: number) => number) =>
    positions.filter((_, i) => i % 3 === k).reduce(f);
  const json = {
    asset: { version: '2.0' },
    ...(unlit ? { extensionsUsed: ['KHR_materials_unlit'] } : {}),
    scene: 0,
    scenes: [{ nodes: behind ? [0, 1] : [0] }],
    nodes: [
      {
        name: unlit ? 'Sky' : alphaMode !== 'OPAQUE' ? 'Panel' : 'Tile',
        mesh: 0,
        ...(behind ? { translation: [0, 0, 0.1] } : {}),
      },
      ...(behind ? [{ name: 'Behind', mesh: 1, translation: [0, 0, -0.1] }] : []),
    ],
    meshes: [
      { primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, indices: 2, material: 0 }] },
      ...(behind
        ? [{ primitives: [{ attributes: { POSITION: 0 }, indices: 2, material: 1 }] }]
        : []),
    ],
    materials: [
      {
        pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0 },
        ...(unlit ? { extensions: { KHR_materials_unlit: {} } } : {}),
        ...(alphaMode !== 'OPAQUE' ? { alphaMode } : {}),
      },
      ...(behind ? [{ pbrMetallicRoughness: { baseColorFactor: [0.1, 0.8, 0.1, 1] } }] : []),
    ],
    textures: [{ source: 0, sampler: 0 }],
    samplers: [{ wrapS: 10497, wrapT: 10497 }],
    images: [{ bufferView: 3, mimeType: 'image/png' }],
    buffers: [{ byteLength: length }],
    bufferViews: parts.map((p, i) => ({ buffer: 0, byteOffset: offsets[i], byteLength: p.length })),
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count,
        type: 'VEC3',
        min: [0, 1, 2].map((k) => axis(k, Math.min)),
        max: [0, 1, 2].map((k) => axis(k, Math.max)),
      },
      { bufferView: 1, componentType: 5126, count, type: 'VEC2' },
      { bufferView: 2, componentType: 5125, count: indices.length, type: 'SCALAR' },
    ],
  };
  const text = glb(json, bin).reduce((s, b) => s + String.fromCharCode(b), '');
  return `data:model/gltf-binary;base64,${btoa(text)}`;
}

/**
 * A ground tile (spec 17 section 2): one square `tile` metres across in the XZ plane, centred on
 * the origin and facing +Y, with the picture `png` across it once.
 */
export function tinyGroundTileUrl(tile: number, png: Uint8Array): string {
  const h = tile / 2;
  const positions = [-h, 0, -h, h, 0, -h, h, 0, h, -h, 0, h];
  return texturedUrl(positions, [0, 0, 1, 0, 1, 1, 0, 1], [0, 2, 1, 0, 3, 2], png, false);
}

/**
 * A cut-out: a panel a metre wide and two tall, facing +Z like the tiny model, whose picture's
 * see-through pixels are cut away (glTF's `alphaMode: 'MASK'`).
 */
export function tinyCutOutUrl(png: Uint8Array): string {
  const uvs = [0, 1, 1, 1, 1, 0, 0, 0];
  return texturedUrl(POSITIONS, uvs, INDICES, png, false, 'MASK');
}

/**
 * A see-through card in front of a green panel, as hair is over a head: `png` on a blended
 * surface (glTF's `alphaMode: 'BLEND'`), 0.2 m in front of (along +Z) a plain panel, each its
 * own mesh.
 */
export function tinyHairUrl(png: Uint8Array): string {
  const uvs = [0, 1, 1, 1, 1, 0, 0, 0];
  return texturedUrl(POSITIONS, uvs, INDICES, png, false, 'BLEND', true);
}

/**
 * A sky dome (spec 17 section 2): a sphere of radius 200 m facing in, unlit, with an
 * equirectangular picture whose middle (u = 0.5) faces +Z, u = 0.75 faces -X, and top +Y.
 */
export function tinySkyDomeUrl(png: Uint8Array, across = 32, down = 16): string {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let j = 0; j <= down; j++)
    for (let i = 0; i <= across; i++) {
      const u = i / across;
      const v = j / down;
      const turn = (u - 0.5) * 2 * Math.PI;
      const ring = Math.sin(v * Math.PI);
      positions.push(
        -Math.sin(turn) * ring * 200,
        Math.cos(v * Math.PI) * 200,
        Math.cos(turn) * ring * 200,
      );
      uvs.push(u, v);
    }
  const at = (i: number, j: number) => j * (across + 1) + i;
  for (let j = 0; j < down; j++)
    for (let i = 0; i < across; i++)
      indices.push(
        at(i, j),
        at(i + 1, j),
        at(i + 1, j + 1),
        at(i, j),
        at(i + 1, j + 1),
        at(i, j + 1),
      );
  return texturedUrl(positions, uvs, indices, png, true);
}
