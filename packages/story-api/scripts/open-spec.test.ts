import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import { PROGRAM_SCHEMA } from '@storystage/ast';
import { describe, expect, it } from 'vitest';
import {
  buildCatalog,
  CATALOG_SCHEMA,
  PROGRAM_SCHEMA_ID,
  STORY_API_VERSION,
} from '../src/catalog/open-spec.ts';
import { OPEN_SPEC_DIR, openSpecFiles, publishedProgramSchema } from './open-spec.ts';

const onDisk = (name: string) =>
  readFileSync(new URL(name, OPEN_SPEC_DIR), 'utf8').replaceAll('\r\n', '\n');

describe('docs/story-api/, the open specification', () => {
  it.each(Object.entries(openSpecFiles()))(
    '%s matches the metadata (pnpm --filter @storystage/story-api open-spec)',
    (name, expected) => {
      expect(onDisk(name)).toBe(expected);
    },
  );

  it('has a changelog entry for this version, first', () => {
    const first = /^## (\S+)/m.exec(onDisk('CHANGELOG.md'))?.[1];
    expect(first).toBe(STORY_API_VERSION);
  });

  it('names its version in the reference', () => {
    expect(onDisk('README.md')).toContain(`Version ${STORY_API_VERSION}`);
  });
});

describe('the catalog against its schema', () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true });

  it('is a valid JSON Schema, which the catalog passes', () => {
    const validate = ajv.compile(CATALOG_SCHEMA);
    expect(validate(buildCatalog()), JSON.stringify(validate.errors?.slice(0, 3))).toBe(true);
  });

  it('refuses a catalog with a block of an unknown kind', () => {
    const validate = new Ajv2020({ strict: true }).compile(CATALOG_SCHEMA);
    const catalog = buildCatalog();
    const bad = { ...catalog, blocks: [{ ...catalog.blocks[0]!, kind: 'spell' }] };
    expect(validate(bad)).toBe(false);
  });
});

describe('the catalog holds together', () => {
  const catalog = buildCatalog();
  const classes = new Set(catalog.classes.map((c) => c.name));
  const values = new Set(catalog.values.map((v) => v.name));
  const one = (type: string) => type.replace(/\[\]$/, '');
  const isType = (type: string) =>
    [...catalog.types.basic, ...catalog.types.references].includes(one(type)) ||
    values.has(one(type)) ||
    (classes.has(one(type)) && one(type) !== 'Text') ||
    one(type) === 'TextModel';

  it('uses only types it defines', () => {
    const used = [
      ...catalog.blocks.flatMap((b) => [
        ...b.params.map((p) => p.type),
        ...('returns' in b && b.returns ? [b.returns] : []),
      ]),
      ...catalog.events.flatMap((e) => [...e.needs, ...e.gives].map((p) => p.type)),
      ...catalog.details.map((d) => d.type),
    ];
    expect([...new Set(used)].filter((t) => !isType(t))).toEqual([]);
  });

  it('puts every block on a class it defines, and every parent too', () => {
    expect(catalog.blocks.filter((b) => !classes.has(b.class))).toEqual([]);
    expect(catalog.classes.filter((c) => c.extends !== null && !classes.has(c.extends))).toEqual(
      [],
    );
  });

  it('names only details it defines', () => {
    const details = new Set(catalog.details.map((d) => d.name));
    const named = [...catalog.blocks, ...catalog.events].flatMap((x) => x.details);
    expect(named.filter((d) => !details.has(d))).toEqual([]);
  });

  it('leaves out how StoryStage runs a block', () => {
    expect(JSON.stringify(catalog)).not.toMatch(/"runs"|needs:/);
  });
});

describe('the program schema', () => {
  it('is S2’s, named as the specification names it', () => {
    const published = publishedProgramSchema();
    expect(published.$id).toBe(PROGRAM_SCHEMA_ID);
    expect({ ...published, $id: PROGRAM_SCHEMA.$id }).toEqual(PROGRAM_SCHEMA);
  });

  it('is a valid JSON Schema', () => {
    const ajv = new Ajv2020({ strict: false });
    expect(() => ajv.compile(publishedProgramSchema())).not.toThrow();
  });
});
