/** Messages between `KokoroEngine` (main thread) and `kokoro-worker.ts`. */
import type { Accent } from './presets.ts';

/**
 * Where Kokoro's files are (`scripts/fetch-kokoro-assets.mjs` lays them out): `assets` holds
 * `model_q8f16.onnx`, `tokenizer.json`, `en-us.txt`, `en-GB-x-rp.dict` and `voices/<name>.bin`;
 * `wasm` holds ONNX Runtime's `ort-wasm-simd-threaded.{mjs,wasm}`. Both end in `/`.
 */
export interface KokoroPlaces {
  readonly assets: string;
  readonly wasm: string;
}

/**
 * How Kokoro runs: ONNX Runtime's threads, 1 by default (more hang inside the worker today; see
 * `kokoro-worker.ts`), and always 1 when the page isn't cross-origin isolated.
 */
export interface KokoroOptions {
  readonly threads?: number;
}

export type ToKokoro =
  | { readonly type: 'load'; readonly places: KokoroPlaces; readonly options?: KokoroOptions }
  | {
      readonly type: 'speak';
      readonly id: number;
      readonly text: string;
      readonly base: string;
      readonly accent: Accent;
    };

export type FromKokoro =
  | { readonly type: 'ready'; readonly loadMs: number }
  | { readonly type: 'log'; readonly line: string }
  | { readonly type: 'spoken'; readonly id: number; readonly samples: Float32Array }
  | { readonly type: 'failed'; readonly id?: number; readonly message: string };
