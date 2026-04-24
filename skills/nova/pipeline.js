#!/usr/bin/env node
// Thin compatibility shim — preserves `node /app/skills/pipeline.js`
// while delegating exports to `pipeline/index.js` and CLI execution to
// `pipeline/cli.js`.
export * from './pipeline/index.js';
export { default } from './pipeline/index.js';

// CLI
import { fileURLToPath } from 'url';
import fs from 'fs';
const __currentPath = fs.realpathSync(fileURLToPath(import.meta.url));
const __entryPath = (process.argv[1] && fs.existsSync(process.argv[1]))
  ? fs.realpathSync(process.argv[1]) : process.argv[1];
if (__currentPath === __entryPath) {
  const { main } = await import('./pipeline/cli.js');
  await main();
}
