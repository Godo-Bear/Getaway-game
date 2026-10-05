// Check that every part of every story chapter loads and runs.
//
//   npm run check:chapters          (needs Playwright: npm i -D playwright)
//
// Starts the game's dev server, opens each part in a headless browser
// (?mode=chapterN&part=K), plays two seconds of it, and lists any part that
// failed to load or threw an error. Exits with code 1 if anything failed,
// so it can run before a release.

import { createRequire } from 'node:module';
import { createServer } from 'vite';
import { CHAPTER_LIST } from '../src/story/chapters.js';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('Playwright is needed for this check: npm i -D playwright (then: npx playwright install chromium)');
  process.exit(2);
}

const server = await createServer({ server: { port: 5199, strictPort: false }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
let errors = [];
page.on('pageerror', (e) => errors.push(e.message));
// Unlock every chapter, low graphics (fast)
await page.goto(base);
await page.evaluate(() => localStorage.setItem('getaway.save.v1', JSON.stringify({ settings: { graphics: 'low' }, progress: { chapterUnlocked: 99 } })));

const failed = [];
for (const ch of CHAPTER_LIST) {
  for (let part = 0; part < ch.parts.length; part++) {
    const name = `Chapter ${ch.number} part ${part + 1} (${ch.parts[part].title})`;
    errors = [];
    const t0 = Date.now();
    try {
      await page.goto(`${base}?nolock&mode=${ch.id}&part=${part}`);
      await page.waitForFunction(() => window.game?.sm?.current?.mode && document.getElementById('loader').hidden, null, { timeout: 120000 });
      const info = await page.evaluate(() => {
        const s = game.sm.current;
        s.inCard = false;
        document.getElementById('overlay').hidden = true;
        for (let i = 0; i < 120; i++) s.update(1 / 60); // (two seconds of play)
        return { state: game.sm.currentName, mode: s.mode.constructor.name, partIndex: s.mode.partIndex ?? null };
      });
      const ok = !errors.length && ['onFoot', 'driving'].includes(info.state);
      console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(56)} ${info.state}/${info.mode} ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      if (!ok) failed.push(`${name}: ${errors.join(' | ') || `ended up in ${info.state}`}`);
    } catch (e) {
      console.log(`FAIL ${name}: ${e.message.split('\n')[0]}`);
      failed.push(`${name}: ${e.message.split('\n')[0]}`);
    }
  }
}
await browser.close();
await server.close();
console.log(failed.length ? `\n${failed.length} part(s) failed:\n  ${failed.join('\n  ')}` : '\nEvery chapter part loads and runs.');
process.exit(failed.length ? 1 : 0);
