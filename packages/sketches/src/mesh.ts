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
  /** The model's nodes, parents before children. Absent for a model that can't be posed. */
  readonly nodes?: readonly SketchNode[];
  /** Nodes that are joints of a skin, by index into `nodes`: the bones a pose may move. */
  readonly joints?: readonly number[];
  /** Four node indices and four weights per vertex: what moves each vertex when posed. */
  readonly influences?: { readonly nodes: Uint16Array; readonly weights: Float32Array };
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
