#!/bin/sh
set -eu
cd "$(dirname "$0")"
npm ci --ignore-scripts --no-audit --no-fund
# npm ships bundled dependencies, which npm overrides do not replace.
# Replace only this owned CLI's undici with the integrity-locked patch release.
node --input-type=module - <<'JS'
import fs from 'node:fs';
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const patch = read('node_modules/undici/package.json');
const bundled = read('node_modules/npm/node_modules/undici/package.json');
if (patch.version !== '6.29.1' || bundled.version !== '6.29.0' || Object.keys(patch.dependencies ?? {}).length) {
  throw new Error('npm undici patch assumptions changed; review the locked replacement');
}
fs.rmSync('node_modules/npm/node_modules/undici', { recursive: true });
fs.cpSync('node_modules/undici', 'node_modules/npm/node_modules/undici', { recursive: true });
JS
node node_modules/npm/bin/npm-cli.js --version
