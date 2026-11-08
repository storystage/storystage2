/**
 * Runs the fake server for the native layer's tests (WP15.2):
 *
 *   pnpm --filter @storystage/fake-claude start -- --port 8787 --recording refusal
 */
import { parseArgs } from 'node:util';
import { RECORDINGS } from './recordings.ts';
import { startFakeClaude } from './server.ts';

const { values } = parseArgs({
  options: {
    port: { type: 'string', default: '8787' },
    recording: { type: 'string', multiple: true },
    'require-key': { type: 'boolean', default: false },
  },
});

const chosen = values.recording?.length
  ? RECORDINGS.filter((r) => values.recording?.includes(r.id))
  : RECORDINGS;
const server = await startFakeClaude({
  port: Number(values.port),
  requireKey: values['require-key'],
});
server.use(...chosen);
console.log(`Fake Claude at ${server.url}, ${chosen.length} recording(s).`);
