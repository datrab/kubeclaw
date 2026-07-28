import { parseSourceRootArgs, toRepoPath, walkFiles } from '../lib/contract-check-helpers.mjs';
import { installQuietRuntimeConsole } from '../lib/verification-console.mjs';
const quietConsole = installQuietRuntimeConsole({ label: 'contracts/check-phase9-unpaired-js-surface' });
import assert from 'assert';
import fs from 'fs';
import path from 'path';


const { sourceRoot } = parseSourceRootArgs();
const jsFiles = walkFiles(path.join(sourceRoot, 'skills'), (absPath) => absPath.endsWith('.js'), [], { skipDirectories: ['node_modules'] })
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
assert.equal(novaEntrypoint.includes("import('./skills/common/plugin-runtime/cli.ts')"), true, 'Nova root entrypoint must delegate direct CLI execution to the typed CLI');

quietConsole.restore();
console.log(JSON.stringify({ ok: true, checked: 'zero-js-skills-surface' }));
