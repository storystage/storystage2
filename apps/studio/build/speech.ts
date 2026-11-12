/**
 * Speak line's engine files for the browser version (spec 06, 4.6): the folder that
 * `pnpm speech:fetch` makes at the repository's root, `.speech/`, with `kokoro/` and `ort/`
 * inside, served at `speech/` beside the app, where `apps/studio/src/speech/voices.ts` looks.
 *
 * - `vite` and `vite preview` serve them from where they were fetched, untransformed: Vite's
 *   dev server won't serve ONNX Runtime's `.mjs` from `public/` (S5, 11 Nov 2026).
 * - Anything under `speech/` not in the folder is passed on, so `speech/whisper.js` is still
 *   served as before.
 * - `vite build` copies them into `dist/speech/`, for the browser version only: when Tauri is
 *   building (it sets `TAURI_ENV_PLATFORM`), nothing is copied, since the apps bundle them (S8).
 * - Without fetched files, nothing is served and speak lines stay silent, with their captions.
 */
import { cpSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Plugin } from 'vite';
import { isServed, serveFrom } from './backstage.ts';

const TYPES: Record<string, string> = {
  json: 'application/json',
  mjs: 'text/javascript',
  wasm: 'application/wasm',
  txt: 'text/plain; charset=utf-8',
  dict: 'text/plain; charset=utf-8',
};

/** The content type for one of the engine's files; ONNX models and voices are bytes. */
export function speechContentType(path: string): string {
  const dot = path.lastIndexOf('.');
  return (dot >= 0 && TYPES[path.slice(dot + 1).toLowerCase()]) || 'application/octet-stream';
}

/** The Vite plugin: serves the fetched engine files in dev and preview, and copies them on build. */
export function shippedSpeech(folder = resolve(import.meta.dirname, '../../../.speech')): Plugin {
  const fetched = () => existsSync(join(folder, 'kokoro', 'model_quantized.onnx'));
  const warn = (what: string) =>
    console.warn(
      `[speech] No speak line engine at ${folder}, so ${what} keeps speak lines silent. Run \`pnpm speech:fetch\` first.`,
    );
  const serve = serveFrom(folder, {
    prefix: '/speech/',
    contentType: speechContentType,
    passOnMissing: true,
  });
  let outDir = 'dist';
  return {
    name: 'storystage-shipped-speech',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    configureServer(server) {
      if (!fetched()) warn('the dev server');
      server.middlewares.use(serve);
    },
    configurePreviewServer(server) {
      if (!fetched()) warn('the preview');
      server.middlewares.use(serve);
    },
    closeBundle() {
      if (process.env.TAURI_ENV_PLATFORM) return; // the apps bundle them (S8, WP15)
      if (!fetched()) return warn('this browser build');
      for (const dir of ['kokoro', 'ort'])
        cpSync(join(folder, dir), join(outDir, 'speech', dir), {
          recursive: true,
          filter: (src) => {
            const inside = src
              .slice(join(folder, dir).length)
              .replace(/\\/g, '/')
              .replace(/^\//, '');
            return inside === '' || isServed(inside);
          },
        });
      console.log(`[speech] Copied the speak line engine into ${join(outDir, 'speech')}.`);
    },
  };
}
