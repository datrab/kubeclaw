import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  artifactPathsForWorkspace,
  busterSimulatorTimeoutMsForPipeline,
  buildCleanupResult,
  buildRealE2EPipelineEnv,
  createResultRecord,
  diagnoseExpectedFailureOutput,
  helperTimeoutMsForPipeline,
  realPipelineScenarioResultOk,
  snapshotResultArtifacts,
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

test('real E2E pipeline env bridges local registry until deployment supplies it', () => {
  const workspace = {
    worktreePath: '/tmp/worktree',
    runConfigPath: '/tmp/swarm.config.json',
  };
  const scenario = { id: 'success' };

  const defaulted = buildRealE2EPipelineEnv({
    workspace,
    scenario,
    baseEnv: { KUBECLAW_NAMESPACE: 'custom-ns' },
  });
  assert.equal(defaulted.KUBECLAW_LOCAL_REGISTRY, 'registry-local.custom-ns.svc.cluster.local:5001');

  const explicit = buildRealE2EPipelineEnv({
    workspace,
    scenario,
    baseEnv: { KUBECLAW_LOCAL_REGISTRY: 'registry.example:5001' },
  });
  assert.equal(explicit.KUBECLAW_LOCAL_REGISTRY, 'registry.example:5001');
});

test('git fault scenarios use a harness shim instead of product config flags', () => {
  const artifactRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'real-e2e-git-shim-env-'));
  try {
    const env = buildRealE2EPipelineEnv({
      workspace: {
        artifactRoot,
        worktreePath: '/tmp/worktree',
        runConfigPath: '/tmp/swarm.config.json',
      },
      scenario: { id: 'git-credential-failure' },
      baseEnv: { PATH: process.env.PATH },
    });

    const shimDir = env.PATH.split(path.delimiter)[0];
    const shimPath = path.join(shimDir, 'git');
    assert.equal(path.dirname(shimDir), artifactRoot);
    assert.equal(fs.existsSync(shimPath), true);
    assert.match(fs.readFileSync(shimPath, 'utf8'), /Permission denied \(publickey\)/);
    assert.equal(env.REAL_E2E_GIT_FAULT_SURFACE, undefined);
  } finally {
    fs.rmSync(artifactRoot, { recursive: true, force: true });
  }
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

test('snapshotResultArtifacts copies terminal artifacts into a stable result bundle', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'real-e2e-result-bundle-'));
  const resultPath = path.join(root, 'result.json');
  const workspace = {
    artifactRoot: path.join(root, 'artifacts'),
    worktreePath: path.join(root, 'worktree'),
    projectSrc: path.join(root, 'project', 'src'),
    swarmDir: path.join(root, 'project', 'src', '.swarm'),
    runConfigPath: path.join(root, 'swarm.config.json'),
    cleanupManifestPath: path.join(root, 'cleanup.json'),
    runId: 'run-bundle',
    projectName: 'project-bundle',
  };
  const write = (relativePath, value = '{}\n') => {
    const filePath = path.join(workspace.swarmDir, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, value);
  };
  write('logs/pipeline/latest.json', '{"run_id":"run-bundle"}\n');
  write('logs/pipeline/runs/run-bundle/lifecycle/canonical-events.jsonl', '{"type":"pipeline_run.completed"}\n');
  write('logs/pipeline-review/PIPELINE-REVIEW.json', '{"status":"PASS"}\n');
  write('logs/pipeline-review/PIPELINE-REVIEW.md', '# Review\n');
  write('logs/architecture-validator/results.json', '{"findings":[]}\n');
  write('buster-test/FINAL-BUSTER-RESULT.json', '{"status":"PASS"}\n');

  const snapshot = snapshotResultArtifacts({ args: { resultPath }, workspace });

  assert.match(snapshot.stable_bundle_root, /\.swarm\/real-e2e\/results\/artifacts\/result$/);
  assert.equal(fs.existsSync(snapshot.stable_bundle_manifest), true);
  assert.equal(snapshot.authority, 'real-e2e-result-bundle');
  assert.equal(snapshot.lifecycle_events, snapshot.stable_artifacts.lifecycle_events);
  assert.equal(snapshot.project_src, undefined);
  assert.equal(snapshot.diagnostic_source_paths.project_src, workspace.projectSrc);
  assert.equal(fs.readFileSync(snapshot.stable_artifacts.pipeline_review_markdown, 'utf8'), '# Review\n');
  assert.equal(fs.readFileSync(snapshot.stable_artifacts.architecture_validator_results, 'utf8'), '{"findings":[]}\n');
  const manifest = JSON.parse(fs.readFileSync(snapshot.stable_bundle_manifest, 'utf8'));
  assert.equal(manifest.authority, 'real-e2e-result-bundle');
  assert.equal(manifest.copied.pipeline_review_json, snapshot.stable_artifacts.pipeline_review_json);
  assert.equal(manifest.missing.find((entry) => entry.label === 'pipeline_summary')?.status, 'not_reached');
});

test('stable bundle marks module review as not reached after early module halt', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'real-e2e-result-bundle-module-halt-'));
  const resultPath = path.join(root, 'result.json');
  const workspace = {
    artifactRoot: path.join(root, 'artifacts'),
    worktreePath: path.join(root, 'worktree'),
    projectSrc: path.join(root, 'project', 'src'),
    swarmDir: path.join(root, 'project', 'src', '.swarm'),
    runConfigPath: path.join(root, 'swarm.config.json'),
    cleanupManifestPath: path.join(root, 'cleanup.json'),
    runId: 'run-module-halt',
    projectName: 'project-module-halt',
  };
  const filePath = path.join(workspace.swarmDir, 'modules', '01-nginx', 'buster-output.json');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, '{"status":"PASS"}\n');

  const snapshot = snapshotResultArtifacts({ args: { resultPath }, workspace });
  const manifest = JSON.parse(fs.readFileSync(snapshot.stable_bundle_manifest, 'utf8'));

  assert.equal(manifest.missing.find((entry) => entry.label === 'module_echo_review')?.status, 'not_reached');
});

test('cleanup verification treats retained artifacts as diagnostic while requiring infra cleanup', () => {
  const cleanup = {
    ok: true,
    steps: [
      { step: 'redis_run_keys_delete', ok: true, detail: { deleted: ['pipeline:telemetry:project:run'] } },
      { step: 'kubernetes_run_resources_delete', ok: true, detail: { leases: ['lease-1'], namespaces: ['test-project-run'] } },
      { step: 'git_remote_branch_delete', ok: true, detail: 'verification/e2e/success-real-e2e-1' },
      { step: 'git_remote_branch_delete', ok: true, detail: 'real-pipeline-e2e-real-e2e-1/architecture' },
      { step: 'git_worktree_remove', ok: true },
      { step: 'git_branch_delete', ok: true },
      { step: 'git_architecture_branch_delete', ok: true },
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

test('cleanup verification treats unavailable Redis deletion as diagnostic when durable cleanup passed', () => {
  const cleanup = {
    ok: true,
    steps: [
      {
        step: 'redis_run_keys_delete',
        ok: true,
        detail: {
          deleted: [],
          diagnostic_only: true,
          unavailable: true,
          detail: 'connect ECONNREFUSED 10.43.248.50:6379',
        },
      },
      { step: 'kubernetes_run_resources_delete', ok: true, detail: { leases: [], namespaces: [] } },
      { step: 'git_remote_branch_delete', ok: true, detail: 'verification/e2e/success-real-e2e-1' },
      { step: 'git_worktree_remove', ok: true },
      { step: 'git_branch_delete', ok: true },
      { step: 'git_architecture_branch_delete', ok: true },
      { step: 'artifact_root_retained', ok: true, detail: '/tmp/artifacts' },
    ],
  };

  const verification = summarizeCleanupVerification(cleanup, { keepArtifacts: true });
  const result = buildCleanupResult(cleanup, { keepArtifacts: true });

  assert.equal(verification.ok, true);
  assert.equal(verification.surfaces.redis.ok, true);
  assert.equal(verification.surfaces.redis.detail.diagnostic_only, true);
  assert.equal(result.ok, true);
  assert.equal(result.code, 'cleanup_succeeded');
});

test('cleanup verification fails when infra cleanup fails even if artifacts are retained', () => {
  const cleanup = {
    ok: false,
    steps: [
      { step: 'redis_run_keys_delete', ok: true, detail: { deleted: [] } },
      { step: 'kubernetes_run_resources_delete', ok: false, detail: { list_failures: [{ resource: 'namespaces', error: 'forbidden' }] } },
      { step: 'git_remote_branch_delete', ok: true, detail: 'verification/e2e/failure-real-e2e-1' },
      { step: 'git_worktree_remove', ok: true },
      { step: 'git_branch_delete', ok: true },
      { step: 'git_architecture_branch_delete', ok: true },
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

test('cleanup verification explains missing cleanup authorities', () => {
  const verification = summarizeCleanupVerification({ ok: false, steps: [] }, { keepArtifacts: true });

  assert.equal(verification.ok, false);
  assert.deepEqual(verification.failed_surfaces.find((entry) => entry.surface === 'redis')?.detail, {
    reason: 'cleanup_step_missing',
    step: 'redis_run_keys_delete',
  });
  assert.deepEqual(verification.failed_surfaces.find((entry) => entry.surface === 'git_remote_branch')?.detail, [{
    reason: 'cleanup_step_missing',
    step: 'git_remote_branch_delete',
  }]);
});

test('cleanup verification records induced git cleanup failure as recovered infra cleanup', () => {
  const cleanup = {
    ok: false,
    steps: [
      { step: 'redis_run_keys_delete', ok: true, detail: { deleted: [] } },
      { step: 'kubernetes_run_resources_delete', ok: true, detail: { leases: [], namespaces: [] } },
      { step: 'git_remote_branch_delete', ok: true, detail: 'verification/e2e/cleanup-real-e2e-1' },
      { step: 'git_worktree_remove', ok: true },
      { step: 'git_branch_delete', ok: false, detail: 'branch is checked out' },
      { step: 'git_cleanup_blocker_worktree_remove', ok: true, detail: '/tmp/blocker' },
      { step: 'git_branch_delete_after_blocker_cleanup', ok: true },
      { step: 'git_architecture_branch_delete', ok: true },
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
  const result = buildCleanupResult(cleanup, {
    keepArtifacts: false,
    expectsCleanupFailure: true,
  });
  assert.equal(result.ok, true);
  assert.equal(result.code, 'git_cleanup_failed_recovered');
  assert.equal(result.failure_class, 'git_cleanup_failed');
});

test('cleanup verification fails when any remote e2e branch cleanup fails', () => {
  const cleanup = {
    ok: false,
    steps: [
      { step: 'redis_run_keys_delete', ok: true, detail: { deleted: [] } },
      { step: 'kubernetes_run_resources_delete', ok: true, detail: { leases: [], namespaces: [] } },
      { step: 'git_remote_branch_delete', ok: true, detail: 'verification/e2e/success-real-e2e-1' },
      { step: 'git_remote_branch_delete', ok: false, detail: { branch: 'real-pipeline-e2e-real-e2e-1/architecture', error: 'denied' } },
      { step: 'git_worktree_remove', ok: true },
      { step: 'git_branch_delete', ok: true },
      { step: 'git_architecture_branch_delete', ok: true },
      { step: 'artifact_root_remove', ok: true },
    ],
  };

  const verification = summarizeCleanupVerification(cleanup, { keepArtifacts: false });

  assert.equal(verification.ok, false);
  assert.equal(verification.surfaces.git_remote_branch.ok, false);
  assert.deepEqual(verification.failed_surfaces, [{
    surface: 'git_remote_branch',
    detail: [
      'verification/e2e/success-real-e2e-1',
      { branch: 'real-pipeline-e2e-real-e2e-1/architecture', error: 'denied' },
    ],
  }]);
});

test('Buster simulator timeout includes explicit rate-limit cooldown budget outside pipeline timeout', () => {
  assert.equal(
    busterSimulatorTimeoutMsForPipeline({
      pipelineTimeoutMs: 1000,
      rateLimitTimeoutExtensionMs: 2000,
      maxRateLimitPauses: 3,
    }),
    607000,
  );
  assert.equal(
    helperTimeoutMsForPipeline({
      pipelineTimeoutMs: 1000,
      rateLimitTimeoutExtensionMs: 2000,
      maxRateLimitPauses: 3,
    }),
    607000,
  );
});
