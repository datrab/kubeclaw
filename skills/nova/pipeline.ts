#!/usr/bin/env node
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Canonical Nova pipeline entrypoint. Core starts empty and discovers every
// configured extension through the v2 platform contract.
export * from './core/src/index.ts';

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  await import('./core/cli.ts');
}
