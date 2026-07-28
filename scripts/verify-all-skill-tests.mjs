#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const testsRoot = path.join(root, 'tests/skills');

function collectTests(directory, output = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) collectTests(absolutePath, output);
    else if (entry.isFile() && entry.name.endsWith('.test.mjs')) {
      output.push(path.relative(root, absolutePath));
    }
  }
  return output;
}

const tests = collectTests(testsRoot).sort();
if (tests.length === 0) throw new Error('No skill tests found');
const result = spawnSync(process.execPath, ['--test', ...tests], {
  cwd: root,
  env: process.env,
  stdio: 'inherit',
});
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(JSON.stringify({ ok: true, gate: 'all-skill-tests', files: tests.length }));
