/**
 * Reads any Backstage model file from its bytes: binary glTF (.glb) or VRM (.vrm, binary glTF
 * with a humanoid table). VRM files are kept byte for byte in Backstage, because their
 * expressions and look-at serve later blocks; this only reads them.
 *
 * - **Bone names.** A VRM says which node is which bone (`humanBones`), whatever the nodes are
 *   called. The nodes are renamed to those VRM bone names in memory, so the joint map
 *   (`mapSkeleton`, StoryStage convention) and posing read every VRM the same way.
 * - **Facing.** VRM 0.x avatars face -Z; VRM 1.0 avatars and glTF models face +Z. A VRM 0.x
 *   model is turned half a turn about Y in memory (`meshFromModel`), so its sketches face the
 *   right way. The stage's loader must do the same (spec 17, section 3).
 */
import { WebIO, type Document } from '@gltf-transform/core';
import { meshFromDocument } from './gltf.ts';
import type { SketchMesh } from './mesh.ts';

export interface Model {
  readonly doc: Document;
  /** The VRM version, or null for a plain glTF model. */
  readonly vrm: '0' | '1' | null;
}

interface VrmJson {
  readonly extensions?: {
    readonly VRM?: {
      readonly humanoid?: { readonly humanBones?: readonly { bone: string; node: number }[] };
    };
    readonly VRMC_vrm?: {
      readonly humanoid?: { readonly humanBones?: Readonly<Record<string, { node: number }>> };
    };
  };
}

export async function readModel(bytes: Uint8Array): Promise<Model> {
  const io = new WebIO();
  const { json } = await io.binaryToJSON(bytes);
  const ext = (json as VrmJson).extensions;
  const bones = new Map<number, string>();
  let vrm: Model['vrm'] = null;
  if (ext?.VRMC_vrm) {
    vrm = '1';
    for (const [bone, { node }] of Object.entries(ext.VRMC_vrm.humanoid?.humanBones ?? {}))
      bones.set(node, bone);
  } else if (ext?.VRM) {
    vrm = '0';
    for (const { bone, node } of ext.VRM.humanoid?.humanBones ?? []) bones.set(node, bone);
  }
  const doc = await io.readBinary(bytes);
  if (bones.size) {
    const nodes = doc.getRoot().listNodes();
    for (const [i, bone] of bones) nodes[i]?.setName(bone);
  }
  return { doc, vrm };
}

/** The sketch renderer's mesh for a model file, facing +Z whatever its version. */
export async function meshFromModel(bytes: Uint8Array): Promise<SketchMesh> {
  const { doc, vrm } = await readModel(bytes);
  if (vrm === '0') {
    const root = doc.getRoot();
    const scene = root.getDefaultScene() ?? root.listScenes()[0];
    if (scene) {
      const turn = doc.createNode('storystage-face-plus-z').setRotation([0, 1, 0, 0]);
      for (const child of scene.listChildren()) {
        scene.removeChild(child);
        turn.addChild(child);
      }
      scene.addChild(turn);
    }
  }
  return meshFromDocument(doc);
}
