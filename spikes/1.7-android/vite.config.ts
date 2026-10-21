import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The page imports spike 1.2's characters and spike 1.5's Blockly editor; dedupe keeps one copy
// of each library even though those files live in other spike folders.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  resolve: { dedupe: ['@babylonjs/core', 'blockly', 'react', 'react-dom'] },
  build: { target: 'es2022', chunkSizeWarningLimit: 8000 },
});
