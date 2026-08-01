#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const pluginRoot = path.resolve(import.meta.dirname, '..');
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-observer-build-'));
const output = path.join(temporaryRoot, 'dist');
const tscIndex = process.argv.indexOf('--tsc');
const tsc = tscIndex >= 0 ? process.argv[tscIndex + 1] : 'tsc';
let compilerExitCode = 0;

try {
  const command = tsc.endsWith('.js') ? process.execPath : tsc;
  const args = tsc.endsWith('.js')
    ? [tsc, '-p', path.join(pluginRoot, 'tsconfig.build.json'), '--outDir', output]
    : ['-p', path.join(pluginRoot, 'tsconfig.build.json'), '--outDir', output];
  const result = spawnSync(command, args, { cwd: pluginRoot, stdio: 'inherit' });
  if (result.error) throw result.error;
  compilerExitCode = result.status ?? 1;

  if (compilerExitCode === 0) {
    fs.rmSync(path.join(pluginRoot, 'dist'), { recursive: true, force: true });
    fs.cpSync(output, path.join(pluginRoot, 'dist'), { recursive: true });
  }
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}

if (compilerExitCode !== 0) process.exit(compilerExitCode);
