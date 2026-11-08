import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import manifest from '../starters.json' with { type: 'json' };
import { decodeAlice, listProp, nodesOf, textProp } from './decode.ts';
import { readA3p } from './read.ts';
import { importSetUp } from './world.ts';

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
      // Spec 19, section 2: every key resolves, into one graph holding Program and Scene.
      const program = decodeAlice(file.program);
      expect(textProp(program, 'name')).toBe('Program');
      const types = [...nodesOf(program)].filter((n) => n.type === 'NamedUserType');
      expect(types.map((t) => textProp(t, 'name'))).toContain('Scene');
      expect(listProp(program, 'methods').length).toBeGreaterThan(0);
      // Spec 19, sections 3 and 4: the scene's objects, each once, and nothing lost unreported.
      const w = importSetUp(program);
      const ids = w.setup.objects.map((o) => o.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.length).toBeGreaterThan(0);
      for (const o of w.setup.objects)
        if (typeof o.model !== 'string') expect(o.model.standIn).toMatch(/^[A-Z]/);
      expect(w.gaps.filter((g) => g.kind === 'class')).toEqual([]);
      for (const g of w.gaps) expect(g.why).toMatch(/.$/);
      for (const resource of file.resources)
        expect(resource.bytes, resource.entryName).not.toBeNull();
    });
});
