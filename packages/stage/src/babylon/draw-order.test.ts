import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import { Scene } from '@babylonjs/core/scene.js';
import { describe, expect, it } from 'vitest';
import { type Standing, inDrawingOrder } from './draw-order.ts';
import { headlessEngine } from './headless.ts';

describe('see-through surfaces are drawn', () => {
  const scene = new Scene(headlessEngine());
  const box = (name: string, z: number) => {
    const mesh = CreateBox(name, { size: 0.2 }, scene);
    mesh.position.z = z;
    mesh.computeWorldMatrix(true);
    return mesh;
  };
  // The eye at 0, looking along +Z. Ann stands at 5, Bob at 10; a pane of glass is at 7.
  const ann: Standing = { origin: new Vector3(0, 0, 5) };
  const bob: Standing = { origin: new Vector3(0, 0, 10) };
  const annFront = box('annFront', 4.8);
  const annBack = box('annBack', 5.2);
  const bobFront = box('bobFront', 9.8);
  const bobBack = box('bobBack', 10.2);
  const glass = box('glass', 7);
  const owners = new Map<AbstractMesh, Standing>([
    [annFront, ann],
    [annBack, ann],
    [bobFront, bob],
    [bobBack, bob],
  ]);
  const order = inDrawingOrder(
    () => Vector3.Zero(),
    (m) => owners.get(m),
  );
  const drawn = (...meshes: AbstractMesh[]) =>
    meshes
      .map((m) => m.subMeshes[0]!)
      .sort(order)
      .map((s) => s.getMesh().name);

  it('object by object, back to front, and each object nearest first', () => {
    expect(drawn(annBack, glass, bobFront, annFront, bobBack)).toEqual([
      'bobFront',
      'bobBack',
      'glass',
      'annFront',
      'annBack',
    ]);
  });

  it('by where an object stands, not where its parts are', () => {
    // Bob's front part is nearer than the glass, but Bob stands behind it.
    bobFront.position.z = 6.5;
    bobFront.computeWorldMatrix(true);
    expect(drawn(glass, bobFront)).toEqual(['bobFront', 'glass']);
    bobFront.position.z = 9.8;
    bobFront.computeWorldMatrix(true);
  });

  it('in the order a mesh is told to be drawn in first', () => {
    annBack.alphaIndex = 0;
    expect(drawn(annFront, annBack, bobFront)).toEqual(['annBack', 'bobFront', 'annFront']);
    annBack.alphaIndex = Number.MAX_VALUE;
  });
});
