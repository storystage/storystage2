/**
 * WP3.6: storybook characters made from KayKit's CC0 parts (spec 17, section 3, "Characters made
 * from parts"). No free model exists of Sherlock Holmes, Maid Marian, Branwen and the rest, so the
 * build makes them from a KayKit character, as a source list's `kitbash` recipe says:
 *
 * 1. `parts`: meshes brought from other characters in the same repository and commit, by node
 *    name. KayKit's characters share one skeleton, so a skinned part (a head) is bound to this
 *    character's skin, and a part hung on a joint (a hat) is hung on this character's joint of
 *    the same name. Each part keeps its own texture.
 * 2. `copy`: a skinned mesh duplicated, moved and turned about a pivot, bound to the same bones,
 *    or wholly to one `bone` so it holds still while the original moves.
 * 3. `trim`: a mesh's triangles that use one colour cell, inside a box if given, removed (an
 *    earring; Anansi's beard, which shares its cell with his eyebrows); `thin`: the islands a mesh
 *    draws in one cell, lying wholly inside a box, squashed toward their middles (eyebrows, drawn
 *    in the hair's colour but apart from the hair).
 * 4. `recolour`: the character's own texture, cell by cell. KayKit's textures are palettes of
 *    8 × 4 cells, each one colour shaded top to bottom, so a cell takes a new hue, and its
 *    saturation and brightness are scaled, keeping its shading; or it takes a `colour` outright,
 *    keeping only its shading (for a grey cell, which has no hue to turn).
 * 5. `add`: simple shapes hung on a joint (a ring, a tube, a cap, a snake, a disc, a path),
 *    coloured from a cell of the character's texture so they shade as its own parts do, or
 *    striped in `bands` of cells: a circlet, a skirt, a deerstalker, Anansi's eight spider legs.
 *
 * Everything here runs in the build, in Node, before the excludes and the reduction.
 */
import { WebIO, type Document, type Node, type Primitive, type Skin } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { copyToDocument } from '@gltf-transform/functions';
import sharp from 'sharp';

/** A colour cell of a KayKit palette texture: its column (0 to 7) and row (0 to 3). */
export type Cell = readonly [number, number];
type Vec3 = readonly [number, number, number];

/** KayKit's palette textures: 8 columns of 4 rows, each cell one colour shaded top to bottom. */
export const PALETTE = { columns: 8, rows: 4 } as const;

export interface KitbashShape {
  readonly name: string;
  /**
   * - `ring`: a torus of centre radius `radius` and tube radius `thickness`, flat in x and z.
   * - `tube`: a cone along +y, `height` long, `radius` at its foot and `top` at its head (a skirt,
   *   a hat's crown, a handle). Open at both ends unless `closed`.
   * - `cap`: the top half of a sphere of `radius` (a hat's crown, a peak when squashed by `scale`).
   * - `snake`: a tube `length` long, `radius` thick at its root and tapering, curling `curl`
   *   degrees as it goes up and out, with a round head.
   * - `disc`: a flat, filled circle of `radius` facing +y (a lens).
   * - `path`: a tube through `points`, smoothed, `radius` thick at the first and `top` at the last
   *   (default 60% of `radius`), with a round tip (a spider's leg).
   */
  readonly shape: 'ring' | 'tube' | 'cap' | 'snake' | 'disc' | 'path';
  /** The joint it hangs on, by name. */
  readonly joint: string;
  /** Where on the joint, in the file's own units. */
  readonly at: Vec3;
  /** Degrees about x, then y, then z. */
  readonly turn?: Vec3;
  /** Stretched along its own axes. */
  readonly scale?: Vec3;
  readonly radius: number;
  readonly thickness?: number;
  readonly top?: number;
  readonly height?: number;
  readonly length?: number;
  readonly curl?: number;
  readonly closed?: boolean;
  /** For a `path`: the points it passes through, in order. */
  readonly points?: readonly Vec3[];
  /** Its colour: a cell of the character's own texture. Not needed with `bands`. */
  readonly cell?: Cell;
  /**
   * Stripes along its length instead (around a ring; down a cap, tube, snake or path): these cells
   * in turn, `stripes` stripes in all (default: one of each).
   */
  readonly bands?: readonly Cell[];
  readonly stripes?: number;
}

export interface Kitbash {
  readonly parts?: readonly { readonly path: string; readonly nodes: readonly string[] }[];
  readonly copy?: readonly {
    readonly node: string;
    readonly name: string;
    readonly offset?: Vec3;
    readonly turn?: Vec3;
    readonly pivot?: Vec3;
    /** A joint the copy is bound to wholly, instead of the original's bones. */
    readonly bone?: string;
  }[];
  readonly trim?: readonly {
    readonly node: string;
    readonly cell: Cell;
    /** Only triangles lying wholly inside this box, [[x, y, z] low, [x, y, z] high]. */
    readonly within?: readonly [Vec3, Vec3];
  }[];
  readonly thin?: readonly {
    readonly node: string;
    readonly cell: Cell;
    /** The box, [[x, y, z] low, [x, y, z] high], an island must lie wholly inside. */
    readonly within: readonly [Vec3, Vec3];
    /** How much of its height it keeps, more than 0 and at most 1. */
    readonly scale: number;
  }[];
  readonly recolour?: readonly {
    readonly cells: readonly Cell[];
    /** The new hue, in degrees; left out, the hue stays. */
    readonly hue?: number;
    /** A colour as rrggbb, instead: its hue and saturation, its brightness times each pixel's. */
    readonly colour?: string;
    readonly saturation?: number;
    readonly value?: number;
  }[];
  readonly add?: readonly KitbashShape[];
}

/** Fetches a file of the same repository and commit as the base, by its path. */
export type PartFetcher = (path: string) => Promise<Uint8Array>;

const SHAPES = ['ring', 'tube', 'cap', 'snake', 'disc', 'path'] as const;

/** What's wrong with a recipe, in plain words, or nothing. */
export function kitbashProblems(k: unknown): string[] {
  const p: string[] = [];
  if (typeof k !== 'object' || k === null || Array.isArray(k))
    return ['kitbash must be an object.'];
  const r = k as Record<string, unknown>;
  const known = ['parts', 'copy', 'trim', 'thin', 'recolour', 'add'];
  for (const key of Object.keys(r))
    if (!known.includes(key)) p.push(`kitbash has no step called ${key}.`);
  const list = (key: string) =>
    r[key] === undefined ? [] : Array.isArray(r[key]) ? (r[key] as unknown[]) : null;
  const isCell = (c: unknown) =>
    Array.isArray(c) &&
    c.length === 2 &&
    Number.isInteger(c[0]) &&
    Number.isInteger(c[1]) &&
    c[0] >= 0 &&
    c[0] < PALETTE.columns &&
    c[1] >= 0 &&
    c[1] < PALETTE.rows;
  const isVec = (v: unknown) =>
    Array.isArray(v) && v.length === 3 && v.every((x) => Number.isFinite(x));
  const isName = (s: unknown) => typeof s === 'string' && s.length > 0;
  const num = (x: unknown) => typeof x === 'number' && Number.isFinite(x);
  for (const key of known) if (list(key) === null) p.push(`kitbash.${key} must be a list.`);
  (list('parts') ?? []).forEach((x, i) => {
    const o = x as Record<string, unknown>;
    if (!isName(o?.path) || !/\.(glb|gltf)$/.test(o.path as string))
      p.push(`kitbash.parts[${i}].path must be a .glb or .gltf in the same repository.`);
    if (!Array.isArray(o?.nodes) || !o.nodes.length || !o.nodes.every(isName))
      p.push(`kitbash.parts[${i}].nodes must name the parts to bring.`);
  });
  (list('copy') ?? []).forEach((x, i) => {
    const o = x as Record<string, unknown>;
    if (!isName(o?.node) || !isName(o?.name))
      p.push(`kitbash.copy[${i}] needs a node and a new name.`);
    if (o?.bone !== undefined && !isName(o.bone))
      p.push(`kitbash.copy[${i}].bone must name a joint.`);
    for (const v of ['offset', 'turn', 'pivot'])
      if (o?.[v] !== undefined && !isVec(o[v]))
        p.push(`kitbash.copy[${i}].${v} must be [x, y, z].`);
  });
  (list('trim') ?? []).forEach((x, i) => {
    const o = x as Record<string, unknown>;
    if (!isName(o?.node) || !isCell(o?.cell))
      p.push(`kitbash.trim[${i}] needs a node and a cell [column, row].`);
    const box = o?.within;
    if (box !== undefined && !(Array.isArray(box) && box.length === 2 && box.every(isVec)))
      p.push(`kitbash.trim[${i}].within must be [[x, y, z], [x, y, z]].`);
  });
  (list('thin') ?? []).forEach((x, i) => {
    const o = x as Record<string, unknown>;
    const box = o?.within;
    const okBox = Array.isArray(box) && box.length === 2 && box.every(isVec);
    if (
      !isName(o?.node) ||
      !isCell(o?.cell) ||
      !okBox ||
      !num(o?.scale) ||
      !((o.scale as number) > 0 && (o.scale as number) <= 1)
    )
      p.push(
        `kitbash.thin[${i}] needs a node, a cell, a box it works within, and a scale from 0 to 1.`,
      );
  });
  (list('recolour') ?? []).forEach((x, i) => {
    const o = x as Record<string, unknown>;
    if (!Array.isArray(o?.cells) || !o.cells.length || !o.cells.every(isCell))
      p.push(`kitbash.recolour[${i}].cells must list cells [column, row].`);
    if (o?.hue !== undefined && !(num(o.hue) && (o.hue as number) >= 0 && (o.hue as number) < 360))
      p.push(`kitbash.recolour[${i}].hue must be degrees, 0 to 359.`);
    if (
      o?.colour !== undefined &&
      !(typeof o.colour === 'string' && /^[0-9a-f]{6}$/.test(o.colour))
    )
      p.push(`kitbash.recolour[${i}].colour must be rrggbb.`);
    if (o?.colour !== undefined && o?.hue !== undefined)
      p.push(`kitbash.recolour[${i}] takes a colour or a hue, not both.`);
    for (const v of ['saturation', 'value'])
      if (o?.[v] !== undefined && !(num(o[v]) && (o[v] as number) >= 0 && (o[v] as number) <= 4))
        p.push(`kitbash.recolour[${i}].${v} must be a scale from 0 to 4.`);
  });
  (list('add') ?? []).forEach((x, i) => {
    const o = x as Record<string, unknown>;
    const e = (m: string) =>
      p.push(`kitbash.add[${i}]${isName(o?.name) ? ` (${o.name})` : ''}: ${m}`);
    if (!isName(o?.name)) e('needs a name.');
    if (!SHAPES.includes(o?.shape as (typeof SHAPES)[number]))
      e(`shape must be one of ${SHAPES.join(', ')}.`);
    if (!isName(o?.joint)) e('needs the joint it hangs on.');
    if (!isVec(o?.at)) e('at must be [x, y, z].');
    for (const v of ['turn', 'scale'])
      if (o?.[v] !== undefined && !isVec(o[v])) e(`${v} must be [x, y, z].`);
    if (!(num(o?.radius) && (o.radius as number) > 0)) e('radius must be more than 0.');
    const bands = o?.bands;
    if (bands !== undefined) {
      if (!Array.isArray(bands) || bands.length < 2 || !bands.every(isCell))
        e('bands must list two or more cells [column, row].');
      if (
        o.stripes !== undefined &&
        !(Number.isInteger(o.stripes) && (o.stripes as number) >= 1 && (o.stripes as number) <= 64)
      )
        e('stripes must be a whole number from 1 to 64.');
      if (o.shape === 'disc') e('a disc takes one cell, not bands.');
    } else if (!isCell(o?.cell)) e('cell must be [column, row] of the texture.');
    if (
      o?.shape === 'path' &&
      !(
        Array.isArray(o.points) &&
        o.points.length >= 2 &&
        o.points.length <= 32 &&
        o.points.every(isVec)
      )
    )
      e('a path needs 2 to 32 points [x, y, z].');
    if (o?.shape === 'ring' && !(num(o.thickness) && (o.thickness as number) > 0))
      e('a ring needs a thickness.');
    if (o?.shape === 'tube' && !(num(o.height) && (o.height as number) > 0))
      e('a tube needs a height.');
    if (o?.shape === 'snake' && !(num(o.length) && (o.length as number) > 0))
      e('a snake needs a length.');
  });
  return p;
}

const io = () => new WebIO().registerExtensions(ALL_EXTENSIONS);

/** Applies the recipe to the base character's bytes, fetching other parts with `fetchPart`. */
export async function applyKitbash(
  bytes: Uint8Array,
  recipe: Kitbash,
  fetchPart: PartFetcher,
): Promise<Uint8Array> {
  const doc = await io().readBinary(bytes);
  const root = doc.getRoot();
  const named = (name: string) => {
    const n = root.listNodes().find((x) => x.getName() === name);
    if (!n) throw new Error(`kitbash: the model has no node called ${name}.`);
    return n;
  };
  const skin = root.listSkins()[0];

  for (const part of recipe.parts ?? []) await bringParts(doc, skin, part, fetchPart);
  // A part brings its file's buffer with it; a binary glTF holds one.
  const [buffer, ...others] = root.listBuffers();
  if (buffer && others.length) {
    for (const a of root.listAccessors()) a.setBuffer(buffer);
    for (const b of others) b.dispose();
  }
  for (const c of recipe.copy ?? []) copyNode(doc, named(c.node), c);
  for (const t of recipe.trim ?? []) trim(named(t.node), t.cell, t.within);
  for (const t of recipe.thin ?? []) thin(named(t.node), t.cell, t.within, t.scale);
  const texture = baseTexture(doc);
  if (recipe.recolour?.length) {
    if (!texture) throw new Error('kitbash: the model has no texture to recolour.');
    texture.setImage(await recolour(texture.getImage()!, recipe.recolour));
  }
  for (const s of recipe.add ?? []) addShape(doc, named(s.joint), s);
  return io().writeBinary(doc);
}

/** The character's own texture: the base colour texture of its first material. */
function baseTexture(doc: Document) {
  return doc.getRoot().listMaterials()[0]?.getBaseColorTexture() ?? null;
}

async function bringParts(
  doc: Document,
  skin: Skin | undefined,
  part: { readonly path: string; readonly nodes: readonly string[] },
  fetchPart: PartFetcher,
) {
  const other = await io().readBinary(await fetchPart(part.path));
  const otherSkin = other.getRoot().listSkins()[0];
  const wanted = part.nodes.map((name) => {
    const from = other
      .getRoot()
      .listNodes()
      .find((n) => n.getName() === name);
    const mesh = from?.getMesh();
    if (!from || !mesh) throw new Error(`kitbash: ${part.path} has no part called ${name}.`);
    return { name, from, mesh };
  });
  // In one copy, so what the parts share (their texture) comes over once.
  const copies = copyToDocument(
    doc,
    other,
    wanted.map((w) => w.mesh),
  );
  for (const { name, from, mesh } of wanted) {
    const node = doc.createNode(name).setMesh(copies.get(mesh) as ReturnType<Node['getMesh']>);
    if (from.getSkin()) {
      // KayKit's characters share one skeleton: the same joints, in the same order.
      const same =
        skin &&
        otherSkin &&
        skin
          .listJoints()
          .map((j) => j.getName())
          .join() ===
          otherSkin
            .listJoints()
            .map((j) => j.getName())
            .join();
      if (!same) throw new Error(`kitbash: ${part.path}'s skeleton isn't this character's.`);
      node.setSkin(skin!);
      // Beside this character's own skinned meshes.
      const sibling = doc
        .getRoot()
        .listNodes()
        .find((n) => n !== node && n.getSkin() === skin);
      const holder = sibling?.getParentNode();
      if (holder) holder.addChild(node);
      else doc.getRoot().listScenes()[0]!.addChild(node);
    } else {
      const joint = from.getParentNode()?.getName();
      const here = doc
        .getRoot()
        .listNodes()
        .find((n) => n.getName() === joint);
      if (!here) throw new Error(`kitbash: this character has no joint ${joint} for ${name}.`);
      node
        .setTranslation(from.getTranslation())
        .setRotation(from.getRotation())
        .setScale(from.getScale());
      here.addChild(node);
    }
  }
}

// ---- small maths ------------------------------------------------------------------------------

type M3 = number[];
const rad = (d: number) => (d * Math.PI) / 180;
/** The rotation for turns in degrees about x, then y, then z (applied in that order). */
function rotation(turn: Vec3 = [0, 0, 0]): M3 {
  const [x, y, z] = turn.map(rad) as [number, number, number];
  const cx = Math.cos(x),
    sx = Math.sin(x),
    cy = Math.cos(y),
    sy = Math.sin(y),
    cz = Math.cos(z),
    sz = Math.sin(z);
  const Rx = [1, 0, 0, 0, cx, -sx, 0, sx, cx];
  const Ry = [cy, 0, sy, 0, 1, 0, -sy, 0, cy];
  const Rz = [cz, -sz, 0, sz, cz, 0, 0, 0, 1];
  return mul(Rz, mul(Ry, Rx));
}
function mul(a: M3, b: M3): M3 {
  const r = new Array(9).fill(0);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      for (let k = 0; k < 3; k++) r[i * 3 + j] += a[i * 3 + k]! * b[k * 3 + j]!;
  return r;
}
const apply = (m: M3, v: number[]) => [
  m[0]! * v[0]! + m[1]! * v[1]! + m[2]! * v[2]!,
  m[3]! * v[0]! + m[4]! * v[1]! + m[5]! * v[2]!,
  m[6]! * v[0]! + m[7]! * v[1]! + m[8]! * v[2]!,
];
/** A quaternion [x, y, z, w] from a rotation matrix (row-major). */
function quaternion(m: M3): [number, number, number, number] {
  const t = m[0]! + m[4]! + m[8]!;
  if (t > 0) {
    const s = Math.sqrt(t + 1) * 2;
    return [(m[7]! - m[5]!) / s, (m[2]! - m[6]!) / s, (m[3]! - m[1]!) / s, s / 4];
  }
  if (m[0]! > m[4]! && m[0]! > m[8]!) {
    const s = Math.sqrt(1 + m[0]! - m[4]! - m[8]!) * 2;
    return [s / 4, (m[1]! + m[3]!) / s, (m[2]! + m[6]!) / s, (m[7]! - m[5]!) / s];
  }
  if (m[4]! > m[8]!) {
    const s = Math.sqrt(1 + m[4]! - m[0]! - m[8]!) * 2;
    return [(m[1]! + m[3]!) / s, s / 4, (m[5]! + m[7]!) / s, (m[2]! - m[6]!) / s];
  }
  const s = Math.sqrt(1 + m[8]! - m[0]! - m[4]!) * 2;
  return [(m[2]! + m[6]!) / s, (m[5]! + m[7]!) / s, s / 4, (m[3]! - m[1]!) / s];
}

// ---- copy, trim, thin -------------------------------------------------------------------------

function copyNode(
  doc: Document,
  from: Node,
  c: {
    readonly name: string;
    readonly offset?: Vec3;
    readonly turn?: Vec3;
    readonly pivot?: Vec3;
    readonly bone?: string;
  },
) {
  const mesh = from.getMesh();
  if (!mesh) throw new Error(`kitbash: ${from.getName()} has no mesh to copy.`);
  const r = rotation(c.turn);
  const pivot = c.pivot ?? [0, 0, 0];
  const offset = c.offset ?? [0, 0, 0];
  // Its own primitives: a cloned mesh shares the original's, and these are changed below.
  const copy = doc.createMesh(c.name);
  for (const prim of mesh.listPrimitives()) copy.addPrimitive(prim.clone());
  for (const prim of copy.listPrimitives()) {
    for (const attr of ['POSITION', 'NORMAL'] as const) {
      const a = prim.getAttribute(attr);
      if (!a) continue;
      const out = a.clone();
      const v: number[] = [];
      for (let i = 0; i < a.getCount(); i++) {
        a.getElement(i, v);
        if (attr === 'POSITION') {
          const t = apply(r, [v[0]! - pivot[0], v[1]! - pivot[1], v[2]! - pivot[2]]);
          out.setElement(i, [
            t[0]! + pivot[0] + offset[0],
            t[1]! + pivot[1] + offset[1],
            t[2]! + pivot[2] + offset[2],
          ]);
        } else out.setElement(i, apply(r, v));
      }
      prim.setAttribute(attr, out);
    }
  }
  const node = doc.createNode(c.name).setMesh(copy);
  const skin = from.getSkin();
  if (skin) node.setSkin(skin);
  if (c.bone !== undefined) {
    const joint = skin?.listJoints().findIndex((j) => j.getName() === c.bone) ?? -1;
    if (joint < 0)
      throw new Error(`kitbash: ${from.getName()} isn't bound to a joint called ${c.bone}.`);
    for (const prim of copy.listPrimitives()) {
      const joints = prim.getAttribute('JOINTS_0');
      const weights = prim.getAttribute('WEIGHTS_0');
      if (!joints || !weights) continue;
      const j = joints.clone();
      const w = weights.clone();
      for (let i = 0; i < j.getCount(); i++) {
        j.setElement(i, [joint, 0, 0, 0]);
        w.setElement(i, [1, 0, 0, 0]);
      }
      prim.setAttribute('JOINTS_0', j).setAttribute('WEIGHTS_0', w);
    }
  }
  (from.getParentNode() ?? doc.getRoot().listScenes()[0]!).addChild(node);
}

/** Whether a texture coordinate lies in a cell. */
const inCell = (u: number, v: number, cell: Cell) =>
  Math.floor(u * PALETTE.columns) === cell[0] && Math.floor(v * PALETTE.rows) === cell[1];

/** The primitive's triangles as index triples. */
function triangles(prim: Primitive): number[][] {
  const idx = prim.getIndices();
  const count = idx ? idx.getCount() : prim.getAttribute('POSITION')!.getCount();
  const tris: number[][] = [];
  for (let i = 0; i < count; i += 3)
    tris.push(
      idx ? [idx.getScalar(i), idx.getScalar(i + 1), idx.getScalar(i + 2)] : [i, i + 1, i + 2],
    );
  return tris;
}

function triangleInCell(prim: Primitive, tri: number[], cell: Cell) {
  const uv = prim.getAttribute('TEXCOORD_0');
  if (!uv) return false;
  const t: number[] = [];
  return tri.every((i) => {
    uv.getElement(i, t);
    return inCell(t[0]!, t[1]!, cell);
  });
}

/** Whether a point lies inside a box, [[x, y, z] low, [x, y, z] high]. */
const insideBox = (p: number[], box: readonly [Vec3, Vec3]) =>
  p.every((x, k) => x >= box[0][k]! && x <= box[1][k]!);

function trim(node: Node, cell: Cell, within?: readonly [Vec3, Vec3]) {
  for (const prim of node.getMesh()?.listPrimitives() ?? []) {
    const pos = prim.getAttribute('POSITION')!;
    const v: number[] = [];
    const inBox = (t: number[]) =>
      !within || t.every((i) => insideBox(pos.getElement(i, v), within));
    const kept = triangles(prim).filter((t) => !(triangleInCell(prim, t, cell) && inBox(t)));
    const old = prim.getIndices();
    const indices = (old ? old.clone() : prim.getAttribute('POSITION')!.clone().setType('SCALAR'))
      .setType('SCALAR')
      .setArray(new Uint32Array(kept.flat()));
    prim.setIndices(indices);
  }
}

function thin(node: Node, cell: Cell, within: readonly [Vec3, Vec3], scale: number) {
  for (const prim of node.getMesh()?.listPrimitives() ?? []) {
    const pos = prim.getAttribute('POSITION')!;
    const tris = triangles(prim).filter((t) => triangleInCell(prim, t, cell));
    // Islands: triangles sharing a corner, where corners at the same place count as one.
    const key = (i: number) =>
      pos
        .getElement(i, [] as number[])
        .map((x) => x.toFixed(4))
        .join();
    const parent = new Map<string, string>();
    const find = (k: string): string => {
      while (parent.get(k) !== k) k = parent.get(k)!;
      return k;
    };
    for (const t of tris) for (const i of t) if (!parent.has(key(i))) parent.set(key(i), key(i));
    for (const t of tris) for (const i of t.slice(1)) parent.set(find(key(i)), find(key(t[0]!)));
    const islands = new Map<string, Set<number>>();
    for (const t of tris)
      for (const i of t) {
        const k = find(key(i));
        if (!islands.has(k)) islands.set(k, new Set());
        islands.get(k)!.add(i);
      }
    const out = pos.clone();
    const v: number[] = [];
    for (const corners of islands.values()) {
      if (![...corners].every((i) => insideBox(pos.getElement(i, v), within))) continue;
      const ys = [...corners].map((i) => pos.getElement(i, v)[1]!);
      const mid = (Math.min(...ys) + Math.max(...ys)) / 2;
      for (const i of corners) {
        pos.getElement(i, v);
        out.setElement(i, [v[0]!, mid + (v[1]! - mid) * scale, v[2]!]);
      }
    }
    prim.setAttribute('POSITION', out);
  }
}

// ---- recolour ---------------------------------------------------------------------------------

function toHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, max ? d / max : 0, max];
}
function toRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return [r + m, g + m, b + m];
}

/** A palette texture with cells recoloured, as PNG. */
export async function recolour(
  png: Uint8Array,
  rules: NonNullable<Kitbash['recolour']>,
): Promise<Uint8Array> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const cw = info.width / PALETTE.columns;
  const ch = info.height / PALETTE.rows;
  for (const rule of rules) {
    const tint = rule.colour
      ? toHsv(
          parseInt(rule.colour.slice(0, 2), 16) / 255,
          parseInt(rule.colour.slice(2, 4), 16) / 255,
          parseInt(rule.colour.slice(4, 6), 16) / 255,
        )
      : null;
    for (const [col, row] of rule.cells)
      for (let y = Math.round(row * ch); y < Math.round((row + 1) * ch); y++)
        for (let x = Math.round(col * cw); x < Math.round((col + 1) * cw); x++) {
          const i = (y * info.width + x) * 4;
          const [h, s, v] = toHsv(data[i]! / 255, data[i + 1]! / 255, data[i + 2]! / 255);
          const [r, g, b] = tint
            ? toRgb(
                tint[0],
                Math.min(1, tint[1] * (rule.saturation ?? 1)),
                Math.min(1, v * tint[2] * (rule.value ?? 1)),
              )
            : toRgb(
                rule.hue ?? h,
                Math.min(1, s * (rule.saturation ?? 1)),
                Math.min(1, v * (rule.value ?? 1)),
              );
          data[i] = Math.round(r * 255);
          data[i + 1] = Math.round(g * 255);
          data[i + 2] = Math.round(b * 255);
        }
  }
  return new Uint8Array(
    await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
      .png()
      .toBuffer(),
  );
}

// ---- shapes -----------------------------------------------------------------------------------

interface Geometry {
  readonly pos: number[];
  readonly nor: number[];
  /** Down the shape, 0 at its top and 1 at its foot: where in the cell's shading it falls. */
  readonly t: number[];
  /** Which of the shape's `bands` each corner takes (0 without bands). */
  readonly band: number[];
  readonly idx: number[];
}

type Surface = (i: number, j: number) => { p: number[]; n: number[]; t: number };

/**
 * A grid of quads over a surface, `i` running from `from` to `to` in `rows` steps and `j` from 0 to
 * 1 in `cols`, every corner in band `band`.
 */
function grid(rows: number, cols: number, at: Surface, from = 0, to = 1, band = 0): Geometry {
  const g: Geometry = { pos: [], nor: [], t: [], band: [], idx: [] };
  for (let i = 0; i <= rows; i++)
    for (let j = 0; j <= cols; j++) {
      const { p, n, t } = at(from + ((to - from) * i) / rows, j / cols);
      g.pos.push(...p);
      g.nor.push(...n);
      g.t.push(t);
      g.band.push(band);
    }
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < cols; j++) {
      const a = i * (cols + 1) + j;
      const b = a + cols + 1;
      g.idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  return g;
}

/**
 * The surface as one grid, or striped: `stripes` grids along `i`, each with its own corners, so a
 * stripe's colour doesn't blend into the next.
 */
function striped(rows: number, cols: number, at: Surface, stripes: number): Geometry {
  if (stripes <= 1) return grid(rows, cols, at);
  const each = Math.max(1, Math.ceil(rows / stripes));
  return merge(
    ...Array.from({ length: stripes }, (_, k) =>
      grid(each, cols, at, k / stripes, (k + 1) / stripes, k),
    ),
  );
}

function merge(...gs: Geometry[]): Geometry {
  const out: Geometry = { pos: [], nor: [], t: [], band: [], idx: [] };
  for (const g of gs) {
    const base = out.pos.length / 3;
    out.pos.push(...g.pos);
    out.nor.push(...g.nor);
    out.t.push(...g.t);
    out.band.push(...g.band);
    out.idx.push(...g.idx.map((i) => i + base));
  }
  return out;
}

const TAU = Math.PI * 2;

function disc(r: number, y: number, up: boolean): Geometry {
  return grid(1, 24, (i, j) => {
    const a = j * TAU;
    const k = up ? 1 - i : i;
    return { p: [r * k * Math.cos(a), y, r * k * Math.sin(a)], n: [0, up ? 1 : -1, 0], t: 0.5 };
  });
}

/** A round end of radius `r` at `c`, its pole along `axis` (a unit vector). */
function tip(c: number[], axis: number[], r: number, band: number): Geometry {
  const [side1, side2] = across(axis);
  return grid(
    6,
    10,
    (i, j) => {
      const lat = (Math.PI / 2) * (1 - i);
      const a = j * TAU;
      const n = [0, 1, 2].map(
        (k) =>
          Math.sin(lat) * axis[k]! +
          Math.cos(lat) * (Math.cos(a) * side1[k]! + Math.sin(a) * side2[k]!),
      );
      return { p: n.map((x, k) => c[k]! + x * r), n, t: 0.5 };
    },
    0,
    1,
    band,
  );
}

const sub = (a: number[], b: number[]) => a.map((x, k) => x - b[k]!);
const norm = (a: number[]) => {
  const l = Math.hypot(...a) || 1;
  return a.map((x) => x / l);
};
const cross = (a: number[], b: number[]) => [
  a[1]! * b[2]! - a[2]! * b[1]!,
  a[2]! * b[0]! - a[0]! * b[2]!,
  a[0]! * b[1]! - a[1]! * b[0]!,
];
/** Two unit vectors square to `axis` and to each other. */
function across(axis: number[]): [number[], number[]] {
  const ref = Math.abs(axis[1]!) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const side1 = norm(cross(axis, ref));
  return [side1, norm(cross(axis, side1))];
}

/** A point along a Catmull-Rom curve through `points`, `k` from 0 (the first) to 1 (the last). */
function along(points: readonly Vec3[], k: number): number[] {
  const n = points.length - 1;
  const s = Math.min(n - 1e-9, Math.max(0, k * n));
  const i = Math.floor(s);
  const u = s - i;
  const p = (j: number) => points[Math.max(0, Math.min(n, j))]!;
  const [p0, p1, p2, p3] = [p(i - 1), p(i), p(i + 1), p(i + 2)];
  return [0, 1, 2].map(
    (c) =>
      0.5 *
      (2 * p1[c]! +
        (-p0[c]! + p2[c]!) * u +
        (2 * p0[c]! - 5 * p1[c]! + 4 * p2[c]! - p3[c]!) * u * u +
        (-p0[c]! + 3 * p1[c]! - 3 * p2[c]! + p3[c]!) * u * u * u),
  );
}

/** The shape's geometry, about its own origin. */
export function shapeGeometry(s: KitbashShape): Geometry {
  const stripes = s.bands ? (s.stripes ?? s.bands.length) : 1;
  const last = stripes - 1;
  switch (s.shape) {
    case 'ring':
      return striped(
        32,
        8,
        (i, j) => {
          const u = i * TAU;
          const v = j * TAU;
          const R = s.radius;
          const r = s.thickness!;
          return {
            p: [
              (R + r * Math.cos(v)) * Math.cos(u),
              r * Math.sin(v),
              (R + r * Math.cos(v)) * Math.sin(u),
            ],
            n: [Math.cos(v) * Math.cos(u), Math.sin(v), Math.cos(v) * Math.sin(u)],
            t: 0.5 - 0.4 * Math.sin(v),
          };
        },
        stripes,
      );
    case 'tube': {
      const h = s.height!;
      const top = s.top ?? s.radius;
      const slope = (s.radius - top) / h;
      const side = striped(
        4,
        32,
        (i, j) => {
          const a = j * TAU;
          const r = top + (s.radius - top) * i;
          const len = Math.hypot(1, slope);
          return {
            p: [r * Math.cos(a), h * (1 - i), r * Math.sin(a)],
            n: [Math.cos(a) / len, slope / len, Math.sin(a) / len],
            t: 0.1 + 0.8 * i,
          };
        },
        stripes,
      );
      return s.closed ? merge(side, disc(top, h, true), disc(s.radius, 0, false)) : side;
    }
    case 'cap':
      return striped(
        8,
        24,
        (i, j) => {
          const lat = (Math.PI / 2) * (1 - i);
          const a = j * TAU;
          const n = [Math.cos(lat) * Math.cos(a), Math.sin(lat), Math.cos(lat) * Math.sin(a)];
          return { p: n.map((x) => x * s.radius), n, t: 0.1 + 0.8 * i };
        },
        stripes,
      );
    case 'disc':
      return merge(disc(s.radius, 0, true), disc(s.radius, 0, false));
    case 'snake': {
      // A tube along a curve that rises and bends outward (+z) by `curl` degrees, tapering, with a
      // round head at its end.
      const L = s.length!;
      const curl = rad(s.curl ?? 60);
      const centre = (k: number): number[] => {
        if (!curl) return [0, L * k, 0];
        const R = L / curl;
        const a = curl * k;
        return [0, R * Math.sin(a), R * (1 - Math.cos(a))];
      };
      const radiusAt = (k: number) => s.radius * (1 - 0.45 * k);
      const body = striped(
        12,
        10,
        (i, j) => {
          const c = centre(i);
          const a = curl * i;
          const tangent = [0, Math.cos(a), Math.sin(a)];
          const side1 = [1, 0, 0];
          const side2 = [0, -tangent[2]!, tangent[1]!];
          const ang = j * TAU;
          const n = side1.map((x, k) => x * Math.cos(ang) + side2[k]! * Math.sin(ang));
          return { p: c.map((x, k) => x + n[k]! * radiusAt(i)), n, t: 0.2 + 0.6 * i };
        },
        stripes,
      );
      const end = centre(1);
      const head = grid(
        8,
        10,
        (i, j) => {
          const lat = Math.PI / 2 - Math.PI * i;
          const a = j * TAU;
          const n = [Math.cos(lat) * Math.cos(a), Math.sin(lat), Math.cos(lat) * Math.sin(a)];
          const r = radiusAt(1) * 1.5;
          return {
            p: [end[0]! + n[0]! * r, end[1]! + n[1]! * r * 0.8, end[2]! + n[2]! * r * 1.3],
            n,
            t: 0.5,
          };
        },
        0,
        1,
        last,
      );
      return merge(body, head);
    }
    case 'path': {
      // A tube along the smoothed points, its rings square to the curve, tapering to `top`.
      const points = s.points!;
      const top = s.top ?? s.radius * 0.6;
      const radiusAt = (k: number) => s.radius + (top - s.radius) * k;
      const tangentAt = (k: number) =>
        norm(sub(along(points, Math.min(1, k + 0.01)), along(points, Math.max(0, k - 0.01))));
      const rows = 8 * (points.length - 1);
      const body = striped(
        rows,
        10,
        (i, j) => {
          const c = along(points, i);
          const [side1, side2] = across(tangentAt(i));
          const a = j * TAU;
          const n = side1.map((x, k) => x * Math.cos(a) + side2[k]! * Math.sin(a));
          return { p: c.map((x, k) => x + n[k]! * radiusAt(i)), n, t: 0.2 + 0.6 * i };
        },
        stripes,
      );
      return merge(body, tip(along(points, 1), tangentAt(1), top, last));
    }
  }
}

function addShape(doc: Document, joint: Node, s: KitbashShape) {
  const g = shapeGeometry(s);
  const base = doc.getRoot().listMaterials()[0];
  const texture = base?.getBaseColorTexture();
  const buffer = doc.getRoot().listBuffers()[0] ?? doc.createBuffer();
  // Each corner takes its cell's colour: one cell shaded down the shape, lighter at the top; or,
  // striped, each band's cell near its light top, so a stripe reads as one bright colour.
  const uv = g.t.flatMap((t, k) => {
    const cell = s.bands ? s.bands[g.band[k]! % s.bands.length]! : s.cell!;
    const v = s.bands ? 0.15 : 0.05 + 0.9 * t;
    return [(cell[0] + 0.4) / PALETTE.columns, (cell[1] + v) / PALETTE.rows];
  });
  const material = doc
    .createMaterial(s.name)
    .setBaseColorTexture(texture ?? null)
    .setRoughnessFactor(base?.getRoughnessFactor() ?? 1)
    .setMetallicFactor(base?.getMetallicFactor() ?? 0);
  const prim = doc
    .createPrimitive()
    .setAttribute(
      'POSITION',
      doc.createAccessor().setType('VEC3').setArray(new Float32Array(g.pos)).setBuffer(buffer),
    )
    .setAttribute(
      'NORMAL',
      doc.createAccessor().setType('VEC3').setArray(new Float32Array(g.nor)).setBuffer(buffer),
    )
    .setAttribute(
      'TEXCOORD_0',
      doc.createAccessor().setType('VEC2').setArray(new Float32Array(uv)).setBuffer(buffer),
    )
    .setIndices(
      doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(g.idx)).setBuffer(buffer),
    )
    .setMaterial(material);
  const node = doc
    .createNode(s.name)
    .setMesh(doc.createMesh(s.name).addPrimitive(prim))
    .setTranslation([...s.at])
    .setRotation(quaternion(rotation(s.turn)))
    .setScale([...(s.scale ?? [1, 1, 1])]);
  joint.addChild(node);
}
