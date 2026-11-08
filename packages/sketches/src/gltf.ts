/**
 * Reads a glTF model into a `SketchMesh`, with glTF Transform (MIT; workplan 3.9 uses it too).
 * Works the same in Node (`tools/make-sketches`) and in a Web Worker (imports, 3.11).
 *
 * Every node becomes a `SketchNode`. Skinned vertices are moved to the rest pose and weighted
 * to their joints; other vertices are weighted wholly to the node that holds them, so a hat on
 * a head bone follows the head when the model is posed.
 */
import {
  Primitive,
  WebIO,
  type Accessor,
  type Document,
  type Material,
  type Node,
  type Texture,
} from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { IDENTITY, multiply, transformPoint, type Mat4, type Vec3 } from './math.ts';
import type { SketchMaterial, SketchMesh, SketchNode, SketchSurface } from './mesh.ts';

/** A primitive with no material is drawn in glTF's default: white, opaque, lit. */
const DEFAULT_MATERIAL: SketchMaterial = {
  colour: [1, 1, 1, 1],
  image: -1,
  alpha: 'OPAQUE',
  cutoff: 0.5,
  unlit: false,
};

export async function meshFromGlb(bytes: Uint8Array): Promise<SketchMesh> {
  return meshFromDocument(await new WebIO().registerExtensions(ALL_EXTENSIONS).readBinary(bytes));
}

export function meshFromDocument(doc: Document): SketchMesh {
  const root = doc.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  const order: Node[] = [];
  const index = new Map<Node, number>();
  const parentOf: number[] = [];
  const visit = (node: Node, parent: number) => {
    if (index.has(node)) return;
    index.set(node, order.length);
    order.push(node);
    parentOf.push(parent);
    const me = order.length - 1;
    for (const child of node.listChildren()) visit(child, me);
  };
  for (const node of scene ? scene.listChildren() : []) visit(node, -1);

  const nodes: SketchNode[] = order.map((n, i) => ({
    name: n.getName() || `node${i}`,
    parent: parentOf[i]!,
    local: [...n.getMatrix()],
  }));
  const world: Mat4[] = [];
  nodes.forEach((n, i) => {
    world[i] = n.parent < 0 ? n.local : multiply(world[n.parent]!, n.local);
  });

  const positions: number[] = [];
  const indices: number[] = [];
  const cards: number[] = [];
  const infNodes: number[] = [];
  const infWeights: number[] = [];
  const jointSet = new Set<number>();
  const el: number[] = [];
  // Surfaces, for colour thumbnails.
  const uvs: number[] = [];
  const colours: number[] = [];
  const triangleMaterial: number[] = [];
  const materials: SketchMaterial[] = [DEFAULT_MATERIAL];
  const materialIndex = new Map<Material, number>();
  const images: { bytes: Uint8Array; mimeType: string }[] = [];
  const imageIndex = new Map<Texture, number>();
  const materialOf = (m: Material | null): number => {
    if (!m) return 0;
    const known = materialIndex.get(m);
    if (known !== undefined) return known;
    const texture = m.getBaseColorTexture();
    const bytes = texture?.getImage();
    let image = -1;
    if (texture && bytes) {
      image = imageIndex.get(texture) ?? images.length;
      if (image === images.length) {
        images.push({ bytes, mimeType: texture.getMimeType() });
        imageIndex.set(texture, image);
      }
    }
    const [r, g, b, a] = m.getBaseColorFactor();
    materials.push({
      colour: [r, g, b, a],
      image,
      alpha: m.getAlphaMode(),
      cutoff: m.getAlphaCutoff(),
      unlit: m.getExtension('KHR_materials_unlit') !== null,
    });
    materialIndex.set(m, materials.length - 1);
    return materials.length - 1;
  };

  order.forEach((node, ni) => {
    const mesh = node.getMesh();
    if (!mesh) return;
    const skin = node.getSkin();
    const skinJoints = skin ? skin.listJoints().map((j) => index.get(j)) : [];
    const ibm = skin?.getInverseBindMatrices() ?? null;
    const jointMats: Mat4[] = skinJoints.map((j, k) => {
      if (j === undefined) return IDENTITY;
      jointSet.add(j);
      const inv = ibm ? (ibm.getElement(k, el) as number[]).slice(0, 16) : [...IDENTITY];
      return multiply(world[j]!, inv);
    });
    for (const prim of mesh.listPrimitives()) {
      if (prim.getMode() !== Primitive.Mode.TRIANGLES) continue;
      const pos = prim.getAttribute('POSITION');
      if (!pos) continue;
      // Up to two sets of four joints and weights; Alice's exports use both.
      const sets = skin
        ? [0, 1]
            .map((n) => [prim.getAttribute(`JOINTS_${n}`), prim.getAttribute(`WEIGHTS_${n}`)])
            .filter((s): s is [Accessor, Accessor] => s[0] !== null && s[1] !== null)
        : [];
      const base = positions.length / 3;
      const material = prim.getMaterial();
      const uvSet = material?.getBaseColorTextureInfo()?.getTexCoord() ?? 0;
      const uv = prim.getAttribute(`TEXCOORD_${uvSet}`);
      const colour = prim.getAttribute('COLOR_0');
      for (let v = 0; v < pos.getCount(); v++) {
        const t = uv ? uv.getElement(v, []) : [0, 0];
        uvs.push(t[0] ?? 0, t[1] ?? 0);
        const c = colour ? colour.getElement(v, []) : [1, 1, 1, 1];
        colours.push(c[0] ?? 1, c[1] ?? 1, c[2] ?? 1, c[3] ?? 1);
        const p = pos.getElement(v, el).slice(0, 3) as unknown as Vec3;
        if (sets.length) {
          const pairs: { k: number; w: number }[] = [];
          for (const [ja, wa] of sets) {
            const js = ja.getElement(v, []);
            const ws = wa.getElement(v, []);
            for (let i = 0; i < 4; i++)
              if ((ws[i] ?? 0) > 0 && skinJoints[js[i]!] !== undefined)
                pairs.push({ k: js[i]!, w: ws[i]! });
          }
          // The rest position uses every influence; posing keeps the strongest four.
          const total = pairs.reduce((a, b) => a + b.w, 0) || 1;
          let [x, y, z] = [0, 0, 0];
          for (const { k, w } of pairs) {
            const q = transformPoint(jointMats[k]!, p);
            x += (w / total) * q[0];
            y += (w / total) * q[1];
            z += (w / total) * q[2];
          }
          positions.push(x, y, z);
          const strongest = [...pairs].sort((a, b) => b.w - a.w).slice(0, 4);
          const kept = strongest.reduce((a, b) => a + b.w, 0) || 1;
          for (let i = 0; i < 4; i++) {
            const s = strongest[i];
            infNodes.push(s ? skinJoints[s.k]! : 0);
            infWeights.push(s ? s.w / kept : 0);
          }
        } else {
          positions.push(...transformPoint(world[ni]!, p));
          infNodes.push(ni, 0, 0, 0);
          infWeights.push(1, 0, 0, 0);
        }
      }
      const idx = prim.getIndices();
      const count = idx ? idx.getCount() : pos.getCount();
      const seeThrough = (material?.getAlphaMode() ?? 'OPAQUE') !== 'OPAQUE';
      const m = materialOf(material);
      for (let i = 0; i + 2 < count; i += 3) {
        for (let k = 0; k < 3; k++) indices.push(base + (idx ? idx.getScalar(i + k) : i + k));
        cards.push(seeThrough ? 1 : 0);
        triangleMaterial.push(m);
      }
    }
  });

  // Some models mark everything see-through. Then nothing is a card: their edges are the drawing.
  const someCards = cards.includes(1) && cards.filter(Boolean).length * 2 < cards.length;
  const surface: SketchSurface = {
    uvs: new Float32Array(uvs),
    colours: new Float32Array(colours),
    triangleMaterial: new Uint16Array(triangleMaterial),
    materials,
    images,
  };
  const mesh: SketchMesh = {
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices),
    ...(someCards ? { cards: new Uint8Array(cards) } : {}),
    surface,
  };
  if (jointSet.size === 0) return mesh;
  return {
    ...mesh,
    nodes,
    joints: [...jointSet].sort((a, b) => a - b),
    influences: { nodes: new Uint16Array(infNodes), weights: new Float32Array(infWeights) },
  };
}
