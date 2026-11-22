#!/usr/bin/env node
/**
 * Spike 14.3 (voices): fetches everything the page needs into public/ (not committed), each
 * file pinned and checked:
 *   - Kokoro-82M, 8-bit ONNX (Apache-2.0), its tokenizer, and ten of its voices;
 *   - HeadTTS 1.3.0 (MIT) from npm: its English phonemiser and the CMU dictionary it ships
 *     (BSD), which turn text into Kokoro's phonemes without eSpeak NG (GPL-3);
 *   - Reece Dunn's RP pronunciation list (BSD-2-Clause), for the British voices;
 *   - ONNX Runtime Web's WebAssembly files and coi-serviceworker, from node_modules;
 *   - optionally, whisper from spike 1.3, to measure how well each line is understood:
 *     pass spike 1.3's prepared public/ folder as the second argument.
 *
 * Usage (from spikes/14.3-voices): node scripts/prepare-assets.mjs <cache-dir> [whisper-public]
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const [cacheArg, whisperArg] = process.argv.slice(2);
if (!cacheArg) throw new Error('Usage: prepare-assets.mjs <cache-dir> [whisper-public]');
const cache = resolve(cacheArg);
const out = resolve('public');
const HF = 'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main';

/** Downloads `url` into the cache unless a file with the right SHA-256 is there; checks it. */
async function fetchChecked(url, name, sha256) {
  const file = join(cache, name);
  const hash = (b) => createHash('sha256').update(b).digest('hex');
  if (!existsSync(file) || hash(readFileSync(file)) !== sha256) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  if (hash(readFileSync(file)) !== sha256) throw new Error(`SHA-256 mismatch for ${name}`);
  return file;
}

function place(from, to) {
  mkdirSync(dirname(join(out, to)), { recursive: true });
  copyFileSync(from, join(out, to));
}

// --- Kokoro ---------------------------------------------------------------------------------
const KOKORO = [
  ['onnx/model_q8f16.onnx', '04c658aec1b6008857c2ad10f8c589d4180d0ec427e7e6118ceb487e215c3cd0'],
  ['tokenizer.json', '77a02c8e164413299b4b4c403b14f8e0e1c1b727db4d46a09d6327b861060a34'],
  ['voices/bf_emma.bin', '669fe0647f9dd04fcab92f1439a40eeb4c8b4ab1f82e4996fe3d918ce4a63b73'],
  ['voices/bf_isabella.bin', '3754352c4aaa46d17f27654ab7518d65b62ad6163a0f55a5f4330c2da2c4e94f'],
  ['voices/bf_lily.bin', '5e0ee32ebe64a467124976b14e69590746f1c4ce41a12b587a50c862edfea335'],
  ['voices/bf_alice.bin', '08afa6ba24da61ea5e8efa139e5aadc938d83f0a6da5a900adaf763ac1da5573'],
  ['voices/bm_george.bin', 'c4b235a4c1f2cd3b939fed08b899ce9385638b763f7b73a59616c4fc9bd6c9bc'],
  ['voices/bm_lewis.bin', 'b8f671cef828c30e66fdf0b0756a76bba58f6bb3398cbbf27058642acbcedb97'],
  ['voices/bm_daniel.bin', '6b3194bbceffb746733cbc22c8f593dd44e401a71d53895a2dca891bc595a1e8'],
  ['voices/bm_fable.bin', 'f889083196807b4adb15e9204252165f503b8d33d3982e681c52443c49d798f1'],
  ['voices/af_heart.bin', 'd583ccff3cdca2f7fae535cb998ac07e9fcb90f09737b9a41fa2734ec44a8f0b'],
  ['voices/af_sky.bin', '4435255c9744f3f31659e0d714ab7689bf65d9e77ec1cce060f083912614f0b9'],
];
for (const [path, sha] of KOKORO)
  place(await fetchChecked(`${HF}/${path}`, `kokoro/${path}`, sha), `kokoro/${path}`);

// --- HeadTTS's phonemiser and dictionary, from the npm tarball ------------------------------
const TARBALL = 'https://registry.npmjs.org/@met4citizen/headtts/-/headtts-1.3.0.tgz';
const INTEGRITY =
  'N396/IPQxFt8dxGw29dfH8avgopLI52pWI8mdhfK4GScD4McF0U8Qb8LlzgnT1FqC+NVtVvNYFT9umcusbxl7w==';
const tgz = join(cache, 'headtts-1.3.0.tgz');
if (
  !existsSync(tgz) ||
  createHash('sha512').update(readFileSync(tgz)).digest('base64') !== INTEGRITY
) {
  const res = await fetch(TARBALL);
  if (!res.ok) throw new Error(`${TARBALL}: ${res.status}`);
  mkdirSync(cache, { recursive: true });
  writeFileSync(tgz, Buffer.from(await res.arrayBuffer()));
}
if (createHash('sha512').update(readFileSync(tgz)).digest('base64') !== INTEGRITY)
  throw new Error('Integrity mismatch for headtts-1.3.0.tgz');
const unpacked = join(cache, 'headtts-1.3.0');
mkdirSync(unpacked, { recursive: true });
// Relative paths: GNU tar reads a Windows drive letter as a remote host.
execFileSync('tar', ['-xzf', 'headtts-1.3.0.tgz', '-C', 'headtts-1.3.0'], { cwd: cache });
for (const f of ['language.mjs', 'language-en-us.mjs', 'utils.mjs'])
  place(join(unpacked, 'package/modules', f), `headtts/${f}`);
place(join(unpacked, 'package/dictionaries/en-us.txt'), 'headtts/en-us.txt');
place(join(unpacked, 'package/LICENSE'), 'headtts/LICENSE-HeadTTS.txt');

// --- Reece Dunn's RP list (BSD-2-Clause), pinned to its last commit -------------------------
const RP =
  'https://raw.githubusercontent.com/rhdunn/en-GB-x-rp.dict/70b982a7bec4df007a6ba0a711c11bd1e4912d96';
place(
  await fetchChecked(
    `${RP}/en-GB-x-rp.dict`,
    'rp/en-GB-x-rp.dict',
    '99601a2537c46e59e8853bc8b30e01a610ebe774965bb4124c8c20daac626418',
  ),
  'british/en-GB-x-rp.dict',
);
place(
  await fetchChecked(
    `${RP}/COPYING`,
    'rp/COPYING',
    '81cff8323c0f5fb7201271754f2c5b513d6d8bfecd5a9b699dde8fd04d719a53',
  ),
  'british/COPYING-en-GB-x-rp.txt',
);

// --- ONNX Runtime Web and cross-origin isolation, from node_modules --------------------------
const ortDist = resolve('node_modules/onnxruntime-web/dist');
for (const f of readdirSync(ortDist).filter((f) => /^ort-wasm-simd-threaded\.(wasm|mjs)$/.test(f)))
  place(join(ortDist, f), `ort/${f}`);
place(
  resolve('node_modules/coi-serviceworker/coi-serviceworker.min.js'),
  'coi-serviceworker.min.js',
);

// --- whisper, optional ------------------------------------------------------------------------
if (whisperArg) {
  const w = resolve(whisperArg);
  place(join(w, 'main.js'), 'whisper/main.js');
  place(join(w, 'models/ggml-tiny.en-q5_1.bin'), 'whisper/ggml-tiny.en-q5_1.bin');
  console.log('whisper: copied from spike 1.3');
} else console.log('whisper: not given, so no word error rate');

console.log(`Assets ready in ${out}`);
