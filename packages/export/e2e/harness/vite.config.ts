import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// The export harness for the end-to-end test; not shipped.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  preview: { port: 4180, strictPort: true },
  build: {
    target: 'es2022',
    outDir: fileURLToPath(new URL('../../dist-harness', import.meta.url)),
    emptyOutDir: true,
  },
});
