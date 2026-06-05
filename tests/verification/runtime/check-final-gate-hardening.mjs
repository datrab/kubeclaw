#!/usr/bin/env node
import { installQuietRuntimeConsole } from '../lib/verification-console.mjs';
const quietConsole = installQuietRuntimeConsole({ label: 'runtime/check-final-gate-hardening' });
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  parseArgs,
  resolveRoots,
  materializeRuntimeTree,
  importRuntimeModule,
} from '../lib/lifecycle-audit-lib.mjs';

const args = parseArgs();
const { sourceRoot, overlayRoot } = resolveRoots(args);
const { runtimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
const pipelineRunnerMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/runners/pipeline-runner-lock.ts');
const launchLibMod = await importRuntimeModule(sourceRoot, '/tests/verification/runtime/session-launch-lib.mjs');

const helperDir = fs.mkdtempSync(path.join(os.tmpdir(), 'final-gate-hardening-'));
const helperPath = path.join(helperDir, 'try-run-lock.mjs');
const runtimeModulePath = path.join(runtimeRoot, 'app', 'skills', 'pipeline', 'runners', 'pipeline-runner-lock.ts');

fs.writeFileSync(helperPath, `
import { pathToFileURL } from 'node:url';

const [, , runtimeModulePath, rawConfig] = process.argv;
const pipelineRunnerMod = await import(pathToFileURL(runtimeModulePath).href);
const config = JSON.parse(rawConfig);

try {
  const lock = pipelineRunnerMod.acquirePipelineRunLock(config, { module: '99' });
  pipelineRunnerMod.releasePipelineRunLock(lock);
  process.stdout.write(JSON.stringify({ ok: true, run_id: config._runId || config.run_id || null }) + '\\n');
} catch (error) {
  process.stderr.write(JSON.stringify({ ok: false, error: error?.message || String(error) }) + '\\n');
  process.exit(1);
}
`.trimStart());

const checks = [];

async function runCheck(name, fn) {
  try {
    const details = await fn();
    checks.push({ name, ok: true, ...(details || {}) });
  } catch (error) {
    checks.push({
      name,
      ok: false,
      error: error?.stack || error?.message || String(error),
    });
  }
}

await runCheck('same-project pipeline run concurrency is explicitly bounded to one active owner and rejects cross-process contention', async () => {
  assert.equal(pipelineRunnerMod.PIPELINE_RUN_CONCURRENCY_LIMIT, 1);

  const swarmDir = fs.mkdtempSync(path.join(os.tmpdir(), 'final-gate-lock-'));
  const lockConfig = {
    project: 'verification-demo',
    repo_root: '/tmp/verification-demo',
    _runId: 'run-main',
    paths: { swarm_dir: swarmDir },
  };
  const lockPath = path.join(swarmDir, 'logs', 'pipeline', 'active-run.lock.json');

  const lock = pipelineRunnerMod.acquirePipelineRunLock(lockConfig, { module: '01' });
  try {
    const persisted = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    assert.equal(persisted.run_id, 'run-main');
    assert.equal(persisted.module, '01');
    assert.equal(persisted.pid, process.pid);

    assert.throws(
      () => pipelineRunnerMod.releasePipelineRunLock({ path: lockPath, token: 'wrong-owner-token', config: lockConfig }),
      /token mismatch/,
    );
    assert.equal(fs.existsSync(lockPath), true);

    const blocked = spawnSync(process.execPath, [helperPath, runtimeModulePath, JSON.stringify({
      ...lockConfig,
      _runId: 'run-child-blocked',
    })], {
      encoding: 'utf8',
    });

    assert.equal(blocked.status, 1);
    assert.match(`${blocked.stderr}${blocked.stdout}`, /already active/);

    return {
      concurrencyLimit: pipelineRunnerMod.PIPELINE_RUN_CONCURRENCY_LIMIT,
      blockedAttempt: {
        status: blocked.status,
        stderr: blocked.stderr.trim(),
      },
    };
  } finally {
    pipelineRunnerMod.releasePipelineRunLock(lock);
  }
});

await runCheck('pipeline run lock releases cleanly for the rightful owner and allows a later process to acquire the lock', async () => {
  const swarmDir = fs.mkdtempSync(path.join(os.tmpdir(), 'final-gate-release-'));
  const lockConfig = {
    project: 'verification-demo',
    repo_root: '/tmp/verification-demo',
    _runId: 'run-main-release',
    paths: { swarm_dir: swarmDir },
  };
  const lockPath = path.join(swarmDir, 'logs', 'pipeline', 'active-run.lock.json');
  const lock = pipelineRunnerMod.acquirePipelineRunLock(lockConfig, { module: '02' });

  pipelineRunnerMod.releasePipelineRunLock(lock);
  assert.equal(fs.existsSync(lockPath), false);

  const retry = spawnSync(process.execPath, [helperPath, runtimeModulePath, JSON.stringify({
    ...lockConfig,
    _runId: 'run-child-after-release',
  })], {
    encoding: 'utf8',
  });

  assert.equal(retry.status, 0);
  const payload = JSON.parse(retry.stdout.trim().split('\n').filter(Boolean).at(-1));
  assert.equal(payload.ok, true);
  assert.equal(payload.run_id, 'run-child-after-release');

  return {
    retry: {
      status: retry.status,
      stdout: retry.stdout.trim().split('\n').filter(Boolean).at(-1),
    },
  };
});

await runCheck('launch verifier CLI rejects malformed numeric inputs instead of silently weakening final-gate checks', async () => {
  assert.throws(
    () => launchLibMod.parseLaunchArgs(['--timeout-seconds', '0'], { runtime: 'acp' }),
    /--timeout-seconds must be an integer >= 1/,
  );
  assert.throws(
    () => launchLibMod.parseLaunchArgs(['--poll-attempts', 'nope'], { runtime: 'acp' }),
    /--poll-attempts must be an integer >= 1/,
  );
  assert.throws(
    () => launchLibMod.parseLaunchArgs(['--poll-ms', '-1'], { runtime: 'acp' }),
    /--poll-ms must be an integer >= 0/,
  );

  return {
    rejectedArgs: ['--timeout-seconds 0', '--poll-attempts nope', '--poll-ms -1'],
  };
});

await runCheck('launch verifier fails closed when contract abuse produces internally contradictory observation payloads', async () => {
  const inconsistentCases = [
    {
      observed: {
        visible: true,
        active: false,
        state: 'status_error',
        degradedVisibility: false,
      },
      expectedIssue: 'status_error_marked_visible',
    },
    {
      observed: {
        visible: false,
        active: true,
        state: 'running',
        degradedVisibility: false,
      },
      expectedIssue: 'active_without_visibility',
    },
  ];

  const results = inconsistentCases.map(({ observed, expectedIssue }) => {
    const result = launchLibMod.assessLaunchVerification({
      observed,
      streamLogExists: true,
      cleanup: { confirmed: true },
      allowTerminalAfterLaunch: true,
      keepSession: false,
    });

    assert.equal(result.ok, false);
    assert.equal(result.launchConfirmed, false);
    assert.equal(result.launchEvidence, 'invalid_observation');
    assert.equal(result.degradedVisibility, true);
    assert.equal(result.cleanupConfirmed, true);
    assert.equal(result.observationIssue, expectedIssue);
    assert.deepEqual(result.nonPassReasons, ['launch_observation_invalid', 'launch_unconfirmed']);

    return {
      expectedIssue,
      launchEvidence: result.launchEvidence,
      nonPassReasons: result.nonPassReasons,
    };
  });

  return { inconsistentCases: results };
});

const failed = checks.filter((check) => !check.ok);
const result = {
  sourceRoot,
  overlayRoot,
  ok: failed.length === 0,
  checkCount: checks.length,
  failedCheckCount: failed.length,
  checks,
};

quietConsole.restore();
console.log(JSON.stringify(result, null, 2));
process.exit(failed.length === 0 ? 0 : 1);
