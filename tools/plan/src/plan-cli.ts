/**
 * `pnpm schedule:check` (CI) checks `tools/plan/schedule.yaml` and that the workplan and the
 * handover roster match it. `pnpm schedule` rewrites their generated parts and prints the
 * critical path and what each lane cap costs.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { blocks, fill, weekDate } from './render.ts';
import { criticalPath, readPlan, schedule, simulateCap } from './schedule.ts';

const write = process.argv.includes('--write');
const { plan, errors } = readPlan(
  readFileSync(new URL('../schedule.yaml', import.meta.url), 'utf8'),
);
if (!plan) {
  console.error(`Schedule check failed:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
  process.exit(1);
}
const s = schedule(plan);

for (const [file, wanted] of Object.entries(blocks(s))) {
  const current = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const filled = fill(current, wanted);
  errors.push(...filled.errors.map((e) => `${file}: ${e}`));
  if (write && !filled.errors.length && filled.text !== current) {
    writeFileSync(file, filled.text);
    console.log(`${file} updated.`);
  } else if (!write && filled.text !== current)
    errors.push(`${file} does not match schedule.yaml: run \`pnpm schedule\` and commit it.`);
}

if (errors.length) {
  console.error(`Schedule check failed:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
  process.exit(1);
}
if (write) {
  console.log(
    `Release candidate: week ${weekDate(plan, s.rc)}. Pilot ends: week ${weekDate(plan, s.pilotEnd)}.`,
  );
  console.log(`Critical path: ${criticalPath(s).join(', ')}`);
  for (const cap of plan.laneCaps) {
    const r = simulateCap(s, cap);
    console.log(`  ${cap} lanes: release candidate week ${r.rc}, pilot ends week ${r.pilotEnd}`);
  }
}
console.log(`Schedule: OK (${plan.items.length} items).`);
