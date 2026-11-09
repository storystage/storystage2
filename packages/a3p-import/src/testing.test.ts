import { openProduction, saveProduction } from '@storystage/production';
import { describe, expect, it } from 'vitest';
import {
  field,
  invoke,
  javaMethod,
  javaType,
  make,
  on,
  statement,
  world,
} from './alice-testing.ts';
import { decodeAlice, type AliceNode } from './decode.ts';
import { importAliceWorld } from './import.ts';
import { readA3p } from './read.ts';
import { aliceArchive, encodeAlice, smallAliceWorld } from './testing.ts';
import { parseXml } from './xml.ts';

/** A graph without its keys: Alice's encoder gives every node one, a test's graph has none. */
function withoutKeys(v: unknown, seen = new Map<object, unknown>()): unknown {
  if (v === null || typeof v !== 'object') return v;
  if (seen.has(v)) return seen.get(v);
  if (Array.isArray(v)) return v.map((x) => withoutKeys(x, seen));
  const out: Record<string, unknown> = {};
  seen.set(v, out);
  for (const [k, x] of Object.entries(v)) if (k !== 'key') out[k] = withoutKeys(x, seen);
  return out;
}
const roundTrip = (graph: AliceNode) => withoutKeys(decodeAlice(parseXml(encodeAlice(graph))));

describe('encodeAlice', () => {
  it('writes what decodeAlice reads back the same, a node used twice written once', () => {
    const cat = field('cat', javaType('SQuadruped'));
    const graph = world(
      [cat],
      [statement(invoke(on(cat), javaMethod('SModel', 'setSize'), [make('Size', 1, 2.5, 3)]))],
      [],
    );
    const xml = encodeAlice(graph);
    expect(withoutKeys(decodeAlice(parseXml(xml)))).toEqual(withoutKeys(graph));
    // `cat` is written in the scene's fields and only referred to in the set-up.
    expect(xml.match(/<property name="name"><value type="java.lang.String">cat</g)).toHaveLength(1);
  });

  it('escapes text, so a learner’s words come back as they were', () => {
    const words = 'Tom & "Jerry" <3';
    const graph = world([field(words, javaType('SQuadruped'))], []);
    expect(roundTrip(graph)).toEqual(withoutKeys(graph));
  });
});

describe('smallAliceWorld', () => {
  it('is a real .a3p that imports, with a stand-in, a mixed colour and a block left out', () => {
    const read = readA3p(smallAliceWorld());
    expect(read).toMatchObject({ ok: true, file: { kind: 'world' } });
    const result = importAliceWorld(smallAliceWorld(), { fileName: 'small.a3p' });
    if (!result.ok) throw new Error(result.problem.message);
    expect(result.production.manifest).toMatchObject({ title: 'small', origin: 'alice' });
    expect(result.production.scenes[0]!.setup.objects).toEqual([
      expect.objectContaining({
        id: 'cat',
        model: { standIn: 'Abyssinian cat', size: { x: 0.5, y: 0.6, z: 1.2 } },
      }),
    ]);
    expect(result.report.counts).toMatchObject({ model: 1, value: 1, block: 1 });
    expect(result.report.gaps).toHaveLength(3);
  });

  it('saves and opens again unchanged', () => {
    const result = importAliceWorld(smallAliceWorld());
    if (!result.ok) throw new Error(result.problem.message);
    const opened = openProduction(saveProduction(result.production));
    expect(opened.status).toBe('ok');
    if (opened.status === 'ok') expect(opened.production).toEqual(result.production);
  });

  it('can be written as an older Alice', () => {
    const bytes = aliceArchive(world([], []), '3.1.0.0.0');
    expect(readA3p(bytes)).toMatchObject({ ok: true });
  });
});
