#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const pluginRoot = path.resolve(import.meta.dirname, '..');
const repositoryRoot = path.resolve(pluginRoot, '../..');
const contractSource = path.resolve(pluginRoot, '../../contracts/agent-observability/v1/src');
const temporaryRoot = fs.mkdtempSync(path.join(repositoryRoot, '.observer-build-'));
const stagedPlugin = path.join(temporaryRoot, 'plugin');
const tscIndex = process.argv.indexOf('--tsc');
const tsc = tscIndex >= 0 ? process.argv[tscIndex + 1] : 'tsc';

try {
  fs.cpSync(pluginRoot, stagedPlugin, {
    recursive: true,
    filter: (source) => !['dist', 'node_modules'].includes(path.basename(source)),
  });
  const stagedContract = path.join(stagedPlugin, 'src/agent-observability');
  fs.rmSync(stagedContract, { recursive: true, force: true });
  fs.cpSync(contractSource, stagedContract, { recursive: true });

  const command = tsc.endsWith('.js') ? process.execPath : tsc;
  const args = tsc.endsWith('.js')
    ? [tsc, '-p', path.join(stagedPlugin, 'tsconfig.build.json')]
    : ['-p', path.join(stagedPlugin, 'tsconfig.build.json')];
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);

  fs.rmSync(path.join(pluginRoot, 'dist'), { recursive: true, force: true });
  fs.cpSync(path.join(stagedPlugin, 'dist'), path.join(pluginRoot, 'dist'), { recursive: true });
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
