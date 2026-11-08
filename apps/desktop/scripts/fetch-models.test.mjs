import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { fetchModel, matchesPin, readPins } from './fetch-models.mjs';

const bytes = Buffer.from('a small stand-in for a model');
const model = {
  name: 'test',
  file: 'test.bin',
  bytes: bytes.length,
  sha256: createHash('sha256').update(bytes).digest('hex'),
  bundled: true,
};
const serving = (body, status = 200) => {
  const asked = [];
  const fetchImpl = async (url) => {
    asked.push(url);
    return new Response(body, { status });
  };
  return { asked, fetchImpl };
};

let dir;
afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));
const freshDir = () => (dir = mkdtempSync(join(tmpdir(), 'fetch-models-')));

test('the pins are the two models in spec 05 section 5.1, one bundled', () => {
  const pins = readPins();
  expect(pins.models.map((m) => [m.name, m.bundled])).toEqual([
    ['tiny.en-q5_1', true],
    ['tiny.en', false],
  ]);
  for (const m of pins.models) expect(m.sha256).toMatch(/^[0-9a-f]{64}$/);
  expect(pins.source).toMatch(/^https:\/\//);
  expect(pins.downloads).toMatch(/^https:\/\//);
});

test('a file is checked by size and SHA-256', () => {
  expect(matchesPin(bytes, model)).toBe(true);
  expect(matchesPin(Buffer.from('something else entirely, longer'), model)).toBe(false);
  const sameSize = Buffer.from(bytes);
  sameSize[0] ^= 1;
  expect(matchesPin(sameSize, model)).toBe(false);
});

test('a matching file is fetched from the source and kept', async () => {
  const { asked, fetchImpl } = serving(bytes);
  expect(await fetchModel('https://models.test/', model, freshDir(), fetchImpl)).toBe('fetched');
  expect(asked).toEqual(['https://models.test/test.bin']);
  expect(readFileSync(join(dir, 'test.bin'))).toEqual(bytes);
  expect(existsSync(join(dir, 'test.bin.part'))).toBe(false);
});

test('a changed upstream file fails, and nothing is kept', async () => {
  const { fetchImpl } = serving(Buffer.from('a changed file, of another size'));
  await expect(fetchModel('https://models.test/', model, freshDir(), fetchImpl)).rejects.toThrow(
    /doesn't match its pin/,
  );
  expect(existsSync(join(dir, 'test.bin'))).toBe(false);
});

test('a server error fails', async () => {
  const { fetchImpl } = serving('gone', 404);
  await expect(fetchModel('https://models.test/', model, freshDir(), fetchImpl)).rejects.toThrow(
    /404/,
  );
});

test('a matching copy already there is kept without fetching', async () => {
  writeFileSync(join(freshDir(), 'test.bin'), bytes);
  const { asked, fetchImpl } = serving(bytes);
  expect(await fetchModel('https://models.test/', model, dir, fetchImpl)).toBe('kept');
  expect(asked).toEqual([]);
});

test('a copy that no longer matches is fetched again', async () => {
  writeFileSync(join(freshDir(), 'test.bin'), 'tampered');
  const { asked, fetchImpl } = serving(bytes);
  expect(await fetchModel('https://models.test/', model, dir, fetchImpl)).toBe('fetched');
  expect(asked).toHaveLength(1);
  expect(readFileSync(join(dir, 'test.bin'))).toEqual(bytes);
});
