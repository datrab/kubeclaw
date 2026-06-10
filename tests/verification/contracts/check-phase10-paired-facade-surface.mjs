import { installQuietRuntimeConsole } from '../lib/verification-console.mjs';
const quietConsole = installQuietRuntimeConsole({ label: 'contracts/check-phase10-paired-facade-surface' });
import assert from 'assert';
import fs from 'fs';
import path from 'path';

function parseArgs(argv = process.argv.slice(2)) {
  const args = { sourceRoot: process.cwd() };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--source-root') args.sourceRoot = path.resolve(argv[i + 1]);
  }
  return args;
}

function walkFiles(dir, predicate, output = []) {
  if (!fs.existsSync(dir)) return output;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      walkFiles(absPath, predicate, output);
    }
    else if (entry.isFile() && predicate(absPath)) output.push(absPath);
  }
  return output;
}

function toRepoPath(sourceRoot, absPath) {
  return path.relative(sourceRoot, absPath).split(path.sep).join('/');
}

const { sourceRoot } = parseArgs();
const jsFiles = walkFiles(path.join(sourceRoot, 'skills'), (absPath) => absPath.endsWith('.js'))
  .map((absPath) => toRepoPath(sourceRoot, absPath))
  .sort();

assert.deepEqual(jsFiles, [], 'Phase 10 must close with zero paired or retained .js files under skills/*');

quietConsole.restore();
console.log(JSON.stringify({ ok: true, checked: 'zero-paired-js-facades' }));
