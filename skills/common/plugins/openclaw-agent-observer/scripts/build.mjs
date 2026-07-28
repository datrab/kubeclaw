#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const pluginRoot = path.resolve(import.meta.dirname, '..');
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-observer-build-'));
const stagedPlugin = path.join(temporaryRoot, 'plugin');
const tscIndex = process.argv.indexOf('--tsc');
const tsc = tscIndex >= 0 ? process.argv[tscIndex + 1] : 'tsc';
let compilerExitCode = 0;

try {
  fs.cpSync(pluginRoot, stagedPlugin, {
    recursive: true,
    filter: (source) => !['dist', 'node_modules'].includes(path.basename(source)),
  });
  const dependencyRoot = path.join(pluginRoot, 'node_modules');
  if (!fs.existsSync(dependencyRoot)) {
    throw new Error('Observer build dependencies are not installed; run npm ci first');
  }
  fs.symlinkSync(dependencyRoot, path.join(stagedPlugin, 'node_modules'), 'junction');
  const command = tsc.endsWith('.js') ? process.execPath : tsc;
  const args = tsc.endsWith('.js')
    ? [tsc, '-p', path.join(stagedPlugin, 'tsconfig.build.json')]
    : ['-p', path.join(stagedPlugin, 'tsconfig.build.json')];
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  compilerExitCode = result.status ?? 1;

  if (compilerExitCode === 0) {
    fs.rmSync(path.join(pluginRoot, 'dist'), { recursive: true, force: true });
    fs.cpSync(path.join(stagedPlugin, 'dist'), path.join(pluginRoot, 'dist'), { recursive: true });
  }
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}

if (compilerExitCode !== 0) process.exit(compilerExitCode);
