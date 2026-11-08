import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('@storystage/backstage-import/pack', () => {
  it('stays light: the studio loads it on every save, before any import (S5)', () => {
    const source = readFileSync(new URL('./pack.ts', import.meta.url), 'utf8');
    const imports = [...source.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    // Never the model readers, the simplifier or the import pipeline.
    expect(new Set(imports)).toEqual(new Set(['@storystage/backstage', '@storystage/production']));
  });

  it('is a subpath of its own', async () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    expect(pkg.exports['./pack']).toBe('./src/pack.ts');
    const pack = await import('@storystage/backstage-import/pack');
    expect(typeof pack.packModels).toBe('function');
    expect(typeof pack.modelsUsed).toBe('function');
  });
});
