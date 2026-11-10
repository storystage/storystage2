import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** A source file's imports and re-exports that load code: `import type` and `export type` don't. */
function loads(file: string): string[] {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8');
  return [...source.matchAll(/^(?:import|export)\s+(?!type\b)[^;]*?from '([^']+)'/gms)].map(
    (m) => m[1]!,
  );
}

/** Everything a file loads, following this package's own files. */
function loadsAll(file: string, seen = new Set<string>()): Set<string> {
  for (const target of loads(file)) {
    if (seen.has(target)) continue;
    seen.add(target);
    if (target.startsWith('./')) loadsAll(target, seen);
  }
  return seen;
}

const packagesOf = (all: Set<string>) => new Set([...all].filter((t) => !t.startsWith('./')));
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

describe('the light subpaths the studio loads (S5)', () => {
  it('./pack, on every save: never the model readers, the simplifier or the pipeline', async () => {
    expect(pkg.exports['./pack']).toBe('./src/light-pack.ts');
    expect(packagesOf(loadsAll('./light-pack.ts'))).toEqual(
      new Set(['@storystage/backstage', '@storystage/production']),
    );
    const pack = await import('@storystage/backstage-import/pack');
    expect(typeof pack.packModels).toBe('function');
    expect(typeof pack.modelPackFromClass).toBe('function');
  });

  it('./worker-client, on the import screen: importModel loads only in the worker', async () => {
    expect(pkg.exports['./worker-client']).toBe('./src/worker-client.ts');
    const all = loadsAll('./worker-client.ts');
    expect([...all].filter((t) => t.startsWith('./')).sort()).toEqual(['./licence.ts']);
    expect(packagesOf(all)).toEqual(new Set(['@storystage/backstage']));
    const client = await import('@storystage/backstage-import/worker-client');
    expect(typeof client.importInWorker).toBe('function');
    expect(client.LICENCE_PROBLEMS.needsSource).toMatch(/model's own page/);
  });

  it('notices code loaded through a re-export, so the check can’t be fooled', () => {
    expect(loads('./index.ts')).toContain('./import.ts');
  });
});
