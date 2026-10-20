import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5174, strictPort: true },
  preview: { port: 4174, strictPort: true },
  worker: { format: 'es' },
  build: { target: 'es2022', chunkSizeWarningLimit: 8000 },
});
