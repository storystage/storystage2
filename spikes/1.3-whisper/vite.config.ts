import { defineConfig } from 'vite';

// whisper.cpp uses threads (SharedArrayBuffer), which need cross-origin isolation.
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  server: { port: 5173, headers: isolation },
  preview: { port: 4173, strictPort: true, headers: isolation },
  build: { target: 'es2022' },
});
