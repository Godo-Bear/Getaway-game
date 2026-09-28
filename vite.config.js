import { defineConfig } from 'vite';

// Vite config. Three.js is big, so we raise the size warning limit
// (it's one library, not a problem to fix).
export default defineConfig({
  // Relative paths, so the built game works from any folder or sub-URL.
  base: './',
  server: { port: 5173, host: true },
  build: { chunkSizeWarningLimit: 1200 },
});
