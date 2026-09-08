import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { safeExec, requireToolExecution } from '../../../skills/nova/plugins/lint/src/engine/execution.ts';
import { listConfiguredTargetFiles, configuredTargetFilesForScope } from '../../../skills/nova/plugins/lint/src/engine/discovery.ts';
import { validatePolicyTargetPaths } from '../../../skills/nova/plugins/lint/src/engine/policy.ts';

// Original functions, real OS process and filesystem; no substituted providers.
const timed = safeExec('/bin/sleep', ['0.15'], { timeout: 20 });
let code;
try { requireToolExecution(timed, 'probe'); } catch (error) { code = error.code; }
assert.equal(timed.timedOut, false);
assert.equal(code, 'probe-execution-failed');
assert.match(timed.error, /ETIMEDOUT/);
console.log(JSON.stringify({ probe: 'timeout-classification', ...timed, code }));
let timerRan = false;
const timer = setTimeout(() => { timerRan = true; }, 5);
const started = performance.now();
safeExec('/bin/sleep', ['0.12'], { timeout: 1000 });
assert.equal(timerRan, false);
clearTimeout(timer);
console.log(JSON.stringify({ probe: 'event-loop-blocking', elapsedMs: Math.round(performance.now() - started), timerRan }));

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'review-lint-boundary-'));
try {
  const repoRoot = path.join(temporary, 'repo');
  const outside = path.join(temporary, 'outside');
  fs.mkdirSync(repoRoot); fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, 'external.sh'), '#!/bin/sh\necho external\n');
  fs.symlinkSync(outside, path.join(repoRoot, 'src'));
  const ctx = { repoRoot, policyProject: { root: '.', go: { modules: [] }, terraform: { roots: [] }, kubernetes: { raw_manifests: [], helm_charts: [], limits: { max_files: 256 }, schema_location: null } },
    policy: { global_exclusions: [], tools: [{ id: 'shellcheck', targets: ['src'] }], architecture: { layers: [] } },
    tool: { targets: ['src'], include: ['**/*.sh'], exclude: [] } };
  validatePolicyTargetPaths(repoRoot, ctx.policy, ctx.policyProject);
  const all = listConfiguredTargetFiles(ctx);
  const changed = configuredTargetFilesForScope({ ...ctx, changedFilesRequested: true, changedFiles: ['src/external.sh'] });
  assert.equal(all.length, 1); assert.deepEqual(changed, all);
  assert.equal(fs.realpathSync(all[0]), path.join(outside, 'external.sh'));
  console.log(JSON.stringify({ probe: 'symlink-target-escape', policyTargetValidation: 'accepted', all, changed, resolved: fs.realpathSync(all[0]) }));
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
