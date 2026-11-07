import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it, vi } from 'vitest';
import { PROGRAM_SCHEMA, validateSchema } from './schema.ts';
import { sampleProgram } from './testing.ts';

// Checking every one-spot damage takes minutes on the slowest machines.
vi.setConfig({ testTimeout: 300_000 });

const ajv = new Ajv2020({ allErrors: false, strict: false });
const realValidator = ajv.compile(PROGRAM_SCHEMA);

const accepts = (value: unknown) => validateSchema(value).length === 0;

/** Every way of damaging one spot in the JSON: changing, removing or adding a value. */
function damaged(root: unknown): unknown[] {
  const results: unknown[] = [];
  const json = JSON.stringify(root);
  const copy = () => JSON.parse(json) as Record<string, unknown>;
  const paths: (string | number)[][] = [];
  const collect = (value: unknown, path: (string | number)[]) => {
    if (Array.isArray(value)) value.forEach((v, i) => collect(v, [...path, i]));
    else if (typeof value === 'object' && value !== null)
      for (const [k, v] of Object.entries(value)) collect(v, [...path, k]);
    paths.push(path);
  };
  collect(root, []);
  const at = (value: unknown, path: (string | number)[]) =>
    path.reduce((v, k) => (v as Record<string | number, unknown>)[k], value);
  for (const path of paths) {
    if (path.length === 0) continue;
    const key = path.at(-1)!;
    for (const replacement of [null, 7, 1.5, 'word', 'bad id!', true, [], {}]) {
      const value = copy();
      (at(value, path.slice(0, -1)) as Record<string | number, unknown>)[key] = replacement;
      results.push(value);
    }
    const removed = copy();
    const parent = at(removed, path.slice(0, -1)) as Record<string | number, unknown>;
    if (Array.isArray(parent)) parent.splice(key as number, 1);
    else delete parent[key];
    results.push(removed);
    if (typeof at(root, path) === 'object' && at(root, path) !== null) {
      const added = copy();
      (at(added, path) as Record<string, unknown>).extra = 1;
      results.push(added);
    }
  }
  return results;
}

describe('PROGRAM_SCHEMA', () => {
  it('is a real JSON Schema, which Ajv compiles and the sample passes', () => {
    expect(ajv.validateSchema(PROGRAM_SCHEMA)).toBe(true);
    expect(realValidator(sampleProgram())).toBe(true);
  });

  it('is plain JSON, so that it can be published', () => {
    expect(JSON.parse(JSON.stringify(PROGRAM_SCHEMA))).toEqual(PROGRAM_SCHEMA);
  });

  it('agrees with Ajv on the sample and on every one-spot damage to it', () => {
    const cases = damaged(sampleProgram());
    expect(cases.length).toBeGreaterThan(1000);
    const disagreements = cases.filter((c) => accepts(c) !== realValidator(c));
    expect(disagreements.slice(0, 3)).toEqual([]);
  });
});

describe('validateSchema', () => {
  it('says where the problem is', () => {
    const p = sampleProgram();
    const [problem] = validateSchema({ ...p, schemaVersion: 7 });
    expect(problem?.at).toBe('/schemaVersion');
  });

  it('stops after a few problems, however broken the file', () => {
    const types = Array.from({ length: 500 }, () => ({ kind: 'wrong' }));
    expect(validateSchema({ schemaVersion: '1.0.0', types }).length).toBeLessThanOrEqual(20);
  });
});
