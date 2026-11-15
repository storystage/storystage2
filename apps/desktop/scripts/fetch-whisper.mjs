// Fetches whisper.js for Talk to type (spec 06 section 1.11), from the `whisper-js-v1.9.5` release
// the `Whisper` workflow published, and checks each file against its size and SHA-256 pinned in
// src-tauri/whisper.json. It goes into `.speech/` beside speak line's engine, where the app serves
// `speech/whisper.js` from its own origin; `.speech/whisper/files.json` lists what was placed, for
// the app's build to pin (src-tauri/build.rs).
//
//   node fetch-whisper.mjs           into .speech/ at the repository's root
//   node fetch-whisper.mjs <dir>     into <dir>

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchModel } from './fetch-models.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));

export const readWhisperPins = () =>
  JSON.parse(readFileSync(join(here, '../src-tauri/whisper.json'), 'utf8'));

/** Fetches and checks every pinned file into `dir`, then lists them for the app's build. */
export async function fetchWhisper(dir, pins = readWhisperPins(), fetchImpl = fetch) {
  const placed = [];
  for (const file of pins.files) {
    const result = await fetchModel(pins.source, file, dir, fetchImpl);
    placed.push({ path: file.file, bytes: file.bytes, sha256: file.sha256, result });
  }
  mkdirSync(join(dir, 'whisper'), { recursive: true });
  const list = placed.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 }));
  writeFileSync(join(dir, 'whisper', 'files.json'), `${JSON.stringify(list, null, 1)}\n`);
  return placed;
}

async function main([dir]) {
  const into = dir ?? join(here, '../../../.speech');
  for (const { path, result } of await fetchWhisper(into)) console.log(`${path}: ${result}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
