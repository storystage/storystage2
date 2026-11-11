import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { shippedBackstage } from './build/backstage.ts';
import { shippedSpeech } from './build/speech.ts';

// Tauri expects a fixed port and no clearing of its console output.
// The shipped Backstage is served at backstage/ for the browser version (build/backstage.ts),
// and speak line's engine at speech/ (build/speech.ts).
export default defineConfig({
  plugins: [react(), shippedBackstage(), shippedSpeech()],
  clearScreen: false,
  server: { port: 5173, strictPort: true },
  build: { target: 'es2022' },
});
