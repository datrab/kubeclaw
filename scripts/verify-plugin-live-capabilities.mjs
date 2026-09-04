#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const pluginRoots = ['common', 'nova', 'buster']
  .map((role) => path.join(root, 'skills', role, 'plugins'));

function hasLiveRegistration(packageRoot) {
  const manifestPath = ['plugin.json', 'openclaw.plugin.json']
    .map((name) => path.join(packageRoot, name))
    .find((candidate) => fs.existsSync(candidate));
  if (!manifestPath) return false;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  return ['stages', 'observers', 'adapters', 'testProviders']
    .some((key) => Array.isArray(manifest[key]) && manifest[key].length > 0);
}

const packages = pluginRoots.flatMap((pluginRoot) => fs.readdirSync(pluginRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join(pluginRoot, entry.name)))
  .filter((packageRoot) => fs.existsSync(path.join(packageRoot, 'package.json'))
    && (
      fs.existsSync(path.join(packageRoot, 'plugin.json'))
      || fs.existsSync(path.join(packageRoot, 'openclaw.plugin.json'))
    ) && hasLiveRegistration(packageRoot))
  .sort();

for (const packageRoot of packages) {
  const test = path.join(packageRoot, 'tests', 'live-function.test.ts');
  const legacyJavaScriptTest = path.join(packageRoot, 'tests', 'live-function.test.mjs');
  assert.ok(
    fs.existsSync(test),
    `Plugin package is missing its TypeScript package-local live capability test: ${path.relative(root, packageRoot)}`,
  );
  assert.ok(
    !fs.existsSync(legacyJavaScriptTest),
    `Plugin package retains a JavaScript live capability test instead of TypeScript: ${path.relative(root, packageRoot)}`,
  );
  const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
  assert.match(
    manifest.scripts?.test ?? '',
    /node tests\/live-function\.test\.ts/,
    `Plugin package test script does not execute its live capability test: ${path.relative(root, packageRoot)}`,
  );
}

const packageResult = spawnSync('node', ['scripts/verify-plugin-packages.mjs'], {
  cwd: root,
  env: process.env,
  stdio: 'inherit',
});
if (packageResult.status !== 0) process.exit(packageResult.status ?? 1);

for (const packageRoot of packages) {
  const liveResult = spawnSync(
    'node',
    ['tests/live-function.test.ts'],
    {
      cwd: packageRoot,
      env: process.env,
      stdio: 'inherit',
    },
  );
  if (liveResult.status !== 0) process.exit(liveResult.status ?? 1);
}

const crashResult = spawnSync(
  'node',
  ['tests/verification/contracts/check-plugin-system-v2-live-crashes.mts'],
  { cwd: root, env: process.env, stdio: 'inherit' },
);
if (crashResult.status !== 0) process.exit(crashResult.status ?? 1);

console.log(JSON.stringify({
  ok: true,
  gate: 'plugin-live-capabilities',
  packages: packages.map((entry) => path.relative(root, entry)),
  count: packages.length,
}));
