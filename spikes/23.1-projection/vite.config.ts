import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5231, strictPort: true },
  preview: { port: 4231, strictPort: true },
  build: { target: 'es2022', chunkSizeWarningLimit: 8000 },
});
