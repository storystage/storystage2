import { checkBoundaries } from './boundaries.ts';
import { readWorkspace } from './workspace.ts';

const errors = checkBoundaries(readWorkspace(process.cwd()));
if (errors.length) {
  console.error(`Package boundary check failed:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
  process.exit(1);
}
console.log('Package boundaries: OK');
