/**
 * What the sketch renderer draws: one model's triangles in model space (metres, Y up, facing +Z,
 * as glTF), and, for a rigged model, the node tree and each vertex's joints, so it can be posed.
 */
import type { Mat4 } from './math.ts';

export interface SketchNode {
  readonly name: string;
  /** Index of the parent node, or -1 for a root. */
  readonly parent: number;
  /** The node's transform relative to its parent, at rest. */
  readonly local: Mat4;
}

export interface SketchMesh {
  /** x, y, z per vertex, in model space at rest. */
  readonly positions: Float32Array;
  /** Three vertex indices per triangle. */
  readonly indices: Uint32Array;
  /**
   * One flag per triangle: 1 for a see-through card (hair, eyelashes), a flat shape with a
   * picture of strands on it. A sketch draws the cards' shape as a whole, not their every edge.
   */
  readonly cards?: Uint8Array;
  /** The model's nodes, parents before children. Absent for a model that can't be posed. */
  readonly nodes?: readonly SketchNode[];
  /** Nodes that are joints of a skin, by index into `nodes`: the bones a pose may move. */
  readonly joints?: readonly number[];
  /** Four node indices and four weights per vertex: what moves each vertex when posed. */
  readonly influences?: { readonly nodes: Uint16Array; readonly weights: Float32Array };
  /** What the model's surfaces look like, for colour thumbnails (`thumbnail.ts`). */
  readonly surface?: SketchSurface;
}

/** A glTF material, as much of it as a thumbnail needs. */
export interface SketchMaterial {
  /** Base colour, linear red, green, blue and alpha, 0 to 1. */
  readonly colour: readonly [number, number, number, number];
  /** Index into `SketchSurface.images` of its base-colour picture, or -1. */
  readonly image: number;
  readonly alpha: 'OPAQUE' | 'MASK' | 'BLEND';
  /** For `MASK`: alpha below this is not drawn. */
  readonly cutoff: number;
  /** Lit by nothing: drawn in its own colours (`KHR_materials_unlit`, many VRM avatars). */
  readonly unlit: boolean;
}

export interface SketchSurface {
  /** u, v per vertex (glTF's: v runs down the picture). */
  readonly uvs: Float32Array;
  /** Linear red, green, blue and alpha per vertex: glTF's `COLOR_0`, or white. */
  readonly colours: Float32Array;
  /** One material index per triangle. */
  readonly triangleMaterial: Uint16Array;
  readonly materials: readonly SketchMaterial[];
  /** Encoded pictures (PNG, JPEG, WebP) as the file holds them. */
  readonly images: readonly { readonly bytes: Uint8Array; readonly mimeType: string }[];
}

/**
 * The same corners shared, once: glTF splits vertices at texture and normal seams, which would
 * otherwise look like open edges. Positions closer than `tolerance` (metres) are joined.
 */
export function weld(
  positions: Float32Array,
  indices: Uint32Array,
  tolerance: number,
): Uint32Array {
  const key = new Map<string, number>();
  const remap = new Uint32Array(positions.length / 3);
  const q = (v: number) => Math.round(v / tolerance);
  for (let i = 0; i < remap.length; i++) {
    const k = `${q(positions[i * 3]!)},${q(positions[i * 3 + 1]!)},${q(positions[i * 3 + 2]!)}`;
    const seen = key.get(k);
    if (seen === undefined) {
      key.set(k, i);
      remap[i] = i;
    } else remap[i] = seen;
  }
  return indices.map((i) => remap[i]!);
}
