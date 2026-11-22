/**
 * Writes "What ships" in the licence audit (`docs/legal/licence-audit.md`, between
 * `<!-- shipped -->` and `<!-- /shipped -->`) from the Backstage that `backstage.lock.json` pins,
 * and fails if any shipped item breaks the audit's rules (section 2).
 *
 *   pnpm backstage:fetch && node tools/backstage-sources/src/audit-cli.ts [backstage.json]
 *
 * The manifest defaults to the fetched `.backstage/backstage.json`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BackstageManifest } from '@storystage/backstage';
import { auditProblems, shippedTable } from './audit.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const manifestPath = resolve(process.argv[2] ?? resolve(root, '.backstage', 'backstage.json'));
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as BackstageManifest;
const lock = JSON.parse(readFileSync(resolve(root, 'backstage.lock.json'), 'utf8')) as {
  repository: string;
  commit: string;
};

const problems = auditProblems(manifest);
if (problems.length) {
  console.error(`Shipped items that break the audit's rules:\n${problems.join('\n')}`);
  process.exit(1);
}

const auditPath = resolve(root, 'docs', 'legal', 'licence-audit.md');
const page = readFileSync(auditPath, 'utf8');
const [start, end] = ['<!-- shipped -->', '<!-- /shipped -->'];
const a = page.indexOf(start);
const b = page.indexOf(end);
if (a < 0 || b < a) {
  console.error(`licence-audit.md has no ${start} … ${end} block.`);
  process.exit(1);
}
const intro =
  `Generated from \`backstage.json\` at ${lock.repository} ${lock.commit.slice(0, 7)} ` +
  '(the commit `backstage.lock.json` pins) by `tools/backstage-sources/src/audit-cli.ts`, ' +
  "which also checks every item against section 2. Each item's own licence, credit line, page " +
  'and date are in `backstage.json`.';
writeFileSync(
  auditPath,
  `${page.slice(0, a + start.length)}\n\n${intro}\n\n${shippedTable(manifest)}\n\n${page.slice(b)}`,
);
console.log(`licence-audit.md: ${manifest.items.length} shipped models, no problems.`);
