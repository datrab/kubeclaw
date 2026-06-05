#!/usr/bin/env node
// Root Nova entrypoint. Runtime implementation lives under pipeline/.
export * from './pipeline/index.ts';
export { default } from './pipeline/index.ts';

// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import fs from 'fs';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import { fileURLToPath } from 'url';

declare const process: {
  argv: string[];
};

const currentPath = fs.realpathSync(fileURLToPath(import.meta.url));
const entryPath = process.argv[1] && fs.existsSync(process.argv[1])
  ? fs.realpathSync(process.argv[1])
  : process.argv[1];

if (currentPath === entryPath) {
  const { main } = await import('./pipeline/cli.ts');
  await main();
}
