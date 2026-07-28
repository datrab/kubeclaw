#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const pluginRoots = [
  path.join(root, 'skills/common/plugins'),
  path.join(root, 'skills/nova/plugins'),
  path.join(root, 'skills/buster/plugins'),
];

function isPluginPackage(directory) {
  return fs.existsSync(path.join(directory, 'package.json'))
    && (
      fs.existsSync(path.join(directory, 'plugin.json'))
      || fs.existsSync(path.join(directory, 'openclaw.plugin.json'))
    );
}

const packages = pluginRoots
  .flatMap((pluginRoot) => fs.readdirSync(pluginRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(pluginRoot, entry.name)))
  .filter(isPluginPackage)
  .sort((left, right) => left.localeCompare(right));

if (packages.length === 0) throw new Error('No plugin packages found');

for (const packageRoot of packages) {
  const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
  if (!manifest.scripts?.test) {
    throw new Error(`Plugin package is missing a test script: ${path.relative(root, packageRoot)}`);
  }
  const result = spawnSync('npm', ['test', '--prefix', path.relative(root, packageRoot)], {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log(JSON.stringify({
  ok: true,
  gate: 'plugin-packages',
  packages: packages.map((packageRoot) => path.relative(root, packageRoot)),
  count: packages.length,
}));
