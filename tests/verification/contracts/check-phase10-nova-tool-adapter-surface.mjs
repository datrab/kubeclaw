import { installQuietRuntimeConsole } from '../lib/verification-console.mjs';
const quietConsole = installQuietRuntimeConsole({ label: 'contracts/check-phase10-nova-tool-adapter-surface' });
import assert from 'assert';
import path from 'path';
import fs from 'fs';

function parseArgs(argv = process.argv.slice(2)) {
  const args = { sourceRoot: process.cwd() };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--source-root') args.sourceRoot = path.resolve(argv[i + 1]);
  }
  return args;
}

const { sourceRoot } = parseArgs();

for (const relativePath of [
  'skills/nova/pipeline/tools/lint-report.ts',
  'skills/nova/pipeline/tools/project-summary.ts',
  'skills/nova/pipeline/tools/redis.ts',
]) {
  assert.equal(fs.existsSync(path.join(sourceRoot, relativePath)), true, `${relativePath} must exist as TypeScript`);
}

const toolDir = path.join(sourceRoot, 'skills/nova/pipeline/tools');
const jsToolFiles = fs.readdirSync(toolDir, { recursive: true })
  .filter((entry) => String(entry).endsWith('.js'))
  .sort();
assert.deepEqual(jsToolFiles, [], 'Nova tools must not retain JavaScript adapter files');

quietConsole.restore();
console.log(JSON.stringify({ ok: true, checked: 'zero-nova-tool-js-adapters' }));
