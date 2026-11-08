/**
 * WP4.6: a VRM model's faces, for `show expression`. A VRM says which of its morph targets make
 * each expression: VRM 0.x in `blendShapeMaster`, VRM 1.0 in `expressions.preset`. A model
 * without an expression shows no change for it (owner's decision of 8 Nov 2026).
 */
import type { MorphTarget } from '@babylonjs/core/Morph/morphTarget.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';

/** One morph target of an expression, by the glTF node that has its mesh. */
export interface FaceBind {
  readonly node: string;
  readonly index: number;
  /** 0 to 1. */
  readonly weight: number;
}

/** VRM 0.x's preset names for the Story API's expressions. */
const VRM0: Readonly<Record<string, string>> = {
  joy: 'happy',
  sorrow: 'sad',
  angry: 'angry',
  fun: 'relaxed',
  surprised: 'surprised',
  blink: 'blink',
};
const VRM1 = new Set(['happy', 'sad', 'angry', 'relaxed', 'surprised', 'blink']);

interface Json {
  readonly nodes?: readonly { readonly name?: string; readonly mesh?: number }[];
  readonly extensions?: {
    readonly VRM?: {
      readonly blendShapeMaster?: {
        readonly blendShapeGroups?: readonly {
          readonly presetName?: string;
          readonly binds?: readonly { mesh: number; index: number; weight: number }[];
        }[];
      };
    };
    readonly VRMC_vrm?: {
      readonly expressions?: {
        readonly preset?: Readonly<
          Record<
            string,
            {
              readonly morphTargetBinds?: readonly {
                node: number;
                index: number;
                weight: number;
              }[];
            }
          >
        >;
      };
    };
  };
}

/** The Babylon.js loader names a node without a name by its index. */
const nodeName = (json: Json, i: number) => json.nodes?.[i]?.name ?? `node${i}`;

/** Each expression the model has, and the morph targets that make it. */
export function facesOf(gltf: unknown): Map<string, FaceBind[]> {
  const json = gltf as Json;
  const out = new Map<string, FaceBind[]>();
  const add = (expression: string, bind: FaceBind) => {
    const list = out.get(expression) ?? [];
    list.push(bind);
    out.set(expression, list);
  };
  for (const group of json.extensions?.VRM?.blendShapeMaster?.blendShapeGroups ?? []) {
    const expression = VRM0[group.presetName ?? ''];
    if (!expression) continue;
    for (const { mesh, index, weight } of group.binds ?? [])
      (json.nodes ?? []).forEach((n, i) => {
        if (n.mesh === mesh)
          add(expression, { node: nodeName(json, i), index, weight: weight / 100 });
      });
  }
  for (const [expression, preset] of Object.entries(
    json.extensions?.VRMC_vrm?.expressions?.preset ?? {},
  )) {
    if (!VRM1.has(expression)) continue;
    for (const { node, index, weight } of preset.morphTargetBinds ?? [])
      add(expression, { node: nodeName(json, node), index, weight });
  }
  return out;
}

export interface FaceTarget {
  readonly target: MorphTarget;
  readonly weight: number;
}

/** The binds found on a placed copy of the model, among its meshes. */
export function faceTargets(
  binds: ReadonlyMap<string, readonly FaceBind[]>,
  meshes: readonly AbstractMesh[],
): Map<string, FaceTarget[]> {
  const out = new Map<string, FaceTarget[]>();
  for (const [expression, list] of binds) {
    const targets: FaceTarget[] = [];
    for (const { node, index, weight } of list)
      for (const mesh of meshes) {
        // A mesh of several parts becomes one Babylon.js mesh for each.
        if (mesh.name !== node && !mesh.name.startsWith(`${node}_primitive`)) continue;
        const target = mesh.morphTargetManager?.getTarget(index);
        if (target) targets.push({ target, weight });
      }
    if (targets.length) out.set(expression, targets);
  }
  return out;
}
