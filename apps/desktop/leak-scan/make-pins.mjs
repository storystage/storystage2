// Writes pins for the leak scan's own request: the shipped pins refuse everything until S7 sets
// them, and then the scan would never reach the key.
//
//   node make-pins.mjs <out.json>

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const here = new URL('.', import.meta.url);
const read = (path) => JSON.parse(readFileSync(new URL(path, here), 'utf8'));
const sha256 = (text) => createHash('sha256').update(text).digest('hex');

/** The hash in spec 05 section 2.3: JSON with keys sorted and no spaces. */
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const fixture = read('request.json');
const pins = {
  ...read('../src-tauri/gate/pins.json'),
  system: sha256(canonical(fixture.system)),
  tools: sha256(canonical(fixture.tools)),
  modeMessages: [sha256(fixture.modeMessage)],
};
writeFileSync(process.argv[2], `${JSON.stringify(pins, null, 2)}\n`);
