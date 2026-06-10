import { installQuietRuntimeConsole } from '../lib/verification-console.mjs';
const quietConsole = installQuietRuntimeConsole({ label: 'contracts/check-phase10-nova-service-facades' });
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
    if (entry.isDirectory()) walkFiles(absPath, predicate, output);
    else if (entry.isFile() && predicate(absPath)) output.push(absPath);
  }
  return output;
}

const { sourceRoot } = parseArgs();
const jsFacades = walkFiles(path.join(sourceRoot, 'skills/nova/pipeline/services'), (absPath) => absPath.endsWith('.js'));
assert.deepEqual(jsFacades, [], 'Nova service compatibility facades must be deleted; import TypeScript owners directly');

quietConsole.restore();
console.log(JSON.stringify({ ok: true, checked: 'zero-nova-service-js-facades' }));
