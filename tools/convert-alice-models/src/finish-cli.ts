/**
 * Finishes the Java converter's output (WP3.2): turns models to face +Z and writes
 * `alice-models.json` and `conversion-report.md`.
 *
 *   node tools/convert-alice-models/src/finish-cli.ts <converter output folder>
 */
import { finishAliceModels } from './finish.ts';

const dir = process.argv[2];
if (!dir) {
  console.error('Usage: finish-cli.ts <converter output folder>');
  process.exit(2);
}
const { models } = await finishAliceModels(dir);
const ok = models.filter((m) => !m.problem);
console.log(
  `${ok.length} variants finished; ${ok.filter((m) => m.skeleton === 'prop-only').length} characters prop only; ` +
    `${models.length - ok.length} not converted. See conversion-report.md.`,
);
