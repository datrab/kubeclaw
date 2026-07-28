#!/usr/bin/env node
// Root Nova entrypoint. Runtime implementation lives under pipeline/.
export * from './pipeline/index.ts';
export { default } from './pipeline/index.ts';
import fs from 'fs';
import { fileURLToPath } from 'url';

declare const process: {
  argv: string[];
  exit(code?: number): never;
};

function requiredProcessExitCode(value: unknown): number {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  throw new Error('pipeline cli returned missing exit code');
}

const currentPath = fs.realpathSync(fileURLToPath(import.meta.url));
const entryPath = process.argv[1] && fs.existsSync(process.argv[1])
  ? fs.realpathSync(process.argv[1])
  : process.argv[1];

if (currentPath === entryPath) {
  const { main } = await import('./pipeline/cli.ts');
  const exitCode = await main();
  process.exit(requiredProcessExitCode(exitCode));
}
