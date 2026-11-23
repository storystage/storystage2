import { describe, expect, it } from 'vitest';
import { vrmBoneTable } from './vrm-bones.ts';

const nodes = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `Bone${i}` }));

describe('vrmBoneTable', () => {
  it("reads VRM 1.0's table as it is", () => {
    const table = vrmBoneTable({
      nodes: nodes(3),
      extensions: {
        VRMC_vrm: {
          humanoid: {
            humanBones: {
              leftHand: { node: 0 },
              leftThumbMetacarpal: { node: 1 },
              leftThumbProximal: { node: 2 },
            },
          },
        },
      },
    });
    expect(table.version).toBe('1');
    expect([...table.bones]).toEqual([
      [0, 'leftHand'],
      [1, 'leftThumbMetacarpal'],
      [2, 'leftThumbProximal'],
    ]);
  });

  it("names VRM 0.x's thumb bones as VRM 1.0 does, one bone along", () => {
    const thumb = (side: string, first: number) => [
      { bone: `${side}ThumbProximal`, node: first },
      { bone: `${side}ThumbIntermediate`, node: first + 1 },
      { bone: `${side}ThumbDistal`, node: first + 2 },
    ];
    const table = vrmBoneTable({
      nodes: nodes(7),
      extensions: {
        VRM: {
          humanoid: {
            humanBones: [{ bone: 'leftHand', node: 0 }, ...thumb('left', 1), ...thumb('right', 4)],
          },
        },
      },
    });
    expect(table.version).toBe('0');
    expect(Object.fromEntries(table.bones)).toEqual({
      0: 'leftHand',
      1: 'leftThumbMetacarpal',
      2: 'leftThumbProximal',
      3: 'leftThumbDistal',
      4: 'rightThumbMetacarpal',
      5: 'rightThumbProximal',
      6: 'rightThumbDistal',
    });
  });

  it('leaves out entries without a bone name or a node the file has', () => {
    const table = vrmBoneTable({
      nodes: nodes(2),
      extensions: {
        VRM: {
          humanoid: {
            humanBones: [
              { bone: 'hips', node: 0 },
              { bone: 'spine', node: 2 },
              { bone: 'chest', node: -1 },
              { bone: 'neck', node: 0.5 },
              { bone: 7, node: 1 },
              null,
              { node: 1 },
            ],
          },
        },
      },
    });
    expect([...table.bones]).toEqual([[0, 'hips']]);
    expect(
      vrmBoneTable({
        nodes: nodes(1),
        extensions: { VRMC_vrm: { humanoid: { humanBones: { hips: null } } } },
      }).bones.size,
    ).toBe(0);
  });

  it('finds no bones in a table of the wrong shape, or in a glTF that is not a VRM', () => {
    const vrm0 = {
      nodes: nodes(1),
      extensions: { VRM: { humanoid: { humanBones: { hips: { node: 0 } } } } },
    };
    expect(vrmBoneTable(vrm0)).toEqual({ version: '0', bones: new Map() });
    const vrm1 = {
      nodes: nodes(1),
      extensions: { VRMC_vrm: { humanoid: { humanBones: [{ bone: 'hips', node: 0 }] } } },
    };
    expect(vrmBoneTable(vrm1)).toEqual({ version: '1', bones: new Map() });
    expect(vrmBoneTable({ nodes: nodes(1) })).toEqual({ version: null, bones: new Map() });
    expect(vrmBoneTable(null)).toEqual({ version: null, bones: new Map() });
  });

  it('prefers the VRM 1.0 table when a file has both', () => {
    const table = vrmBoneTable({
      nodes: nodes(1),
      extensions: {
        VRM: { humanoid: { humanBones: [{ bone: 'leftThumbProximal', node: 0 }] } },
        VRMC_vrm: { humanoid: { humanBones: { leftThumbProximal: { node: 0 } } } },
      },
    });
    expect(table).toEqual({ version: '1', bones: new Map([[0, 'leftThumbProximal']]) });
  });
});
