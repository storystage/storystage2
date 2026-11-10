import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { shippedBackstage } from './build/backstage.ts';

// Tauri expects a fixed port and no clearing of its console output.
// The shipped Backstage is served at backstage/ for the browser version (build/backstage.ts).
export default defineConfig({
  plugins: [react(), shippedBackstage()],
  clearScreen: false,
  server: { port: 5173, strictPort: true },
  build: { target: 'es2022' },
});
