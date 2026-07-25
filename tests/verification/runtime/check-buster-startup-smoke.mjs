import { installQuietRuntimeConsole } from '../lib/verification-console.mjs';
const quietConsole = installQuietRuntimeConsole({ label: 'runtime/check-buster-startup-smoke' });
import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';
import { parseSourceRootArgs, runNode } from '../lib/contract-check-helpers.mjs';
import {
  importRuntimeModule,
  materializeRuntimeTree,
} from '../lib/lifecycle-audit-lib.mjs';

const { sourceRoot } = parseSourceRootArgs();
const busterShim = path.join(sourceRoot, 'skills/buster/buster-pipeline.ts');
const busterEntrypoint = path.join(sourceRoot, 'skills/buster/buster-pipeline.ts');
const source = fs.readFileSync(busterEntrypoint, 'utf8');
const shimSource = fs.readFileSync(busterShim, 'utf8');

assert.match(
  source,
  /import\s*{[^}]*doResourceCleanup[^}]*}\s*from\s*['"]\.\/pipeline\/services\/pipeline-helpers\.ts['"]/s,
  'typed buster entrypoint must import doResourceCleanup as a local ESM binding before startup/shutdown uses it',
);
assert.equal(
  source.includes('redis?.disconnect()'),
  false,
  'typed buster entrypoint shutdown must not reference an undefined redis binding',
);
assert.equal(
  source.includes('await disconnectRedisClient();'),
  true,
  'buster-pipeline shutdown should use the task-queue Redis disconnect helper',
);

assert.equal(shimSource.includes('await handleBusterEntrypoint();'), true, 'buster-pipeline.ts should run the typed entrypoint on direct execution');
assert.equal(shimSource.includes('export * from'), false, 'buster-pipeline.ts should not expose a helper barrel');

const syntax = runNode(['--check', busterEntrypoint], { cwd: sourceRoot });
assert.equal(
  syntax.status,
  0,
  `buster entrypoint should parse cleanly\nstdout:\n${syntax.stdout}\nstderr:\n${syntax.stderr}`,
);

const module = await import(pathToFileURL(busterEntrypoint).href);
for (const name of [
  'main',
  'shutdown',
  'getBusterStatus',
  'handleBusterEntrypoint',
]) {
  assert.equal(typeof module[name], 'function', `buster entrypoint should export ${name}`);
}

const status = runNode([busterShim, '--status'], { cwd: sourceRoot });
assert.equal(
  status.status,
  0,
  `buster --status should exit 0\nstdout:\n${status.stdout}\nstderr:\n${status.stderr}`,
);
let parsedStatus;
assert.doesNotThrow(() => {
  parsedStatus = JSON.parse(status.stdout);
}, `buster --status should print JSON, got: ${status.stdout}`);
assert.equal(
  Object.prototype.hasOwnProperty.call(parsedStatus, 'lastRunLogDir'),
  true,
  'buster --status JSON should include lastRunLogDir',
);

const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'buster-runtime-smoke-'));
try {
  materializeRuntimeTree(sourceRoot, null, 'busterPipeline', runtimeRoot);
  const runtimeGitPrimitives = path.join(runtimeRoot, 'app', 'skills', 'pipeline', 'git-primitives.ts');
  const runtimeGitPrimitivesSource = fs.readFileSync(runtimeGitPrimitives, 'utf8');
  assert.equal(
    runtimeGitPrimitivesSource.includes('/app/nova/'),
    false,
    'packaged Buster git-primitives must not import Nova runtime paths',
  );
  assert.equal(
    runtimeGitPrimitivesSource.includes("from './platform-config.ts'"),
    true,
    'packaged Buster git-primitives must import adjacent shared platform-config',
  );
  await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/git-primitives.ts');
  await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/scheduler.ts');
} finally {
  fs.rmSync(runtimeRoot, { recursive: true, force: true });
}

quietConsole.restore();
console.log('Buster startup smoke passed');
