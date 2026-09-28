import { defineConfig } from 'vite';

// Vite config. Three.js is big, so we raise the size warning limit
// (it's one library, not a problem to fix).
export default defineConfig({
  server: { port: 5173, host: true },
  build: { chunkSizeWarningLimit: 1200 },
});
