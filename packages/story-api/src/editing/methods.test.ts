import {
  nodeId,
  type ListenerDecl,
  type MethodDecl,
  type Program,
  type TypeDecl,
} from '@storystage/ast';
import { describe, expect, it } from 'vitest';
import { isSceneScript, methodTitle } from './methods.ts';
import { ID, mint, scene } from './testing.ts';
import { describer } from './words.ts';

/** The fixture's scene with another method, a `sceneStart` listener, and a type that isn't a scene. */
function withMore(): Program {
  const program = scene();
  const [main, ...rest] = program.types;
  const walk: MethodDecl = {
    id: nodeId('walkmt'),
    kind: 'method',
    name: 'walkAround',
    returns: null,
    params: [],
    body: [],
  };
  const starts: ListenerDecl = {
    id: nodeId('startl'),
    kind: 'listener',
    event: 'sceneStart',
    args: {},
    details: {},
    params: [],
    body: [],
  };
  const notScene: TypeDecl = {
    id: nodeId('helper'),
    kind: 'type',
    name: 'Helper',
    extends: { kind: 'story', name: 'Prop' },
    fields: [],
    methods: [{ ...walk, id: mint(), name: 'myFirstMethod' }],
    listeners: [],
  };
  return {
    ...program,
    types: [
      { ...main!, methods: [...main!.methods, walk], listeners: [...main!.listeners, starts] },
      ...rest,
      notScene,
    ],
  };
}

describe('what the editors call a method (spec 14, 2)', () => {
  const program = withMore();
  const helper = program.types.find((t) => t.name === 'Helper')!;

  it('calls a scene’s script method “When the scene starts”', () => {
    expect(isSceneScript(program, ID.main)).toBe(true);
    expect(methodTitle(program, ID.main)).toBe('When the scene starts');
  });

  it('calls any other method by its declaration', () => {
    expect(isSceneScript(program, nodeId('walkmt'))).toBe(false);
    expect(methodTitle(program, nodeId('walkmt'))).toBe('Scene1.walkAround');
  });

  it('goes by the scene: myFirstMethod in a type that isn’t a scene keeps its name', () => {
    const own = helper.methods[0]!.id;
    expect(isSceneScript(program, own)).toBe(false);
    expect(methodTitle(program, own)).toBe('Helper.myFirstMethod');
  });

  it('isn’t fooled by an id that isn’t a method', () => {
    expect(isSceneScript(program, ID.cat)).toBe(false);
    expect(isSceneScript(program, nodeId('nothere'))).toBe(false);
  });

  it('says a scene’s own sceneStart listener is “also when the scene starts”', () => {
    const listener = program.types[0]!.listeners.find((l) => l.event === 'sceneStart')!;
    expect(describer(program)(listener)).toBe('also when the scene starts');
  });
});
