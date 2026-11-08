// Fetches the speech models pinned in src-tauri/speech-models.json and checks each against its
// size and SHA-256 (spec 05 section 5.2). Any mismatch fails, so a changed upstream file never
// reaches a build. A file already there and matching is left alone.
//
//   node fetch-models.mjs          the bundled models, into src-tauri/resources/speech/
//   node fetch-models.mjs <dir>    every model, into <dir>, for publishing the optional one

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const pinsFile = join(here, '../src-tauri/speech-models.json');

export const readPins = () => JSON.parse(readFileSync(pinsFile, 'utf8'));

/** True if the bytes are exactly the pinned model. */
export function matchesPin(bytes, model) {
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  return bytes.length === model.bytes && sha256 === model.sha256;
}

/** Fetches one model into `dir`, unless a matching copy is there already. */
export async function fetchModel(source, model, dir, fetchImpl = fetch) {
  const target = join(dir, model.file);
  if (existsSync(target) && matchesPin(readFileSync(target), model)) return 'kept';
  const reply = await fetchImpl(`${source}${model.file}`);
  if (!reply.ok) throw new Error(`${model.file}: the server answered ${reply.status}`);
  const bytes = Buffer.from(await reply.arrayBuffer());
  if (!matchesPin(bytes, model)) {
    throw new Error(`${model.file} doesn't match its pin: ${bytes.length} bytes`);
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${target}.part`, bytes);
  rmSync(target, { force: true });
  renameSync(`${target}.part`, target);
  return 'fetched';
}

async function main([dir]) {
  const pins = readPins();
  const models = dir ? pins.models : pins.models.filter((model) => model.bundled);
  const into = dir ?? join(here, '../src-tauri/resources/speech');
  for (const model of models) {
    console.log(`${model.file}: ${await fetchModel(pins.source, model, into)}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
