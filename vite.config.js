import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';

// A short version label for the title screen (the commit it was built from),
// so you can tell whether a phone is showing an old saved copy.
let version = new Date().toISOString().slice(0, 10);
try { version = execSync('git log -1 --format=%cd-%h --date=format:%Y.%m.%d', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { /* not a git checkout */ }

// Vite config. Three.js is big, so we raise the size warning limit
// (it's one library, not a problem to fix).
export default defineConfig({
  // Relative paths, so the built game works from any folder or sub-URL.
  base: './',
  define: { __VERSION__: JSON.stringify(version) },
  server: { port: 5173, host: true },
  build: { chunkSizeWarningLimit: 1200 },
});
