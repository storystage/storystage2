import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { MorphTarget } from '@babylonjs/core/Morph/morphTarget.js';
import { MorphTargetManager } from '@babylonjs/core/Morph/morphTargetManager.js';
import { Scene } from '@babylonjs/core/scene.js';
import { describe, expect, it } from 'vitest';
import type { ObjectState } from '../timeline.ts';
import { binaryFacesOf, faceShiftsOf, faceTargets, facesOf } from './faces.ts';
import { headlessEngine } from './headless.ts';
import { ObjectView } from './view.ts';

const vrm0 = {
  nodes: [{ name: 'Armature' }, { name: 'Face', mesh: 0 }],
  extensions: {
    VRM: {
      blendShapeMaster: {
        blendShapeGroups: [
          { presetName: 'joy', binds: [{ mesh: 0, index: 1, weight: 100 }] },
          { presetName: 'blink', binds: [{ mesh: 0, index: 0, weight: 50 }] },
          { presetName: 'a', binds: [{ mesh: 0, index: 2, weight: 100 }] },
        ],
      },
    },
  },
};

const vrm1 = {
  nodes: [{ name: 'Body', mesh: 0 }, { mesh: 1 }],
  extensions: {
    VRMC_vrm: {
      expressions: {
        preset: {
          sad: { morphTargetBinds: [{ node: 1, index: 3, weight: 0.8 }] },
          aa: { morphTargetBinds: [{ node: 0, index: 1, weight: 1 }] },
        },
      },
    },
  },
};

describe('faces', () => {
  it("read a VRM 0.x avatar's expressions under the Story API's names", () => {
    const faces = facesOf(vrm0);
    expect([...faces.keys()].sort()).toEqual(['blink', 'happy']);
    expect(faces.get('blink')).toEqual([{ node: 'Face', index: 0, weight: 0.5 }]);
  });

  it("read a VRM 1.0 avatar's, naming a node without a name as the loader does", () => {
    const faces = facesOf(vrm1);
    expect([...faces.keys()]).toEqual(['sad']);
    expect(faces.get('sad')).toEqual([{ node: 'node1', index: 3, weight: 0.8 }]);
  });

  it('make surprised from the open mouth for a model without its own (owner, 19 Nov)', () => {
    const withO = {
      ...vrm0,
      extensions: {
        VRM: {
          blendShapeMaster: {
            blendShapeGroups: [
              ...vrm0.extensions.VRM.blendShapeMaster.blendShapeGroups,
              { presetName: 'o', binds: [{ mesh: 0, index: 4, weight: 100 }] },
            ],
          },
        },
      },
    };
    expect(facesOf(withO).get('surprised')).toEqual([{ node: 'Face', index: 4, weight: 1 }]);
    const withOh = {
      ...vrm1,
      extensions: {
        VRMC_vrm: {
          expressions: {
            preset: {
              ...vrm1.extensions.VRMC_vrm.expressions.preset,
              oh: { morphTargetBinds: [{ node: 0, index: 2, weight: 1 }] },
            },
          },
        },
      },
    };
    expect(facesOf(withOh).get('surprised')).toEqual([{ node: 'Body', index: 2, weight: 1 }]);
    // Its own surprise stays its own.
    const own = {
      ...withOh,
      extensions: {
        VRMC_vrm: {
          expressions: {
            preset: {
              ...withOh.extensions.VRMC_vrm.expressions.preset,
              surprised: { morphTargetBinds: [{ node: 0, index: 5, weight: 1 }] },
            },
          },
        },
      },
    };
    expect(facesOf(own).get('surprised')).toEqual([{ node: 'Body', index: 5, weight: 1 }]);
    // No open mouth, no surprise: the first test's avatar has only "a".
    expect(facesOf(vrm0).has('surprised')).toBe(false);
  });

  it('find nothing in a model that is not a VRM', () => {
    expect(facesOf({ nodes: [] }).size).toBe(0);
  });

  it('find their morph targets on the placed meshes', () => {
    const scene = new Scene(headlessEngine());
    const face = MeshBuilder.CreateBox('Face', {}, scene);
    face.morphTargetManager = new MorphTargetManager(scene);
    for (let i = 0; i < 2; i++)
      face.morphTargetManager.addTarget(new MorphTarget(`t${i}`, 0, scene));
    const other = MeshBuilder.CreateBox('Other', {}, scene);
    const targets = faceTargets(facesOf(vrm0), [face, other]);
    expect(targets.get('happy')![0]!.target).toBe(face.morphTargetManager.getTarget(1));
    expect(targets.get('blink')![0]!.weight).toBe(0.5);
    // A slot for each shape the faces use, happy's and blink's, so its surface is built once.
    expect(face.morphTargetManager.numMaxInfluencers).toBe(2);
    expect(other.morphTargetManager).toBeNull();
  });

  it("read a VRM 1.0 avatar's picture shifts and its all-or-nothing faces (Seed-san's screen)", () => {
    const seed = {
      materials: [{ name: 'skin' }, { name: 'robo_face' }],
      extensions: {
        VRMC_vrm: {
          expressions: {
            preset: {
              happy: {
                isBinary: true,
                textureTransformBinds: [{ material: 1, offset: [0.25, 0], scale: [1, 1] }],
              },
              sad: { textureTransformBinds: [{ material: 1, offset: [0.75, 0] }] },
              aa: { isBinary: true, textureTransformBinds: [{ material: 1, offset: [0, 0.5] }] },
            },
          },
        },
      },
    };
    expect(Object.fromEntries(faceShiftsOf(seed))).toEqual({
      happy: [{ material: 'robo_face', scale: [1, 1], offset: [0.25, 0] }],
      sad: [{ material: 'robo_face', scale: [1, 1], offset: [0.75, 0] }],
    });
    expect([...binaryFacesOf(seed)]).toEqual(['happy']);
    expect(faceShiftsOf(vrm0).size).toBe(0);
  });

  it('shift the picture as the face shows, all or nothing when the model says so', () => {
    const scene = new Scene(headlessEngine());
    const picture = new Texture(null, scene);
    picture.uOffset = 1;
    const view = new ObjectView({
      root: new TransformNode('root', scene),
      meshes: [],
      box: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } },
      paintable: [],
      faceTextures: new Map([
        ['happy', [{ texture: picture, scale: [1, 1], offset: [0.25, 0] }]],
        ['sad', [{ texture: picture, scale: [0.5, 1], offset: [0, 0.5] }]],
      ]),
      binaryFaces: new Set(['happy']),
    });
    const state = {
      joints: new Map(),
      opacity: 1,
      paint: null,
      paintBlend: null,
    } as unknown as ObjectState;
    const where = {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
    };
    const showing = (expression: string, amount: number) => {
      view.show(state, where, { face: { expression, amount } });
      return [picture.uOffset, picture.vOffset, picture.uScale];
    };
    // From where it rests, a whole turn across.
    expect(showing('happy', 1)).toEqual([1.25, 0, 1]);
    expect(showing('happy', 0.4)).toEqual([1, 0, 1]);
    // Not all or nothing: part way, part shifted.
    expect(showing('sad', 0.5)).toEqual([1, 0.25, 0.75]);
  });
});
