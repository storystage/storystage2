/**
 * The files of the open specification (`docs/story-api/`), as they should be. `open-spec-cli.ts`
 * writes them, and `open-spec.test.ts` fails when what's on disk differs.
 */
import { readFileSync } from 'node:fs';
import { PROGRAM_SCHEMA } from '@storystage/ast';
import { buildCatalog, CATALOG_SCHEMA, PROGRAM_SCHEMA_ID } from '../src/catalog/open-spec.ts';
import { withReferenceTables } from '../src/catalog/open-spec-reference.ts';

export const OPEN_SPEC_DIR = new URL('../../../docs/story-api/', import.meta.url);

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const read = (name: string) =>
  readFileSync(new URL(name, OPEN_SPEC_DIR), 'utf8').replaceAll('\r\n', '\n');

/** S2's program schema, named as the specification names it (decision 0055). */
export const publishedProgramSchema = () => ({ ...PROGRAM_SCHEMA, $id: PROGRAM_SCHEMA_ID });

/** Every generated file, by name, with its expected contents. */
export function openSpecFiles(): Record<string, string> {
  const catalog = buildCatalog();
  return {
    'story-api.json': json(catalog),
    'story-api.schema.json': json(CATALOG_SCHEMA),
    'program.schema.json': json(publishedProgramSchema()),
    'README.md': withReferenceTables(read('README.md'), catalog),
    'crosswalk.md': withReferenceTables(read('crosswalk.md'), catalog),
  };
}
