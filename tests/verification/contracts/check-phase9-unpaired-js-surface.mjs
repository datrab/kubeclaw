import { installQuietRuntimeConsole } from '../lib/verification-console.mjs';
const quietConsole = installQuietRuntimeConsole({ label: 'contracts/check-phase9-unpaired-js-surface' });
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

assert.deepEqual(jsFiles, [], 'zero-JS migration policy forbids retained .js files under skills/*');

for (const retained of [
  'skills/nova/pipeline.ts',
  'skills/buster/buster-pipeline.ts',
  'skills/common/discord-purge.ts',
]) {
  assert.equal(fs.existsSync(path.join(sourceRoot, retained)), true, `${retained} must exist as TypeScript`);
}

const novaEntrypoint = fs.readFileSync(path.join(sourceRoot, 'skills/nova/pipeline.ts'), 'utf8');
assert.equal(novaEntrypoint.includes("export * from './pipeline/index.ts';"), true, 'Nova root entrypoint must delegate public exports to the typed index');
assert.equal(novaEntrypoint.includes("import('./pipeline/cli.ts')"), true, 'Nova root entrypoint must delegate direct CLI execution to the typed CLI');

quietConsole.restore();
console.log(JSON.stringify({ ok: true, checked: 'zero-js-skills-surface' }));
