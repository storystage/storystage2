/**
 * WP3.11: our own reader for Wavefront OBJ and its MTL materials (decision 0066: obj2gltf runs
 * only in Node, and the import runs in the browser's worker). It makes a glTF document, so the
 * rest of the import treats an OBJ like any other model (spec 17, section 5).
 *
 * What it reads:
 * - **Geometry:** `v`, `vt` and `vn`, and faces (`f`) of any number of corners, cut into
 *   triangles as a fan. Indices may count back from the end (negative), as OBJ allows.
 * - **Groups and objects** (`g`, `o`): each becomes a node with its own mesh.
 * - **Materials** (`usemtl`, from the `.mtl` files `mtllib` names): colour (`Kd`), see-through
 *   (`d`, or `Tr`), and a picture (`map_Kd`). Each material is one primitive of its node's mesh.
 *
 * Everything else (lines, points, curves, smoothing groups, other material settings) is left out,
 * and `leftOut` says what, in plain words, for the import report.
 *
 * A picture is found among the picked files by its plain name. A path in the `.mtl` (as exporters
 * often write, `textures\skin.png` or `C:\Users\...\skin.png`) is matched by its last part only,
 * so nothing but a picked file is ever read (F9).
 */
import { Document, type Material, type Mesh } from '@gltf-transform/core';
import { IMPORT_CEILINGS, checkPicture, pictureSize, type ImportProblem } from './checks.ts';

export interface ObjResult {
  readonly document: Document;
  /** What the file had that the reader left out, in plain words, for the report. */
  readonly leftOut: readonly string[];
}

const DAMAGED: ImportProblem = {
  code: 'damaged',
  message: "This file is damaged, or it isn't a model.",
};

/** What each left-out OBJ or MTL keyword is, in plain words. */
const LEFT_OUT_WORDS: Readonly<Record<string, string>> = {
  l: 'lines',
  p: 'points',
  s: 'smoothing groups',
  curv: 'curves',
  curv2: 'curves',
  surf: 'surfaces',
  cstype: 'curves',
  deg: 'curves',
  vp: 'curves',
  Ka: 'ambient colour',
  Ks: 'shine',
  Ns: 'shine',
  Ke: 'glow',
  Ni: 'refraction',
  illum: 'lighting model',
  map_Ka: 'ambient pictures',
  map_Ks: 'shine pictures',
  map_Ns: 'shine pictures',
  map_d: 'see-through pictures',
  map_bump: 'bump pictures',
  bump: 'bump pictures',
  norm: 'bump pictures',
  disp: 'height pictures',
  refl: 'reflection pictures',
};

interface MtlMaterial {
  colour: [number, number, number];
  alpha: number;
  picture: string | null;
}

/** Splits text into lines, joining any that end in a backslash, as OBJ allows. */
function* lines(text: string): Generator<string> {
  let at = 0;
  let carried = '';
  while (at <= text.length) {
    let end = text.indexOf('\n', at);
    if (end < 0) end = text.length;
    let line = text.slice(at, end);
    at = end + 1;
    if (line.endsWith('\r')) line = line.slice(0, -1);
    if (line.endsWith('\\')) {
      carried += `${line.slice(0, -1)} `;
      continue;
    }
    yield carried + line;
    carried = '';
  }
}

/** A line's keyword and the rest, with comments removed. */
function parts(line: string): [string, string[]] | null {
  const hash = line.indexOf('#');
  const words = (hash < 0 ? line : line.slice(0, hash)).trim().split(/\s+/);
  const keyword = words.shift();
  return keyword ? [keyword, words] : null;
}

const finite = (w: string | undefined, fallback: number) => {
  const n = w === undefined ? NaN : Number(w);
  return Number.isFinite(n) ? n : fallback;
};

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** The last part of a path written by any system. */
const lastPart = (path: string) => path.split(/[\\/]/).pop() ?? '';

/** Reads an MTL file's materials: colour, see-through and picture. */
function readMtl(text: string, leftOut: Set<string>): Map<string, MtlMaterial> {
  const materials = new Map<string, MtlMaterial>();
  let current: MtlMaterial | null = null;
  for (const line of lines(text)) {
    const p = parts(line);
    if (!p) continue;
    const [keyword, words] = p;
    if (keyword === 'newmtl') {
      current = { colour: [0.8, 0.8, 0.8], alpha: 1, picture: null };
      materials.set(words.join(' '), current);
    } else if (!current) continue;
    else if (keyword === 'Kd') {
      // `Kd spectral` and `Kd xyz` aren't colours we can show.
      if (words[0] === 'spectral' || words[0] === 'xyz') leftOut.add('other colour systems');
      else {
        const r = clamp01(finite(words[0], 0.8));
        current.colour = [r, clamp01(finite(words[1], r)), clamp01(finite(words[2], r))];
      }
    } else if (keyword === 'd') current.alpha = clamp01(finite(words.at(-1), 1));
    else if (keyword === 'Tr') current.alpha = 1 - clamp01(finite(words.at(-1), 0));
    else if (keyword === 'map_Kd') {
      // Options come first (`-s 1 1 1 skin.png`, `-clamp on skin.png`); the name is last.
      current.picture = lastPart(words.at(-1) ?? '') || null;
      if (words.some((w) => w.startsWith('-'))) leftOut.add('picture settings');
    } else {
      const words = LEFT_OUT_WORDS[keyword];
      leftOut.add(words ?? 'other material settings');
    }
  }
  return materials;
}

const MIME = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' } as const;

/**
 * Reads an OBJ file into a glTF document. `files` are the other files picked with it, by plain
 * name: its `.mtl` files and pictures. Over the import's triangle ceiling, it stops and refuses.
 */
export function readObj(
  obj: Uint8Array,
  files: ReadonlyMap<string, Uint8Array> = new Map(),
):
  | { readonly ok: true; readonly result: ObjResult }
  | { readonly ok: false; readonly problem: ImportProblem } {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(obj);
  } catch {
    // Older exporters write Latin-1; nothing in the geometry depends on it.
    text = new TextDecoder('latin1').decode(obj);
  }
  const leftOut = new Set<string>();
  const decoder = new TextDecoder();

  const positions: number[] = [];
  const uvs: number[] = [];
  const normals: number[] = [];

  /** Each node's triangles, by material: corners as v, vt, vn in a row, 0-based, -1 for none. */
  interface Part {
    name: string;
    byMaterial: Map<string, number[]>;
  }
  const nodes: Part[] = [];
  let part: Part | null = null;
  let material = '';
  const mtlFiles: string[] = [];
  let triangles = 0;
  let missing = false;

  const newPart = (name: string) => {
    part = { name, byMaterial: new Map() };
    nodes.push(part);
  };

  const index = (word: string | undefined, length: number, size: number): number | null => {
    if (word === undefined || word === '') return -1;
    const n = Number(word);
    if (!Number.isInteger(n) || n === 0) return null;
    const i = n > 0 ? n - 1 : length / size + n;
    return i >= 0 && i < length / size ? i : null;
  };

  for (const line of lines(text)) {
    const p = parts(line);
    if (!p) continue;
    const [keyword, words] = p;
    switch (keyword) {
      case 'v':
        {
          const x = finite(words[0], NaN);
          const y = finite(words[1], NaN);
          const z = finite(words[2], NaN);
          if (Number.isNaN(x + y + z)) return { ok: false, problem: DAMAGED };
          positions.push(x, y, z);
        }
        if (words.length > 4) leftOut.add('vertex colours');
        break;
      case 'vt':
        uvs.push(finite(words[0], 0), 1 - finite(words[1], 0));
        break;
      case 'vn':
        normals.push(finite(words[0], 0), finite(words[1], 0), finite(words[2], 1));
        break;
      case 'f': {
        if (words.length < 3) return { ok: false, problem: DAMAGED };
        const corners: number[] = [];
        for (const w of words) {
          const [v, vt, vn] = w.split('/');
          const c = [
            index(v, positions.length, 3) ?? -2,
            index(vt, uvs.length, 2) ?? -2,
            index(vn, normals.length, 3) ?? -2,
          ] as const;
          if (c[0] < 0 || c[1] === -2 || c[2] === -2) return { ok: false, problem: DAMAGED };
          corners.push(...c);
        }
        const count = corners.length / 3;
        triangles += count - 2;
        if (triangles > IMPORT_CEILINGS.triangles)
          return {
            ok: false,
            problem: {
              code: 'tooManyTriangles',
              message: `This model has too many triangles to import: more than ${IMPORT_CEILINGS.triangles.toLocaleString('en-GB')}. Try a simpler version of it.`,
            },
          };
        if (!part) newPart('');
        const list = part!.byMaterial.get(material) ?? [];
        part!.byMaterial.set(material, list);
        // A fan from the first corner: right for the convex polygons exporters write.
        for (let i = 1; i + 1 < count; i++)
          list.push(
            ...corners.slice(0, 3),
            ...corners.slice(i * 3, i * 3 + 3),
            ...corners.slice(i * 3 + 3, i * 3 + 6),
          );
        break;
      }
      case 'o':
      case 'g':
        newPart(words.join(' '));
        if (nodes.length > IMPORT_CEILINGS.nodes)
          return {
            ok: false,
            problem: {
              code: 'tooManyNodes',
              message: `This model has too many parts to import: more than ${IMPORT_CEILINGS.nodes.toLocaleString('en-GB')}. Try a simpler version of it.`,
            },
          };
        break;
      case 'usemtl':
        material = words.join(' ');
        break;
      case 'mtllib':
        mtlFiles.push(...words.map(lastPart));
        break;
      default:
        leftOut.add(LEFT_OUT_WORDS[keyword] ?? 'other settings');
    }
  }

  // Materials, from the picked .mtl files the OBJ names.
  const mtl = new Map<string, MtlMaterial>();
  for (const name of mtlFiles) {
    const bytes = files.get(name);
    if (!bytes) {
      missing = true;
      continue;
    }
    for (const [k, m] of readMtl(decoder.decode(bytes), leftOut)) mtl.set(k, m);
  }
  if (missing) leftOut.add('materials from files that weren’t picked');

  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene();
  doc.getRoot().setDefaultScene(scene);

  // Pictures, checked from their headers before anything decodes them.
  const textures = new Map<string, ReturnType<Document['createTexture']>>();
  const materials = new Map<string, Material>();
  const materialFor = (name: string): { material: Material } | { problem: ImportProblem } => {
    const known = materials.get(name);
    if (known) return { material: known };
    const m = mtl.get(name);
    const made = doc
      .createMaterial(name)
      .setMetallicFactor(0)
      .setRoughnessFactor(1)
      .setBaseColorFactor(m ? [...m.colour, m.alpha] : [0.8, 0.8, 0.8, 1]);
    if (m && m.alpha < 1) made.setAlphaMode('BLEND');
    if (m?.picture) {
      const bytes = files.get(m.picture);
      if (!bytes) leftOut.add('pictures that weren’t picked');
      else {
        const problem = checkPicture(bytes, m.picture);
        if (problem) return { problem };
        let texture = textures.get(m.picture);
        if (!texture) {
          texture = doc
            .createTexture(m.picture)
            .setImage(bytes)
            .setMimeType(MIME[pictureSize(bytes)!.kind]);
          textures.set(m.picture, texture);
          if (textures.size > IMPORT_CEILINGS.pictures)
            return {
              problem: {
                code: 'tooManyPictures',
                message: `This model has too many pictures to import: more than ${IMPORT_CEILINGS.pictures}.`,
              },
            };
        }
        made.setBaseColorTexture(texture);
        // The picture shows as it is; its colour is the material's only if there's no picture.
        made.setBaseColorFactor([1, 1, 1, m.alpha]);
      }
    }
    materials.set(name, made);
    return { material: made };
  };

  for (const node of nodes) {
    if (node.byMaterial.size === 0) continue;
    const mesh: Mesh = doc.createMesh(node.name);
    for (const [name, corners] of node.byMaterial) {
      // One vertex for each different corner, so shared corners share a vertex.
      const seen = new Map<string, number>();
      const pos: number[] = [];
      const uv: number[] = [];
      const nor: number[] = [];
      let hasUv = true;
      let hasNormal = true;
      for (let c = 0; c < corners.length; c += 3) {
        if (corners[c + 1]! < 0) hasUv = false;
        if (corners[c + 2]! < 0) hasNormal = false;
      }
      const indices: number[] = [];
      for (let c = 0; c < corners.length; c += 3) {
        const v = corners[c]!;
        const vt = corners[c + 1]!;
        const vn = corners[c + 2]!;
        const key = `${v}/${hasUv ? vt : ''}/${hasNormal ? vn : ''}`;
        let i = seen.get(key);
        if (i === undefined) {
          i = seen.size;
          seen.set(key, i);
          pos.push(positions[v * 3]!, positions[v * 3 + 1]!, positions[v * 3 + 2]!);
          if (hasUv) uv.push(uvs[vt * 2]!, uvs[vt * 2 + 1]!);
          if (hasNormal) nor.push(normals[vn * 3]!, normals[vn * 3 + 1]!, normals[vn * 3 + 2]!);
        }
        indices.push(i);
      }
      const accessor = (
        type: 'VEC2' | 'VEC3' | 'SCALAR',
        array: Float32Array<ArrayBuffer> | Uint16Array<ArrayBuffer> | Uint32Array<ArrayBuffer>,
      ) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
      const made = materialFor(name);
      if ('problem' in made) return { ok: false, problem: made.problem };
      const primitive = doc
        .createPrimitive()
        .setAttribute('POSITION', accessor('VEC3', new Float32Array(pos)))
        .setIndices(
          accessor(
            'SCALAR',
            seen.size <= 65535 ? new Uint16Array(indices) : new Uint32Array(indices),
          ),
        )
        .setMaterial(made.material);
      if (hasUv) primitive.setAttribute('TEXCOORD_0', accessor('VEC2', new Float32Array(uv)));
      if (hasNormal) primitive.setAttribute('NORMAL', accessor('VEC3', new Float32Array(nor)));
      mesh.addPrimitive(primitive);
    }
    scene.addChild(doc.createNode(node.name).setMesh(mesh));
  }

  if (scene.listChildren().length === 0)
    return {
      ok: false,
      problem: { code: 'damaged', message: 'This file has no shapes in it to import.' },
    };
  return { ok: true, result: { document: doc, leftOut: [...leftOut].sort() } };
}
