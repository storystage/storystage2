import { describe, expect, it } from 'vitest';
import { idMinter, newProgram, newSceneType } from './build.ts';
import { mintId, NODE_ID_PATTERN, nodeId } from './ids.ts';
import { serializeProgram } from './serialize.ts';
import { sampleProgram } from './testing.ts';
import { validateProgram } from './validate.ts';
import { idsOf } from './walk.ts';

/** A repeatable source of numbers from 0 to 1. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

describe('mintId', () => {
  const pattern = new RegExp(NODE_ID_PATTERN);

  it('makes short ids of letters and digits, starting with a letter', () => {
    const random = seeded(7);
    for (let i = 0; i < 500; i++) {
      const id = mintId(new Set(), random);
      expect(id).toHaveLength(6);
      expect(id).toMatch(pattern);
    }
  });

  it('never returns an id that is taken', () => {
    const repeating = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6];
    let i = 0;
    const random = () => repeating[i++ % 6]!;
    const first = mintId(new Set(), random);
    i = 0;
    expect(mintId(new Set([first]), random)).not.toBe(first);
  });

  it('lengthens the id when six tries all collide', () => {
    const always = () => 0.5;
    const first = mintId(new Set(), always);
    const second = mintId(new Set([first]), always);
    expect(second).toHaveLength(7);
    expect(second).toMatch(pattern);
  });

  it('repeats with the same random source', () => {
    expect(mintId(new Set(), seeded(3))).toBe(mintId(new Set(), seeded(3)));
  });
});

describe('idMinter', () => {
  it('avoids the program and what it has already handed out', () => {
    const program = sampleProgram();
    const taken = idsOf(program);
    const mint = idMinter(program, seeded(11));
    const minted = Array.from({ length: 200 }, mint);
    expect(new Set(minted).size).toBe(200);
    for (const id of minted) expect(taken.has(id)).toBe(false);
  });
});

describe('new programs', () => {
  it('are valid, with one scene holding a camera and myFirstMethod', () => {
    const program = newProgram(seeded(5));
    expect(validateProgram(program)).toEqual([]);
    expect(program.types).toHaveLength(1);
    const [scene] = program.types;
    expect(scene?.extends).toEqual({ kind: 'story', name: 'Scene' });
    expect(scene?.fields.map((f) => f.name)).toEqual(['camera']);
    expect(scene?.methods.map((m) => m.name)).toEqual(['myFirstMethod']);
  });

  it('take a second scene with ids of its own', () => {
    const program = newProgram(seeded(5));
    const second = newSceneType('Scene2', idMinter(program, seeded(5)));
    expect(validateProgram({ ...program, types: [...program.types, second] })).toEqual([]);
  });
});

describe('serializeProgram', () => {
  it('gives the same bytes however the keys were ordered', () => {
    const a = { schemaVersion: '1.0.0', types: [] };
    const b = { types: [], schemaVersion: '1.0.0' };
    expect(serializeProgram(b)).toBe(serializeProgram(a));
  });

  it('sorts keys at every level, and leaves list order alone', () => {
    const type = {
      name: 'Zed',
      id: nodeId('zedzed'),
      kind: 'type' as const,
      extends: { name: 'Scene', kind: 'story' as const },
      fields: [],
      methods: [],
      listeners: [],
    };
    const text = serializeProgram({
      schemaVersion: '1.0.0',
      types: [type, { ...type, name: 'Abe' }],
    });
    expect(text.indexOf('"extends"')).toBeLessThan(text.indexOf('"fields"'));
    expect(text.indexOf('"kind":"story"')).toBeLessThan(text.indexOf('"name":"Scene"'));
    expect(text.indexOf('Zed')).toBeLessThan(text.indexOf('Abe'));
  });

  it('round-trips through JSON', () => {
    const program = sampleProgram();
    const text = serializeProgram(program);
    expect(serializeProgram(JSON.parse(text) as typeof program)).toBe(text);
    expect(validateProgram(JSON.parse(text))).toEqual([]);
  });
});
