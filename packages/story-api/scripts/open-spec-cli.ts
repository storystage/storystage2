/**
 * Rewrites the open specification's generated files in `docs/story-api/` from the metadata:
 *
 *   pnpm --filter @storystage/story-api open-spec
 */
import { writeFileSync } from 'node:fs';
import { OPEN_SPEC_DIR, openSpecFiles } from './open-spec.ts';

for (const [name, text] of Object.entries(openSpecFiles())) {
  writeFileSync(new URL(name, OPEN_SPEC_DIR), text);
}
