/** New programs and scenes, as the Production stage first shows them (spec section 1). */
import { mintId, type NodeId } from './ids.ts';
import type { Program, TypeDecl } from './nodes.ts';
import { SCHEMA_VERSION } from './version.ts';
import { idsOf } from './walk.ts';

/** Hands out ids that are free in `program`, and in each other. */
export function idMinter(program: Program, random: () => number = Math.random): () => NodeId {
  const taken = idsOf(program);
  return () => {
    const id = mintId(taken, random);
    taken.add(id);
    return id;
  };
}

/** A scene: a type extending `Scene`, with a camera and an empty `myFirstMethod`. */
export function newSceneType(name: string, mint: () => NodeId): TypeDecl {
  return {
    id: mint(),
    kind: 'type',
    name,
    extends: { kind: 'story', name: 'Scene' },
    fields: [
      {
        id: mint(),
        kind: 'field',
        name: 'camera',
        type: { kind: 'story', name: 'Camera' },
        initial: null,
      },
    ],
    methods: [
      { id: mint(), kind: 'method', name: 'myFirstMethod', returns: null, params: [], body: [] },
    ],
    listeners: [],
  };
}

/** A program with one empty scene. */
export function newProgram(random: () => number = Math.random): Program {
  const empty: Program = { schemaVersion: SCHEMA_VERSION, types: [] };
  return { ...empty, types: [newSceneType('Scene1', idMinter(empty, random))] };
}
