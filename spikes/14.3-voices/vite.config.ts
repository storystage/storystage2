import { defineConfig } from 'vite';

// ONNX Runtime and whisper.cpp use threads (SharedArrayBuffer), which need cross-origin isolation.
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  server: { port: 5233, strictPort: true, headers: isolation },
  preview: { port: 4233, strictPort: true, headers: isolation },
  build: { target: 'es2022', chunkSizeWarningLimit: 8000 },
  optimizeDeps: { exclude: ['onnxruntime-web'] },
});
