import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  clearScreen: false,
  // `harness:production` builds here and serves it, for the timing tests (spec 14, 3h): they
  // measure what learners get, not React's development build, which is several times slower.
  // Not minified, so a profile of it names the functions.
  build: {
    outDir: fileURLToPath(new URL('../dist/harness', import.meta.url)),
    emptyOutDir: true,
    minify: false,
  },
});
