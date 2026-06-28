import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  artifactPathsForWorkspace,
  createResultRecord,
  diagnoseExpectedFailureOutput,
  realPipelineScenarioResultOk,
  summarizeCleanupVerification,
  writeResultRecord,
} from './run-real-pipeline-e2e.mjs';
import { createChildOutputCapture, appendStreamCapture, childOutputDiagnostics } from './bounded-output-capture.mjs';
import { listRealE2EScenarioIds } from './failure-scenarios.mjs';

test('README supported-scenarios list matches the scenario registry', () => {
  const readmePath = path.join(path.dirname(new URL(import.meta.url).pathname), 'README.md');
  const readme = fs.readFileSync(readmePath, 'utf8');
  const block = readme.match(/Supported scenarios:\n\n(?<list>(?:- `[^`]+`\n)+)/)?.groups?.list || '';
  const readmeIds = block
    .split('\n')
    .map((line) => line.match(/^- `([^`]+)`$/)?.[1])
    .filter(Boolean);

  assert.deepEqual(readmeIds, listRealE2EScenarioIds());
});

test('expected nonzero scenarios require durable failure evidence', () => {
  const scenario = { id: 'buster-module-failure', expectedPipelineExit: 'nonzero' };

  assert.equal(realPipelineScenarioResultOk({
    scenario,
    pipelineExpectationMet: true,
    failureEvidence: { ok: false },
  }), false);
});

test('expected nonzero scenarios ignore process-output diagnostics when typed evidence matches', () => {
  const scenario = { id: 'buster-module-failure', expectedPipelineExit: 'nonzero' };

  assert.equal(realPipelineScenarioResultOk({
    scenario,
    pipelineExpectationMet: true,
    failureEvidence: { ok: true },
  }), true);
});

test('failure output diagnostics are classified but not success evidence', () => {
  const scenario = { id: 'buster-module-failure', expectedPipelineExit: 'nonzero' };

  assert.deepEqual(diagnoseExpectedFailureOutput({
    scenario,
    pipelineOutput: { stdout: 'unrelated log', stderr: '' },
  }), {
    diagnostic_only: true,
    matched: false,
    reason: 'REAL_E2E_OUTPUT_DIAGNOSTIC_MISSING_BUSTER_MODULE_FAILURE',
  });
});

test('matching fake output diagnostics cannot make a failed scenario pass', () => {
  const scenario = { id: 'buster-module-failure', expectedPipelineExit: 'nonzero' };
  const diagnostic = diagnoseExpectedFailureOutput({
    scenario,
    pipelineOutput: {
      stdout: 'REAL_E2E_EXPECTED_BUSTER_MODULE_FAILURE\nBuster FAIL\n',
      stderr: '',
    },
  });

  assert.deepEqual(diagnostic, {
    diagnostic_only: true,
    matched: true,
    reason: null,
  });
  assert.equal(realPipelineScenarioResultOk({
    scenario,
    pipelineExpectationMet: true,
    failureEvidence: { ok: false },
  }), false);
});

test('expected zero scenarios still require success evidence', () => {
  const scenario = { id: 'success', expectedPipelineExit: 'zero' };

  assert.equal(realPipelineScenarioResultOk({
    scenario,
    pipelineExpectationMet: true,
    successEvidence: { ok: true },
  }), true);
  assert.equal(realPipelineScenarioResultOk({
    scenario,
    pipelineExpectationMet: true,
    successEvidence: { ok: false },
  }), false);
});

test('structured result files persist canonical metadata assertions cleanup and bounded diagnostics', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'real-e2e-result-record-'));
  const resultPath = path.join(root, 'result.json');
  const args = {
    resultPath,
    mode: 'fast',
    scenarioConfig: {
      id: 'buster-module-failure',
      description: 'unit scenario',
      expectedPipelineExit: 'nonzero',
      expectedCleanupOk: true,
      approvalDecision: 'approve',
      expectedEvidence: 'buster_module_failure',
    },
  };
  const output = createChildOutputCapture({ label: 'unit-pipeline', tailLimitBytes: 12, fatalLineLimit: 2 });
  appendStreamCapture(output.stdout, 'start\nall good\n');
  appendStreamCapture(output.stderr, 'Error: first failure\nwarning\n');
  const workspace = {
    artifactRoot: path.join(root, 'artifacts'),
    worktreePath: path.join(root, 'worktree'),
    projectSrc: path.join(root, 'project', 'src'),
    swarmDir: path.join(root, 'project', 'src', '.swarm'),
    runConfigPath: path.join(root, 'swarm.config.json'),
    cleanupManifestPath: path.join(root, 'cleanup.json'),
    runId: 'run-1',
  };

  const initial = createResultRecord(args);
  const written = writeResultRecord(resultPath, {
    ...initial,
    ok: false,
    exit_code: 1,
    capability_probe: { ok: true, failures: [] },
    workspace: { run_id: 'run-1' },
    artifact_paths: artifactPathsForWorkspace(workspace),
    pipeline: {
      ok: false,
      phase: 'pipeline-run',
      pipeline_expectation_met: true,
    },
    assertions: {
      pipeline_expectation_met: true,
      failure_evidence: { ok: false, failures: [{ code: 'unit_contract', reason: 'REAL_E2E_UNIT_FAILURE' }] },
    },
    cleanup: { ok: true, cleanup: { steps: [] } },
    diagnostics: { pipeline: childOutputDiagnostics('unit-pipeline', output) },
    phases: [{ phase: 'pipeline-run', ok: false, completed_at: '2026-06-28T00:00:00.000Z' }],
  });

  const persisted = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
  assert.equal(written.schema_version, 'real_pipeline_e2e_result.v1');
  assert.equal(persisted.artifact_type, 'real_pipeline_e2e_result');
  assert.equal(persisted.scenario.id, 'buster-module-failure');
  assert.equal(persisted.capability_probe.ok, true);
  assert.equal(persisted.assertions.failure_evidence.failures[0].reason, 'REAL_E2E_UNIT_FAILURE');
  assert.equal(persisted.cleanup.ok, true);
  assert.equal(persisted.artifact_paths.lifecycle_events.endsWith('logs/pipeline/runs/run-1/lifecycle/canonical-events.jsonl'), true);
  assert.equal(persisted.diagnostics.pipeline.stderr.fatal_lines[0], 'Error: first failure');
  assert.equal(persisted.diagnostics.pipeline.stdout.truncated, true);
});

test('cleanup verification treats retained artifacts as diagnostic while requiring infra cleanup', () => {
  const cleanup = {
    ok: true,
    steps: [
      { step: 'redis_run_keys_delete', ok: true, detail: { deleted: ['pipeline:telemetry:project:run'] } },
      { step: 'kubernetes_run_resources_delete', ok: true, detail: { leases: ['lease-1'], namespaces: ['test-project-run'] } },
      { step: 'git_worktree_remove', ok: true },
      { step: 'git_branch_delete', ok: true },
      { step: 'artifact_root_retained', ok: true, detail: '/tmp/artifacts' },
    ],
  };

  const verification = summarizeCleanupVerification(cleanup, { keepArtifacts: true });

  assert.equal(verification.ok, true);
  assert.equal(verification.infra_ok, true);
  assert.deepEqual(verification.failed_surfaces, []);
  assert.deepEqual(verification.artifact_retention, {
    retained: true,
    removed: false,
    diagnostic_only: true,
    path: '/tmp/artifacts',
    ok: true,
  });
});

test('cleanup verification fails when infra cleanup fails even if artifacts are retained', () => {
  const cleanup = {
    ok: false,
    steps: [
      { step: 'redis_run_keys_delete', ok: true, detail: { deleted: [] } },
      { step: 'kubernetes_run_resources_delete', ok: false, detail: { list_failures: [{ resource: 'namespaces', error: 'forbidden' }] } },
      { step: 'git_worktree_remove', ok: true },
      { step: 'git_branch_delete', ok: true },
      { step: 'artifact_root_retained', ok: true, detail: '/tmp/artifacts' },
    ],
  };

  const verification = summarizeCleanupVerification(cleanup, { keepArtifacts: true });

  assert.equal(verification.ok, false);
  assert.equal(verification.infra_ok, false);
  assert.deepEqual(verification.failed_surfaces, [{
    surface: 'kubernetes',
    detail: { list_failures: [{ resource: 'namespaces', error: 'forbidden' }] },
  }]);
  assert.equal(verification.artifact_retention.ok, true);
});

test('cleanup verification records induced git cleanup failure as recovered infra cleanup', () => {
  const cleanup = {
    ok: false,
    steps: [
      { step: 'redis_run_keys_delete', ok: true, detail: { deleted: [] } },
      { step: 'kubernetes_run_resources_delete', ok: true, detail: { leases: [], namespaces: [] } },
      { step: 'git_worktree_remove', ok: true },
      { step: 'git_branch_delete', ok: false, detail: 'branch is checked out' },
      { step: 'git_cleanup_blocker_worktree_remove', ok: true, detail: '/tmp/blocker' },
      { step: 'git_branch_delete_after_blocker_cleanup', ok: true },
      { step: 'artifact_root_remove', ok: true },
    ],
  };

  const verification = summarizeCleanupVerification(cleanup, {
    keepArtifacts: false,
    cleanupFailureObserved: true,
  });

  assert.equal(verification.ok, true);
  assert.equal(verification.infra_ok, true);
  assert.equal(verification.cleanup_failure_observed, true);
  assert.equal(verification.surfaces.git_branch.ok, true);
  assert.equal(verification.artifact_retention.removed, true);
});
