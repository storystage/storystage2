import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import manifest from '../starters.json' with { type: 'json' };
import { readA3p } from './read.ts';

// WP9's done-when, for 9.1: Alice's 34 starter projects read with no errors. They're Carnegie
// Mellon's files, fetched rather than kept here (`scripts/fetch-starters.ts`); CI sets
// ALICE_STARTERS to where it fetched them. Without it, this is skipped.

const folder = process.env['ALICE_STARTERS'];

describe.skipIf(!folder)('Alice’s 34 starter projects', () => {
  it('are the 34 the manifest pins', () => {
    expect(manifest.files).toHaveLength(34);
  });

  for (const { name } of manifest.files)
    it(`reads ${name}`, () => {
      const bytes = new Uint8Array(readFileSync(join(folder!, name)));
      const result = readA3p(bytes);
      if (!result.ok) throw new Error(`${name}: ${result.problem.code}`);
      const { file } = result;
      expect(file.kind).toBe('world');
      expect(file.version.major).toBe(3);
      expect(file.program.name).toBe('node');
      expect(file.program.attributes['type']).toBe('org.lgna.project.ast.NamedUserType');
      expect(file.thumbnail).not.toBeNull();
      for (const resource of file.resources)
        expect(resource.bytes, resource.entryName).not.toBeNull();
    });
});
