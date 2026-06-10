import { installQuietRuntimeConsole } from '../lib/verification-console.mjs';
const quietConsole = installQuietRuntimeConsole({ label: 'contracts/check-runner-facade-surface' });
import fs from 'fs';
import path from 'path';
import assert from 'assert';

function parseArgs(argv = process.argv.slice(2)) {
  const args = { sourceRoot: process.cwd() };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--source-root') args.sourceRoot = path.resolve(argv[i + 1]);
  }
  return args;
}

function walk(dir, output = []) {
  if (!fs.existsSync(dir)) return output;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absPath = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(absPath, output);
    else if (entry.isFile()) output.push(absPath);
  }
  return output;
}

const { sourceRoot } = parseArgs();
const runnerJsFiles = walk(path.join(sourceRoot, 'skills/nova/pipeline/runners'))
  .filter((absPath) => absPath.endsWith('.js'))
  .map((absPath) => path.relative(sourceRoot, absPath).split(path.sep).join('/'))
  .sort();

assert.deepEqual(runnerJsFiles, [], 'Nova runners must not retain JavaScript facade files');

quietConsole.restore();
console.log(JSON.stringify({ ok: true, checked: 'zero-runner-js-facades' }));
