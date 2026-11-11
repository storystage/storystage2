/**
 * WP5.3: glTF models. One copy of each model is loaded, and each object in a scene gets its own
 * clone of it. Its surfaces become plain ones, so they light as everything else does; the
 * textures are shared.
 *
 * A model's joints are found by its bone names, whatever naming it uses (`mapSkeleton`, WP3.3).
 * Bone-driven skinning works because the glTF loader ties each bone to a node, which is what
 * the stage turns.
 */
import type { AssetContainer } from '@babylonjs/core/assetContainer.js';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader.js';
import type { Material } from '@babylonjs/core/Materials/material.js';
import type { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import type { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { Scene } from '@babylonjs/core/scene.js';
import { registerBuiltInLoaders } from '@babylonjs/loaders/dynamic.js';
import {
  mapSkeleton,
  skeletonOf,
  type BackstageItem,
  type BackstageManifest,
} from '@storystage/backstage';
import {
  StageError,
  type BackstageId,
  type JointName,
  type ObjectId,
  type StoryClass,
} from '@storystage/story-api';
import type { Box } from '../hull.ts';
import type { Shape } from '../timeline.ts';
import { plainMaterial } from './materials.ts';
import { faceTargets, facesOf } from './faces.ts';
import { ObjectView } from './view.ts';

registerBuiltInLoaders();

export interface ModelFile {
  /** Where its glTF file is. */
  readonly url: string;
  /** Its joints, from its Backstage entry. */
  readonly joints: BackstageItem['joints'];
}

/** Where the stage finds a model. The app gives it Backstage (`modelsFromManifest`). */
export interface ModelSource {
  find(id: BackstageId): ModelFile | null | Promise<ModelFile | null>;
}

/** Finds models through a manifest, with `folder` the address of the Backstage folder. */
export function modelsFromManifest(manifest: BackstageManifest, folder: string): ModelSource {
  const items = new Map(manifest.items.map((item) => [item.id, item]));
  return {
    find(id) {
      const item = items.get(id);
      return item ? { url: `${folder}/${item.files.model}`, joints: item.joints } : null;
    },
  };
}

const noModel = (id: BackstageId) =>
  new StageError('unknown_model', `There is no model called ${id}.`);

/** A scene's loaded models. They belong to the scene, and go when it does. */
export class ModelLibrary {
  private readonly scene: Scene;
  private readonly source: ModelSource;
  private readonly loaded = new Map<BackstageId, Promise<LoadedModel>>();

  constructor(scene: Scene, source: ModelSource) {
    this.scene = scene;
    this.source = source;
  }

  /**
   * Starts fetching and reading a model, or with `backdrop` a backdrop's item, for a scene that
   * may come next. Never rejects.
   */
  prefetch(id: BackstageId, backdrop = false): Promise<void> {
    return this.load(id, backdrop).then(
      () => {},
      () => {},
    );
  }

  /** Whether Backstage has an item under `id`, without reading it. */
  async has(id: BackstageId): Promise<boolean> {
    try {
      return !!(await this.source.find(id));
    } catch {
      return false;
    }
  }

  /**
   * An item's file, read but not placed: a ground's texture or a picture sky (spec 17 section 2).
   * Rejects with `unknown_model` if it can't be had.
   */
  async asset(id: BackstageId): Promise<AssetContainer> {
    return (await this.load(id, true)).container;
  }

  private load(id: BackstageId, backdrop = false): Promise<LoadedModel> {
    let model = this.loaded.get(id);
    if (!model) {
      model = this.fetch(id, backdrop);
      this.loaded.set(id, model);
    }
    return model;
  }

  /**
   * A backdrop's picture is kept as its pixels are, in sRGB, as the stage's plain materials take a
   * colour. An sRGB buffer would hand them linear values, which show darker (spec 17 section 2).
   */
  private async fetch(id: BackstageId, backdrop: boolean): Promise<LoadedModel> {
    const file = await this.source.find(id);
    if (!file) throw noModel(id);
    try {
      let json: GltfJson = {};
      const options = {
        pluginExtension: '.glb',
        pluginOptions: {
          gltf: {
            onParsed: (data: { json: unknown }) => void (json = data.json as GltfJson),
            ...(backdrop ? { useSRGBBuffers: false } : {}),
          },
        },
      };
      const container = await LoadAssetContainerAsync(file.url, this.scene, options);
      return { file, container, json };
    } catch {
      throw noModel(id);
    }
  }

  /** An object's own copy of a model. Rejects with `unknown_model` if it can't be had. */
  async place(object: ObjectId, id: BackstageId, cls: StoryClass): Promise<PlacedModel> {
    const { file, container, json } = await this.load(id);
    const copy = container.instantiateModelsToScene((name) => name, false, {
      doNotInstantiate: true,
    });
    const root = new TransformNode(object, this.scene);
    root.rotationQuaternion = Quaternion.Identity();
    // VRM 0.x avatars face -Z (spec 17, section 3); everything on the stage faces +Z.
    const facing = json.extensions?.VRM ? new TransformNode(`${object} facing`, this.scene) : root;
    if (facing !== root) {
      facing.parent = root;
      facing.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), Math.PI);
    }
    for (const node of copy.rootNodes) node.parent = facing;
    const meshes = root.getChildMeshes().filter((m) => m.getTotalVertices() > 0);
    const paintable = plainSurfaces(object, meshes, this.scene);
    const box = boxOf(root);
    const joints = jointNodes(root, cls, file.joints);
    // The root is still at the origin, unturned, so a joint's place in the scene is its rest.
    const jointPlaces = new Map(
      [...joints].map(([joint, node]) => {
        node.computeWorldMatrix(true);
        const { x, y, z } = node.getAbsolutePosition();
        return [joint, { x, y, z }] as const;
      }),
    );
    return {
      view: new ObjectView({
        root,
        meshes,
        box,
        paintable,
        joints,
        animations: copy.animationGroups,
        faces: faceTargets(facesOf(json), root.getChildMeshes()),
      }),
      shape: {
        joints: file.joints === 'prop-only' ? [] : file.joints,
        box,
        jointPlaces,
        // Its own clips, which the play animation block can name, and how long each is.
        clips: new Map(
          copy.animationGroups.map((g) => {
            const fps = g.targetedAnimations[0]?.animation.framePerSecond ?? 60;
            return [g.name, (g.to - g.from) / fps] as const;
          }),
        ),
      },
    };
  }

  dispose(): void {
    for (const model of this.loaded.values())
      void model.then(
        ({ container }) => container.dispose(),
        () => {},
      );
  }
}

/** What the stage reads from a model's glTF itself: a VRM's own extension. */
interface GltfJson {
  readonly extensions?: { readonly VRM?: unknown; readonly VRMC_vrm?: unknown };
}

interface LoadedModel {
  readonly file: ModelFile;
  readonly container: AssetContainer;
  readonly json: GltfJson;
}

export interface PlacedModel {
  readonly view: ObjectView;
  readonly shape: Shape;
}

/** Gives each mesh a plain surface in place of the glTF one, sharing its texture. */
function plainSurfaces(
  object: ObjectId,
  meshes: readonly AbstractMesh[],
  scene: Scene,
): StandardMaterial[] {
  const made = new Map<Material, StandardMaterial>();
  for (const mesh of meshes) {
    const source = mesh.material as PBRMaterial | null;
    if (!source) continue;
    let plain = made.get(source);
    if (!plain) {
      plain = plainMaterial(`${object} ${source.name}`, source.albedoColor, scene);
      plain.diffuseTexture = source.albedoTexture;
      plain.alpha = source.alpha;
      plain.useAlphaFromDiffuseTexture = source.useAlphaFromAlbedoTexture;
      plain.backFaceCulling = source.backFaceCulling;
      plain.transparencyMode = source.transparencyMode;
      made.set(source, plain);
    }
    mesh.material = plain;
  }
  return [...made.values()];
}

/** The box round a model that's at the scene's origin, with no turn. */
function boxOf(root: TransformNode): Box {
  root.computeWorldMatrix(true);
  const { min, max } = root.getHierarchyBoundingVectors();
  return { min: { x: min.x, y: min.y, z: min.z }, max: { x: max.x, y: max.y, z: max.z } };
}

function jointNodes(
  root: TransformNode,
  cls: StoryClass,
  listed: BackstageItem['joints'],
): ReadonlyMap<JointName, TransformNode> {
  const nodes = new Map<string, TransformNode>();
  for (const node of root.getDescendants(false))
    if (node instanceof TransformNode) nodes.set(node.name, node);
  const out = new Map<JointName, TransformNode>();
  const skeleton = skeletonOf(cls);
  if (skeleton)
    for (const [joint, bone] of Object.entries(mapSkeleton([...nodes.keys()], skeleton).bones))
      out.set(joint as JointName, nodes.get(bone)!);
  // A prop's moving parts are its own joints, under their own names.
  if (listed !== 'prop-only')
    for (const joint of listed) {
      const node = nodes.get(joint);
      if (node && !out.has(joint)) out.set(joint, node);
    }
  return out;
}
