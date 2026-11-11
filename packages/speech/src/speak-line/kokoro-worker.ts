/**
 * The speak line engine's worker (spec 06, 4.6): loads Kokoro once, then speaks one line at a
 * time, so the studio stays responsive while lines are prepared. Started by `KokoroEngine`.
 */
// The WebAssembly-only build: no GPU code, and only ort-wasm-simd-threaded.{mjs,wasm} to serve.
import * as ort from 'onnxruntime-web/wasm';
import { KokoroCore, type KokoroSession } from './kokoro-core.ts';
import type { FromKokoro, KokoroOptions, KokoroPlaces, ToKokoro } from './kokoro-protocol.ts';

interface WorkerScope {
  readonly crossOriginIsolated: boolean;
  postMessage(message: FromKokoro, transfer?: Transferable[]): void;
  addEventListener(type: 'message', listener: (event: { data: ToKokoro }) => void): void;
}

const scope = globalThis as unknown as WorkerScope;
const send = (m: FromKokoro, transfer: Transferable[] = []) => scope.postMessage(m, transfer);

const log = (line: string) => send({ type: 'log', line });

async function load(places: KokoroPlaces, options: KokoroOptions = {}): Promise<KokoroCore> {
  const text = async (file: string) => {
    const res = await fetch(`${places.assets}${file}`);
    if (!res.ok) throw new Error(`${file}: ${res.status}`);
    return res.text();
  };
  const bytes = async (file: string) => {
    const res = await fetch(`${places.assets}${file}`);
    if (!res.ok) throw new Error(`${file}: ${res.status}`);
    return res.arrayBuffer();
  };
  ort.env.wasm.wasmPaths = places.wasm;
  // One thread unless asked for more: with several, ONNX Runtime's own thread start-up hangs
  // inside this worker (seen in Chromium and Edge, 11 Nov 2026), and lines are prepared in the
  // background anyway, leaving the other cores to the stage and the interface.
  ort.env.wasm.numThreads = scope.crossOriginIsolated ? (options.threads ?? 1) : 1;
  log(`threads: ${ort.env.wasm.numThreads}`);
  const [tokenizer, dictionary, rp, model] = await Promise.all([
    text('tokenizer.json'),
    text('en-us.txt'),
    text('en-GB-x-rp.dict'),
    bytes('model_q8f16.onnx'),
  ]);
  log(`files fetched, model ${model.byteLength} bytes`);
  const ortSession = await ort.InferenceSession.create(model, { executionProviders: ['wasm'] });
  log('session created');
  const session: KokoroSession = {
    async run(inputIds, style, speed) {
      const out = await ortSession.run({
        input_ids: new ort.Tensor('int64', inputIds, [1, inputIds.length]),
        style: new ort.Tensor('float32', style, [1, style.length]),
        speed: new ort.Tensor('float32', Float32Array.from([speed]), [1]),
      });
      return new Float32Array(out[ortSession.outputNames[0]!]!.data as Float32Array);
    },
  };
  const voices = new Map<string, Promise<Float32Array>>();
  const voice = (name: string) => {
    let v = voices.get(name);
    if (!v) {
      v = bytes(`voices/${name}.bin`).then((b) => new Float32Array(b));
      voices.set(name, v);
    }
    return v;
  };
  const core = new KokoroCore({ tokenizer, dictionary, rp }, session, voice);
  log('phonemisers ready');
  return core;
}

let core: Promise<KokoroCore> | null = null;
let queue = Promise.resolve();

scope.addEventListener('message', (event) => {
  const m = event.data;
  if (m.type === 'load') {
    const started = performance.now();
    core = load(m.places, m.options);
    core.then(
      () => send({ type: 'ready', loadMs: Math.round(performance.now() - started) }),
      (e: unknown) => send({ type: 'failed', message: e instanceof Error ? e.message : String(e) }),
    );
    return;
  }
  // One line at a time, in the order asked.
  queue = queue.then(async () => {
    try {
      if (!core) throw new Error('Kokoro is not loaded.');
      const samples = await (await core).speak(m.text, { base: m.base, accent: m.accent });
      send({ type: 'spoken', id: m.id, samples }, [samples.buffer]);
    } catch (e) {
      send({ type: 'failed', id: m.id, message: e instanceof Error ? e.message : String(e) });
    }
  });
});
