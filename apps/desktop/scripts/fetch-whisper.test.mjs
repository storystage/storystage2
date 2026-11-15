import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { fetchWhisper, readWhisperPins } from './fetch-whisper.mjs';

const file = (name, text) => {
  const bytes = Buffer.from(text);
  return {
    file: name,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    text,
  };
};
const script = file('whisper.js', 'a small stand-in for whisper.js');
const licence = file('LICENSE-whisper.cpp.txt', 'MIT');
const pins = { source: 'https://example.test/release/', files: [script, licence] };
const serving = (bodies) => async (url) => {
  const name = url.split('/').at(-1);
  return name in bodies ? new Response(bodies[name]) : new Response('', { status: 404 });
};

let dir;
afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

test('the pins are whisper.js and its licence, from this repository’s release', () => {
  const real = readWhisperPins();
  expect(real.source).toBe(
    'https://github.com/storystage/storystage2/releases/download/whisper-js-v1.9.5/',
  );
  expect(real.files.map((f) => f.file)).toEqual(['whisper.js', 'LICENSE-whisper.cpp.txt']);
  for (const f of real.files) expect(f.sha256).toMatch(/^[0-9a-f]{64}$/);
});

test('fetches and checks each file, and lists them for the app’s build', async () => {
  dir = mkdtempSync(join(tmpdir(), 'fetch-whisper-'));
  await fetchWhisper(
    dir,
    pins,
    serving({ 'whisper.js': script.text, 'LICENSE-whisper.cpp.txt': licence.text }),
  );
  expect(readFileSync(join(dir, 'whisper.js'), 'utf8')).toBe(script.text);
  const list = JSON.parse(readFileSync(join(dir, 'whisper', 'files.json'), 'utf8'));
  expect(list).toEqual([
    { path: 'whisper.js', bytes: script.bytes, sha256: script.sha256 },
    { path: 'LICENSE-whisper.cpp.txt', bytes: licence.bytes, sha256: licence.sha256 },
  ]);
});

test('refuses a whisper.js that isn’t the pinned one', async () => {
  dir = mkdtempSync(join(tmpdir(), 'fetch-whisper-'));
  const tampered = serving({
    'whisper.js': 'something else entirely!!',
    'LICENSE-whisper.cpp.txt': licence.text,
  });
  await expect(fetchWhisper(dir, pins, tampered)).rejects.toThrow(/doesn't match its pin/);
});
