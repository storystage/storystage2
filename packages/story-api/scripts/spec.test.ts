import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { withSpecTables } from '../src/catalog/spec-tables.ts';

describe('docs/spec/02-story-api.md', () => {
  it('has tables that match the metadata (pnpm --filter @storystage/story-api spec)', () => {
    const path = new URL('../../../docs/spec/02-story-api.md', import.meta.url);
    const spec = readFileSync(path, 'utf8').replaceAll('\r\n', '\n');
    expect(withSpecTables(spec)).toBe(spec);
  });
});
