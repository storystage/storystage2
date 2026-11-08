/**
 * Rewrites the generated tables in `docs/spec/02-story-api.md` from the metadata:
 *
 *   pnpm --filter @storystage/story-api spec
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { withSpecTables } from '../src/catalog/spec-tables.ts';

const path = new URL('../../../docs/spec/02-story-api.md', import.meta.url);
writeFileSync(path, withSpecTables(readFileSync(path, 'utf8')));
