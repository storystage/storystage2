// Spike 1.6: checks what the page reported and what the fake server saw.
//   node assert-1.6.mjs <spike-1.6.json> <fake-claude.log>
import { readFileSync } from 'node:fs';

const [reportFile, logFile] = process.argv.slice(2);
const r = JSON.parse(readFileSync(reportFile, 'utf8'));
const log = readFileSync(logFile, 'utf8')
  .trim()
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l));

const checks = [
  ['the page ran without an error', !r.error],
  ['status says the Prompter is available', r.status?.available === true],
  [
    'the reply streamed to the page and ended',
    r.streamed?.last?.type === 'end' && r.streamed.events >= 8,
  ],
  [
    'the streamed text arrived whole',
    r.streamed?.text === 'The move block moves an object in a direction.',
  ],
  ['a key-shaped request was refused by policy', r.keyShapedRequest?.code === 'refused_by_policy'],
  ['the wrong model for the mode was refused', r.wrongModel?.code === 'refused_by_allowlist'],
  ['an unpinned system prompt was refused', r.offAllowlistPrompt?.code === 'refused_by_allowlist'],
  [
    'exactly one request reached the network (the three refusals never left the app)',
    log.length === 1,
  ],
  ['the fake server received the stored key', log.every((e) => e.keyMatched)],
  [
    'native commands returned only the status object or nothing',
    (r.visible?.replies ?? []).every(
      (x) => x.reply === null || JSON.stringify(x.reply) === JSON.stringify({ available: true }),
    ),
  ],
];
let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) failed++;
}
console.log(
  `streamed in ${r.streamed?.ms} ms; ${r.visible?.windowKeys?.length} window properties; ${log.length} request(s) at the server`,
);
process.exit(failed ? 1 : 0);
