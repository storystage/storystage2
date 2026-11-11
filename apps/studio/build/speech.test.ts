// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { shippedSpeech, speechContentType } from './speech.ts';

/** A fetched `.speech/` folder, as `pnpm speech:fetch` lays it out. */
function fetched() {
  const folder = mkdtempSync(join(tmpdir(), 'speech-'));
  mkdirSync(join(folder, 'kokoro', 'voices'), { recursive: true });
  mkdirSync(join(folder, 'ort'));
  writeFileSync(join(folder, 'kokoro', 'model_quantized.onnx'), 'model');
  writeFileSync(join(folder, 'kokoro', 'voices', 'bf_emma.bin'), 'voice');
  writeFileSync(join(folder, 'ort', 'ort-wasm-simd-threaded.mjs'), 'export {};');
  return folder;
}

/** The plugin's middleware, as the dev server would call it. */
function middlewareOf(folder: string) {
  let use: ((req: IncomingMessage, res: ServerResponse, next: () => void) => void) | undefined;
  const plugin = shippedSpeech(folder);
  (plugin.configureServer as (s: unknown) => void)({
    middlewares: { use: (m: typeof use) => (use = m) },
  });
  return (url: string) =>
    new Promise<{ status: number; type?: string; body?: string; passed?: boolean }>((done) => {
      const headers: Record<string, string> = {};
      const res = {
        statusCode: 200,
        setHeader: (k: string, v: string) => (headers[k] = String(v)),
        end: (b?: Buffer) =>
          done({ status: res.statusCode, type: headers['Content-Type'], body: b?.toString() }),
      };
      use!({ url, method: 'GET' } as IncomingMessage, res as unknown as ServerResponse, () =>
        done({ status: 0, passed: true }),
      );
    });
}

describe('shippedSpeech', () => {
  it('serves ONNX Runtime’s .mjs untransformed, and the voices as bytes', async () => {
    const call = middlewareOf(fetched());
    expect(await call('/speech/ort/ort-wasm-simd-threaded.mjs')).toEqual({
      status: 200,
      type: 'text/javascript',
      body: 'export {};',
    });
    expect(await call('/speech/kokoro/voices/bf_emma.bin')).toMatchObject({
      status: 200,
      type: 'application/octet-stream',
    });
  });

  it('passes on what it hasn’t got, so speech/whisper.js is served as before', async () => {
    const call = middlewareOf(fetched());
    expect(await call('/speech/whisper.js')).toEqual({ status: 0, passed: true });
    expect(await call('/speech/../package.json')).toEqual({ status: 0, passed: true });
    expect(await call('/index.html')).toEqual({ status: 0, passed: true });
  });

  it('copies kokoro/ and ort/ into dist/speech/ for the browser build, but not for Tauri', () => {
    const folder = fetched();
    const build = (tauri: boolean) => {
      const out = mkdtempSync(join(tmpdir(), 'dist-'));
      const plugin = shippedSpeech(folder);
      (plugin.configResolved as (c: unknown) => void)({ root: out, build: { outDir: 'dist' } });
      const before = process.env.TAURI_ENV_PLATFORM;
      if (tauri) process.env.TAURI_ENV_PLATFORM = 'windows';
      else delete process.env.TAURI_ENV_PLATFORM;
      try {
        (plugin.closeBundle as () => void)();
      } finally {
        if (before === undefined) delete process.env.TAURI_ENV_PLATFORM;
        else process.env.TAURI_ENV_PLATFORM = before;
      }
      return join(out, 'dist', 'speech');
    };
    const browser = build(false);
    expect(readFileSync(join(browser, 'kokoro', 'voices', 'bf_emma.bin'), 'utf8')).toBe('voice');
    expect(readFileSync(join(browser, 'ort', 'ort-wasm-simd-threaded.mjs'), 'utf8')).toBe(
      'export {};',
    );
    expect(() => readFileSync(join(build(true), 'kokoro', 'model_quantized.onnx'))).toThrow();
  });

  it('says what each file is', () => {
    expect(speechContentType('ort/ort-wasm-simd-threaded.wasm')).toBe('application/wasm');
    expect(speechContentType('kokoro/en-GB-x-rp.dict')).toBe('text/plain; charset=utf-8');
    expect(speechContentType('kokoro/model_quantized.onnx')).toBe('application/octet-stream');
  });
});
