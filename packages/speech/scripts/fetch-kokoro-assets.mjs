#!/usr/bin/env node
/**
 * Speak line's engine files (decision 0068; spec 06, 4.6), each pinned and checked, laid out as
 * `KokoroEngine` expects (`src/speak-line/kokoro-protocol.ts`):
 *
 *   <out>/kokoro/model_quantized.onnx, tokenizer.json   Kokoro-82M, 8-bit (Apache-2.0)
 *   <out>/kokoro/voices/<name>.bin                    its British and American voices
 *   <out>/kokoro/en-us.txt                            the CMU dictionary in Kokoro's phonemes
 *                                                     (BSD), from HeadTTS 1.3.0's npm package
 *   <out>/kokoro/en-GB-x-rp.dict                      Reece Dunn's RP list (BSD-2-Clause)
 *   <out>/kokoro/licences/…                           the licence and notice files
 *   <out>/ort/ort-wasm-simd-threaded.{mjs,wasm}       ONNX Runtime Web (MIT), from node_modules
 *   <out>/kokoro/SHA256SUMS, files.json               every file's SHA-256; files.json adds its
 *                                                     size, for the browser's one download
 *
 * For the browser test now; the apps bundle the same files (WP15, S8).
 * Usage (from packages/speech): node scripts/fetch-kokoro-assets.mjs <cache-dir> <out-dir>
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

const [cacheArg, outArg] = process.argv.slice(2);
if (!cacheArg || !outArg) throw new Error('Usage: fetch-kokoro-assets.mjs <cache-dir> <out-dir>');
const cache = resolve(cacheArg);
const out = resolve(outArg);
const sums = [];
/** Each file, its size and SHA-256, for the browser's download (src/speak-line/kokoro-files.ts). */
const files = [];

const sha256 = (b) => createHash('sha256').update(b).digest('hex');
async function fetchChecked(url, name, pin) {
  const file = join(cache, name);
  if (!existsSync(file) || sha256(readFileSync(file)) !== pin) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  if (sha256(readFileSync(file)) !== pin) throw new Error(`SHA-256 mismatch for ${name}`);
  return file;
}
function place(from, to) {
  mkdirSync(dirname(join(out, to)), { recursive: true });
  copyFileSync(from, join(out, to));
  const bytes = readFileSync(from);
  sums.push(`${sha256(bytes)}  ${to}`);
  files.push({ path: to, bytes: bytes.length, sha256: sha256(bytes) });
}

// --- Kokoro-82M (onnx-community/Kokoro-82M-v1.0-ONNX) ----------------------------------------
// Pinned to a commit, so an upstream change can't break the build (the SHA-256s keep it out anyway).
const HF =
  'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/1939ad2a8e416c0acfeecc08a694d14ef25f2231';
const KOKORO = {
  // 8-bit weights, full-precision activations. Not model_q8f16: its half-precision maths gave
  // NaN for some voices and lines in the worker (bf_isabella's "Here is the key.", 11 Nov 2026).
  'onnx/model_quantized.onnx': 'fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478',
  'tokenizer.json': '77a02c8e164413299b4b4c403b14f8e0e1c1b727db4d46a09d6327b861060a34',
  // British (presets.ts BASE_VOICES.british)
  'voices/bf_emma.bin': '669fe0647f9dd04fcab92f1439a40eeb4c8b4ab1f82e4996fe3d918ce4a63b73',
  'voices/bf_isabella.bin': '3754352c4aaa46d17f27654ab7518d65b62ad6163a0f55a5f4330c2da2c4e94f',
  'voices/bf_lily.bin': '5e0ee32ebe64a467124976b14e69590746f1c4ce41a12b587a50c862edfea335',
  'voices/bf_alice.bin': '08afa6ba24da61ea5e8efa139e5aadc938d83f0a6da5a900adaf763ac1da5573',
  'voices/bm_george.bin': 'c4b235a4c1f2cd3b939fed08b899ce9385638b763f7b73a59616c4fc9bd6c9bc',
  'voices/bm_lewis.bin': 'b8f671cef828c30e66fdf0b0756a76bba58f6bb3398cbbf27058642acbcedb97',
  'voices/bm_daniel.bin': '6b3194bbceffb746733cbc22c8f593dd44e401a71d53895a2dca891bc595a1e8',
  'voices/bm_fable.bin': 'f889083196807b4adb15e9204252165f503b8d33d3982e681c52443c49d798f1',
  // American (presets.ts BASE_VOICES.american)
  'voices/af_heart.bin': 'd583ccff3cdca2f7fae535cb998ac07e9fcb90f09737b9a41fa2734ec44a8f0b',
  'voices/af_bella.bin': 'f69d836209b78eb8c66e75e3cda491e26ea838a3674257e9d4e5703cbaf55c8b',
  'voices/af_nicole.bin': 'cd2191ab31b914ed7b318416b0e4440fdf392ddad9106a060819aa600a64f59a',
  'voices/af_sarah.bin': '4409fbc125afabacc615d94db5398d847006a737b0247d6892b7a9a0007a2f0a',
  'voices/af_sky.bin': '4435255c9744f3f31659e0d714ab7689bf65d9e77ec1cce060f083912614f0b9',
  'voices/af_nova.bin': '18778272caa0d0eebaea251c35fd635f038434f9eee5e691d02a174bd328414f',
  'voices/af_river.bin': '00a2bcf82b1d86e8f19902ede58c65ccf6c0e43b44b7d74fad54e5d8933c9c30',
  'voices/am_adam.bin': '162b035ed91cfc48b6046982184c645f72edcdd1b82843347f605d7bf7b15716',
  'voices/am_michael.bin': '1d1f21dd8da39c30705cd4c75d039d265e9bc4a2a93ed09bc9e1b1225eb95ba1',
  'voices/am_eric.bin': 'e8b5be17edd1e3636901ce7598baafe2dc8dd8ff707a0c23bf9e461add7e2832',
  'voices/am_liam.bin': '52403be32fd047c6a44517cb0bcd6b134f2a18baa73e70ef41651e0eab921ade',
  'voices/am_onyx.bin': 'da5d135b424164916d75a68ffb4c2abce3d7d5ccc82dd1ee6cf447ce286145e6',
  'voices/am_echo.bin': '3968b92c3c4cd1c4416dbded36c13eaa388a90d5788d02a13e4d781f5f8cf3c3',
  'voices/am_puck.bin': 'fcf73c989033e9233e0b98713eca600c8c74dcc1614b37009d5450ff4a2274a0',
};
for (const [path, pin] of Object.entries(KOKORO))
  place(
    await fetchChecked(`${HF}/${path}`, `kokoro/${path}`, pin),
    `kokoro/${path.replace(/^onnx\//, '')}`,
  );

// --- the CMU dictionary in Kokoro's phonemes, from HeadTTS 1.3.0's npm tarball -----------------
const TARBALL = 'https://registry.npmjs.org/@met4citizen/headtts/-/headtts-1.3.0.tgz';
const INTEGRITY =
  'N396/IPQxFt8dxGw29dfH8avgopLI52pWI8mdhfK4GScD4McF0U8Qb8LlzgnT1FqC+NVtVvNYFT9umcusbxl7w==';
const tgz = join(cache, 'headtts-1.3.0.tgz');
const integrity = () => createHash('sha512').update(readFileSync(tgz)).digest('base64');
if (!existsSync(tgz) || integrity() !== INTEGRITY) {
  const res = await fetch(TARBALL);
  if (!res.ok) throw new Error(`${TARBALL}: ${res.status}`);
  mkdirSync(cache, { recursive: true });
  writeFileSync(tgz, Buffer.from(await res.arrayBuffer()));
}
if (integrity() !== INTEGRITY) throw new Error('Integrity mismatch for headtts-1.3.0.tgz');
mkdirSync(join(cache, 'headtts-1.3.0'), { recursive: true });
// Relative paths: GNU tar reads a Windows drive letter as a remote host.
execFileSync('tar', ['-xzf', 'headtts-1.3.0.tgz', '-C', 'headtts-1.3.0'], { cwd: cache });
place(join(cache, 'headtts-1.3.0/package/dictionaries/en-us.txt'), 'kokoro/en-us.txt');

// --- Reece Dunn's RP list, pinned to its last commit --------------------------------------------
const RP =
  'https://raw.githubusercontent.com/rhdunn/en-GB-x-rp.dict/70b982a7bec4df007a6ba0a711c11bd1e4912d96';
place(
  await fetchChecked(
    `${RP}/en-GB-x-rp.dict`,
    'rp/en-GB-x-rp.dict',
    '99601a2537c46e59e8853bc8b30e01a610ebe774965bb4124c8c20daac626418',
  ),
  'kokoro/en-GB-x-rp.dict',
);
place(
  await fetchChecked(
    `${RP}/COPYING`,
    'rp/COPYING',
    '81cff8323c0f5fb7201271754f2c5b513d6d8bfecd5a9b699dde8fd04d719a53',
  ),
  'kokoro/licences/en-GB-x-rp.COPYING.txt',
);

// --- ONNX Runtime Web's WebAssembly, from node_modules ----------------------------------------
const ortDist = resolve('node_modules/onnxruntime-web/dist');
for (const f of readdirSync(ortDist).filter((f) => /^ort-wasm-simd-threaded\.(wasm|mjs)$/.test(f)))
  place(join(ortDist, f), `ort/${f}`);

writeFileSync(join(out, 'kokoro', 'SHA256SUMS'), `${sums.join('\n')}\n`);
writeFileSync(join(out, 'kokoro', 'files.json'), `${JSON.stringify(files, null, 1)}\n`);
console.log(`Kokoro's files ready in ${out} (${sums.length} files)`);
