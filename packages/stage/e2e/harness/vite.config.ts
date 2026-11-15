import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// The stage harness for the end-to-end test; not shipped.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  preview: { port: 4181, strictPort: true },
  build: {
    target: 'es2022',
    outDir: fileURLToPath(new URL('../../dist/harness', import.meta.url)),
    emptyOutDir: true,
    // The test's page, and the page for the reference devices (#6).
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL('./index.html', import.meta.url)),
        device: fileURLToPath(new URL('./device.html', import.meta.url)),
      },
    },
  },
});
