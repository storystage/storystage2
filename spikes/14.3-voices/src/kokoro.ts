/**
 * Spike 14.3: Kokoro-82M in ONNX Runtime Web, with HeadTTS's English phonemiser (MIT) and the
 * CMU dictionary (BSD) instead of eSpeak NG. Text → Kokoro's phonemes → token ids → 24 kHz audio.
 */
// The WebAssembly-only build: no GPU code, and only ort-wasm-simd-threaded.{mjs,wasm} to serve.
import * as ort from 'onnxruntime-web/wasm';
import { rpDictionary, toBritish } from './british.ts';

export const SAMPLE_RATE = 24_000;
const MAX_TOKENS = 510;
// Absolute, from the page's own address: the spike site builds with relative paths (`--base ./`),
// and a relative import() or ONNX Runtime's wasm path would resolve against assets/, not the page.
const BASE = new URL(import.meta.env.BASE_URL, document.baseURI).href;

interface Phonemiser {
  loadDictionary(url: string): Promise<void>;
  addToDictionary(line: string): void;
  generate(text: string): { phonemes: string[] };
}

export interface Engine {
  /** Kokoro's phonemes for `text`: British for Kokoro's British voices (`b…`), else American. */
  phonemes(text: string, voice: string): string;
  /** Speaks `text` in `voice` at `speed`, giving 24 kHz samples. */
  speak(text: string, voice: string, speed?: number): Promise<Float32Array>;
  /** How long loading took, in milliseconds, by part. */
  loadMs: Record<string, number>;
  modelBytes: number;
}

export async function loadEngine(british: readonly string[]): Promise<Engine> {
  const loadMs: Record<string, number> = {};
  let t = performance.now();
  const lap = (name: string) => {
    loadMs[name] = Math.round(performance.now() - t);
    t = performance.now();
  };

  // The phonemiser comes from public/, as prepared (it's plain ES modules, MIT).
  const { Language } = (await import(/* @vite-ignore */ `${BASE}headtts/language-en-us.mjs`)) as {
    Language: new (settings: object) => Phonemiser;
  };
  const american = new Language({ trace: false });
  await american.loadDictionary(`${BASE}headtts/en-us.txt`);
  // British: the same dictionary, then the RP list, then the hand list, all turned British below.
  const britain = new Language({ trace: false });
  await britain.loadDictionary(`${BASE}headtts/en-us.txt`);
  const rp = rpDictionary(await (await fetch(`${BASE}british/en-GB-x-rp.dict`)).text());
  for (const line of [...rp, ...british]) britain.addToDictionary(line);
  lap('phonemiser');

  const tokenizer = (await (await fetch(`${BASE}kokoro/tokenizer.json`)).json()) as {
    model: { vocab: Record<string, number> };
  };
  const vocab = tokenizer.model.vocab;

  ort.env.wasm.wasmPaths = `${BASE}ort/`;
  ort.env.wasm.numThreads = crossOriginIsolated
    ? Math.min(4, navigator.hardwareConcurrency || 2)
    : 1;
  const model = await (await fetch(`${BASE}kokoro/onnx/model_q8f16.onnx`)).arrayBuffer();
  lap('download');
  const session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'] });
  lap('session');

  const voices = new Map<string, Float32Array>();
  const voiceOf = async (name: string) => {
    let v = voices.get(name);
    if (!v) {
      v = new Float32Array(await (await fetch(`${BASE}kokoro/voices/${name}.bin`)).arrayBuffer());
      voices.set(name, v);
    }
    return v;
  };

  const phonemes = (text: string, voice: string) =>
    voice.startsWith('b')
      ? toBritish(britain.generate(text).phonemes.join(''))
      : american.generate(text).phonemes.join('');

  return {
    phonemes,
    loadMs,
    modelBytes: model.byteLength,
    async speak(text, voice, speed = 1) {
      const ids = [...phonemes(text, voice)]
        .map((c) => vocab[c])
        .filter((id): id is number => id !== undefined)
        .slice(0, MAX_TOKENS);
      const style = await voiceOf(voice);
      // The style vector depends on the number of tokens (Kokoro's README).
      const ref = style.subarray(ids.length * 256, (ids.length + 1) * 256);
      const result = await session.run({
        input_ids: new ort.Tensor('int64', BigInt64Array.from([0, ...ids, 0].map(BigInt)), [
          1,
          ids.length + 2,
        ]),
        style: new ort.Tensor('float32', ref, [1, 256]),
        speed: new ort.Tensor('float32', Float32Array.from([speed]), [1]),
      });
      const out = result[session.outputNames[0]!]!;
      return new Float32Array(out.data as Float32Array);
    },
  };
}
