import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// The dictation harness for the browser test; not shipped. whisper's threads need cross-origin
// isolation, as the Tauri apps give it (spec 06 section 1.1).
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  // whisper.js, the model and the clip, put here by the CI scripts (scripts/*.sh).
  publicDir: fileURLToPath(new URL('./public', import.meta.url)),
  preview: { port: 4190, strictPort: true, headers: isolation },
  build: {
    target: 'es2022',
    // Readable stacks when the browser test fails.
    minify: false,
    sourcemap: true,
    outDir: fileURLToPath(new URL('../../dist-harness', import.meta.url)),
    emptyOutDir: true,
  },
});
