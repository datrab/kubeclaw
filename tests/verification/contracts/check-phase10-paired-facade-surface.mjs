import { parseSourceRootArgs, toRepoPath, walkFiles } from '../lib/contract-check-helpers.mjs';
import { installQuietRuntimeConsole } from '../lib/verification-console.mjs';
const quietConsole = installQuietRuntimeConsole({ label: 'contracts/check-phase10-paired-facade-surface' });
import assert from 'assert';
import path from 'path';

const { sourceRoot } = parseSourceRootArgs();
const jsFiles = walkFiles(path.join(sourceRoot, 'skills'), (absPath) => absPath.endsWith('.js'), [], { skipDirectories: ['node_modules'] })
  .map((absPath) => toRepoPath(sourceRoot, absPath))
  .sort();

assert.deepEqual(jsFiles, [], 'Phase 10 must close with zero paired or retained .js files under skills/*');

quietConsole.restore();
console.log(JSON.stringify({ ok: true, checked: 'zero-paired-js-facades' }));
