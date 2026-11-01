import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import type { Box } from '../hull.ts';

/** How one object appears in a scene. The timeline says where it is; this puts it there. */
export interface ObjectView {
  readonly root: TransformNode;
  readonly meshes: readonly AbstractMesh[];
  /** Its box at scale 1, for collisions and proximity. */
  readonly box: Box;
}
