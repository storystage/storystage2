/**
 * WP4.6: a VRM model's faces, for `show expression`. A VRM says which of its morph targets make
 * each expression: VRM 0.x in `blendShapeMaster`, VRM 1.0 in `expressions.preset`. A model
 * without an expression shows no change for it (owner's decision of 8 Nov 2026), except
 * surprised: VRM 0.x has no preset for it, so a model without one is surprised with its open
 * mouth, its "O" viseme (the owner's choice, 19 Nov 2026, by S4).
 */
import type { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
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
/** The open-mouth viseme: VRM 0.x's `o`, VRM 1.0's `oh`. */
const OPEN_MOUTH = new Set(['o', 'O', 'oh']);
/**
 * How far open the mouth is for a surprise made from it: all the way, since a small, low-poly
 * mouth (100Avatars') barely shows less.
 */
const SURPRISED_OPEN = 1;

interface Json {
  readonly nodes?: readonly { readonly name?: string; readonly mesh?: number }[];
  readonly materials?: readonly { readonly name?: string }[];
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
              readonly textureTransformBinds?: readonly {
                material: number;
                scale?: readonly [number, number];
                offset?: readonly [number, number];
              }[];
              readonly isBinary?: boolean;
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
  const open: FaceBind[] = [];
  for (const group of json.extensions?.VRM?.blendShapeMaster?.blendShapeGroups ?? []) {
    const preset = group.presetName ?? '';
    if (OPEN_MOUTH.has(preset))
      for (const { mesh, index, weight } of group.binds ?? [])
        (json.nodes ?? []).forEach((n, i) => {
          if (n.mesh === mesh) open.push({ node: nodeName(json, i), index, weight: weight / 100 });
        });
    const expression = VRM0[preset];
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
    if (OPEN_MOUTH.has(expression))
      for (const { node, index, weight } of preset.morphTargetBinds ?? [])
        open.push({ node: nodeName(json, node), index, weight });
    if (!VRM1.has(expression)) continue;
    for (const { node, index, weight } of preset.morphTargetBinds ?? [])
      add(expression, { node: nodeName(json, node), index, weight });
  }
  // Surprised, for a model without its own, from its open mouth.
  if (!out.has('surprised') && open.length > 0)
    out.set(
      'surprised',
      open.map((b) => ({ ...b, weight: b.weight * SURPRISED_OPEN })),
    );
  return out;
}

/**
 * A VRM 1.0 expression's shift of a surface's picture (`textureTransformBinds`): Seed-san's robot
 * shows each face on its screen so (the owner's choice, 19 Nov). At full strength the picture is
 * scaled by `scale` and moved by `offset`, in glTF's texture coordinates.
 */
export interface FaceShift {
  /** The glTF material's name, which the Babylon.js loader gives its material. */
  readonly material: string;
  readonly scale: readonly [number, number];
  readonly offset: readonly [number, number];
}

/** Each VRM 1.0 expression's picture shifts, by the Story API's names. */
export function faceShiftsOf(gltf: unknown): Map<string, FaceShift[]> {
  const json = gltf as Json;
  const out = new Map<string, FaceShift[]>();
  for (const [expression, preset] of Object.entries(
    json.extensions?.VRMC_vrm?.expressions?.preset ?? {},
  )) {
    if (!VRM1.has(expression)) continue;
    const shifts = (preset.textureTransformBinds ?? []).flatMap(({ material, scale, offset }) => {
      const name = json.materials?.[material]?.name;
      return name === undefined
        ? []
        : [
            {
              material: name,
              scale: scale ?? ([1, 1] as const),
              offset: offset ?? ([0, 0] as const),
            },
          ];
    });
    if (shifts.length) out.set(expression, shifts);
  }
  return out;
}

/**
 * The expressions a VRM 1.0 model says are all or nothing (`isBinary`): over half way there,
 * they show in full; under, not at all.
 */
export function binaryFacesOf(gltf: unknown): Set<string> {
  const json = gltf as Json;
  return new Set(
    Object.entries(json.extensions?.VRMC_vrm?.expressions?.preset ?? {})
      .filter(([expression, preset]) => VRM1.has(expression) && preset.isBinary)
      .map(([expression]) => expression),
  );
}

/** A picture shift on a placed copy of the model: the picture it moves, its own copy. */
export interface FaceTexture {
  readonly texture: Texture;
  readonly scale: readonly [number, number];
  readonly offset: readonly [number, number];
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
