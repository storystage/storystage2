import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { MorphTarget } from '@babylonjs/core/Morph/morphTarget.js';
import { MorphTargetManager } from '@babylonjs/core/Morph/morphTargetManager.js';
import { Scene } from '@babylonjs/core/scene.js';
import { describe, expect, it } from 'vitest';
import { faceTargets, facesOf } from './faces.ts';
import { headlessEngine } from './headless.ts';

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
  });
});
