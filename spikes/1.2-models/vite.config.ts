import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5172, strictPort: true },
  preview: { port: 4172, strictPort: true },
  build: { target: 'es2022', chunkSizeWarningLimit: 8000 },
});
