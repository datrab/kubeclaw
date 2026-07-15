import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  CHECKPOINT_FIXTURE_FAMILIES,
  CHECKPOINT_NAMES,
  DEFAULT_CHECKPOINT_FIXTURE_FAMILY,
  captureCheckpoint,
  checkpointDefinition,
  checkpointForScenario,
  checkpointHookContract,
  checkpointPlanForScenario,
  defaultCheckpointRoot,
  restoreCheckpointProjectSource,
  startCheckpointCaptureController,
  validateCheckpointBundle,
  validateCheckpointState,
  validateScenarioCheckpointContract,
} from './checkpoints.mjs';
import {
  checkpointContractForScenario,
  scenarioMutationContractForScenario,
  assertScenarioMutationChannel,
  assertScenarioSetupChannel,
  listFailureMatrixSuiteScenarioIds,
  resolveRealE2EScenario,
} from './failure-scenarios.mjs';

const MODULES = Object.freeze(['01-nginx', '02-nginx', '03-nginx', '04-nginx']);
const MODULE_BUSTER_DONE_CHECKPOINTS = new Set([
  'pre-module-review',
  'post-module-review',
  'post-approval',
  'pre-final-buster',
  'pre-final-review',
  'post-final-review',
  'pre-terminal-delivery',
  'during-cleanup',
]);
const MODULE_REVIEW_DONE_CHECKPOINTS = new Set([
  'post-module-review',
  'post-approval',
  'pre-final-buster',
  'pre-final-review',
  'post-final-review',
  'pre-terminal-delivery',
  'during-cleanup',
]);
const FINAL_BUSTER_DONE_CHECKPOINTS = new Set([
  'pre-final-review',
  'post-final-review',
  'pre-terminal-delivery',
  'during-cleanup',
]);
const FINAL_REVIEW_DONE_CHECKPOINTS = new Set([
  'post-final-review',
  'pre-terminal-delivery',
  'during-cleanup',
]);
const SUMMARY_DONE_CHECKPOINTS = new Set(['pre-terminal-delivery', 'during-cleanup']);

function write(filePath, value = '{}\n') {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value);
}

function writePassJson(filePath) {
  write(filePath, '{"status":"PASS"}\n');
}

function makeSwarmDir({ checkpoint = 'fresh', scenario = 'success' } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'real-e2e-checkpoint-test-'));
  const swarmDir = path.join(root, 'worktree', 'Projects', 'project-a', 'src', '.swarm');
  write(path.join(swarmDir, 'progress.json'), JSON.stringify({
    project: 'project-a',
    real_e2e: { scenario_id: scenario },
  }, null, 2));
  if (checkpoint !== 'fresh') {
    write(path.join(swarmDir, 'logs', 'pipeline', 'runs', 'run-1', 'lifecycle', 'canonical-events.jsonl'), [
      JSON.stringify({ type: 'pipeline_run.started', refs: { run_id: 'run-1' }, data: { project: 'project-a' } }),
      '',
    ].join('\n'));
    const passedModuleStates = Object.fromEntries(MODULES.map((moduleId) => [
      moduleId,
      { module_id: moduleId, status: 'PASS' },
    ]));
    write(path.join(swarmDir, 'logs', 'pipeline', 'runs', 'run-1', 'lifecycle', 'read-models.json'), JSON.stringify({
      schema_version: 'pipeline_lifecycle_read_models.v1',
      pipeline: { run_id: 'run-1', status: 'running' },
      modules: MODULE_BUSTER_DONE_CHECKPOINTS.has(checkpoint)
        ? passedModuleStates
        : {
            '01-nginx': {
              module_id: '01-nginx',
              status: checkpoint === 'during-module-buster-wait'
                ? 'TESTING'
                : (['post-forge', 'pre-module-buster'].includes(checkpoint) ? 'READY_FOR_TESTING' : 'IN_PROGRESS'),
            },
          },
    }, null, 2));
  }
  for (const relativePath of checkpointDefinition(checkpoint).required_swarm_paths) {
    if (relativePath === 'progress.json') continue;
    write(path.join(swarmDir, relativePath));
  }
  if (MODULE_BUSTER_DONE_CHECKPOINTS.has(checkpoint)) {
    for (const moduleId of MODULES) {
      writePassJson(path.join(swarmDir, 'modules', moduleId, 'buster-output.json'));
    }
  }
  if (MODULE_REVIEW_DONE_CHECKPOINTS.has(checkpoint)) {
    writePassJson(path.join(swarmDir, 'logs', 'echo-review', 'MODULE-REVIEW.json'));
  }
  if (FINAL_BUSTER_DONE_CHECKPOINTS.has(checkpoint)) {
    writePassJson(path.join(swarmDir, 'buster-test', 'FINAL-BUSTER-RESULT.json'));
  }
  if (FINAL_REVIEW_DONE_CHECKPOINTS.has(checkpoint)) {
    writePassJson(path.join(swarmDir, 'logs', 'echo-review', 'FINAL-REVIEW.json'));
  }
  if (SUMMARY_DONE_CHECKPOINTS.has(checkpoint)) {
    write(path.join(swarmDir, 'logs', 'pipeline', 'summary.json'), '{"status":"PASS"}\n');
    write(path.join(swarmDir, 'logs', 'pipeline', 'latest.json'), '{"status":"PASS"}\n');
  }
  return { root, swarmDir };
}

test('checkpoint definitions cover every named boundary', () => {
  assert.deepEqual(CHECKPOINT_NAMES, [
    'fresh',
    'pre-forge',
    'post-forge',
    'pre-module-buster',
    'during-module-buster-wait',
    'pre-module-review',
    'post-module-review',
    'post-approval',
    'pre-final-buster',
    'pre-final-review',
    'post-final-review',
    'pre-terminal-delivery',
    'during-cleanup',
  ]);

  for (const checkpoint of CHECKPOINT_NAMES) {
    const definition = checkpointDefinition(checkpoint);
    assert.equal(definition.name, checkpoint);
    assert.equal(definition.required_swarm_paths.includes('progress.json'), true);
    assert.equal(Array.isArray(definition.forbidden_swarm_paths), true);
  }
});

test('scenario checkpoint contracts cover all matrix scenarios without sentinel full lifecycle fallbacks', () => {
  assert.deepEqual(CHECKPOINT_FIXTURE_FAMILIES, ['standard-4-module', 'linear-2-module', 'single-module']);
  assert.equal(checkpointForScenario('success'), 'pre-forge');
  assert.equal(checkpointForScenario('forge-retry-then-success'), 'pre-forge');

  assert.equal(checkpointForScenario('buster-module-failure'), 'pre-module-buster');
  assert.equal(checkpointForScenario('retry-budget-exhausted'), 'pre-module-buster');
  assert.equal(checkpointForScenario('buster-invalid-completion-identity'), 'during-module-buster-wait');
  assert.equal(checkpointForScenario('retry-fix-malformed-output'), 'pre-forge');
  assert.equal(checkpointForScenario('retry-buster-pass-echo-rejects'), 'pre-forge');
  assert.equal(checkpointForScenario('git-cleanup-failure'), 'post-forge');
  assert.equal(checkpointForScenario('echo-malformed-output'), 'pre-module-review');
  assert.equal(checkpointForScenario('approval-deny'), 'post-module-review');
  assert.equal(checkpointForScenario('pipeline-review-timeout'), 'pre-terminal-delivery');
  assert.equal(checkpointForScenario('k8s-pod-never-ready'), 'pre-forge');
  assert.equal(checkpointForScenario('final-review-timeout'), 'pre-final-review');
  assert.equal(checkpointForScenario('pipeline-summary-failure'), 'post-final-review');
  assert.equal(checkpointForScenario('discord-unavailable'), 'pre-terminal-delivery');
  assert.equal(checkpointForScenario('crash-during-cleanup'), 'during-cleanup');
  assert.equal(checkpointForScenario('multi-module-independent-success'), 'pre-forge');
  assert.equal(checkpointForScenario('pipeline-cancelled'), 'pre-forge');
  assert.equal(checkpointPlanForScenario('retry-fix-malformed-output').fixture_family, DEFAULT_CHECKPOINT_FIXTURE_FAMILY);
  assert.equal(resolveRealE2EScenario('success').checkpointContract.required_hook, 'pre-forge');

  const fullLifecycle = listFailureMatrixSuiteScenarioIds()
    .filter((scenario) => checkpointContractForScenario(scenario).required_hook === 'fresh');
  assert.deepEqual(fullLifecycle, []);

  const invalid = listFailureMatrixSuiteScenarioIds()
    .map((scenario) => ({
      scenario,
      contract: checkpointContractForScenario(scenario),
    }))
    .filter(({ contract }) => !CHECKPOINT_NAMES.includes(contract.required_hook)
      || !CHECKPOINT_FIXTURE_FAMILIES.includes(contract.fixture_family)
      || typeof contract.fault_injection_surface !== 'string'
      || contract.fault_injection_surface.length === 0
      || typeof contract.expected_terminal_authority !== 'string'
      || contract.expected_terminal_authority.length === 0);
  assert.deepEqual(invalid, []);

  const hookContractFailures = listFailureMatrixSuiteScenarioIds()
    .map((scenario) => {
      const checkpoint = checkpointForScenario(scenario);
      return validateScenarioCheckpointContract({
        scenarioId: scenario,
        checkpoint,
        manifest: {
          fixture_family: DEFAULT_CHECKPOINT_FIXTURE_FAMILY,
          hook_contract: checkpointHookContract(checkpoint),
        },
      });
    })
    .filter((result) => !result.ok);
  assert.deepEqual(hookContractFailures, []);
});

test('scenario mutation contracts reject out-of-surface mutation channels', () => {
  assert.deepEqual(scenarioMutationContractForScenario('buster-invalid-completion-identity'), {
    scenario_id: 'buster-invalid-completion-identity',
    fault_injection_surface: 'module-buster',
    allowed_mutation_channels: ['progress', 'buster-simulator', 'fixture-contract'],
  });
  assert.equal(assertScenarioMutationChannel('buster-invalid-completion-identity', 'buster-simulator'), true);
  assert.throws(
    () => assertScenarioMutationChannel('buster-invalid-completion-identity', 'git-shim'),
    /cannot mutate channel 'git-shim'/,
  );
  assert.equal(assertScenarioMutationChannel('pipeline-summary-failure', 'config'), true);
  assert.throws(
    () => assertScenarioMutationChannel('pipeline-summary-failure', 'progress'),
    /cannot mutate channel 'progress'/,
  );
  assert.equal(assertScenarioSetupChannel('success', 'operator-controller'), true);
  assert.throws(
    () => assertScenarioMutationChannel('buster-invalid-completion-identity', 'operator-controller'),
    /cannot mutate channel 'operator-controller'/,
  );
  assert.throws(
    () => assertScenarioMutationChannel('success', 'file'),
    /cannot mutate channel 'file'/,
  );
});

test('checkpoint hook contracts expose minimal state boundaries', () => {
  const hook = checkpointHookContract('pre-module-review');

  assert.equal(hook.name, 'pre-module-review');
  assert.equal(hook.phase_boundary, 'pre-module-review');
  assert.deepEqual(hook.fixture_families, [DEFAULT_CHECKPOINT_FIXTURE_FAMILY]);
  assert.equal(hook.required_state.swarm_paths.includes('progress.json'), true);
  assert.equal(hook.required_state.swarm_paths.includes('modules/04-nginx/buster-output.json'), true);
  assert.equal(hook.forbidden_state.swarm_paths.includes('logs/echo-review/MODULE-REVIEW.json'), true);
  assert.deepEqual(hook.required_lifecycle_state.module_statuses['04-nginx'], ['PASS']);
  assert.deepEqual(hook.skipped_agent_phases, ['forge', 'git-sync', 'module-buster']);
  assert.equal(hook.remaining_phases[0], 'module-review');
  assert.deepEqual(hook.allowed_fault_surfaces, ['module-review']);
});

test('checkpoint validation rejects missing required and present downstream artifacts', () => {
  const { swarmDir } = makeSwarmDir({ checkpoint: 'post-forge' });
  let result = validateCheckpointState({ checkpoint: 'post-forge', swarmDir });
  assert.equal(result.ok, true);
  assert.equal(result.lifecycle.ok, true);

  fs.rmSync(path.join(swarmDir, 'modules', '01-nginx', 'forge-completion.json'));
  result = validateCheckpointState({ checkpoint: 'post-forge', swarmDir });
  assert.equal(result.ok, false);
  assert.deepEqual(result.missing, ['modules/01-nginx/forge-completion.json']);

  write(path.join(swarmDir, 'modules', '01-nginx', 'forge-completion.json'));
  write(path.join(swarmDir, 'modules', '01-nginx', 'buster-output.json'));
  result = validateCheckpointState({ checkpoint: 'post-forge', swarmDir });
  assert.equal(result.ok, false);
  assert.deepEqual(result.forbidden_present, ['modules/01-nginx/buster-output.json']);

  fs.rmSync(path.join(swarmDir, 'modules', '01-nginx', 'buster-output.json'));
  fs.rmSync(path.join(swarmDir, 'logs', 'pipeline', 'runs', 'run-1', 'lifecycle', 'read-models.json'));
  result = validateCheckpointState({ checkpoint: 'post-forge', swarmDir });
  assert.equal(result.ok, false);
  assert.equal(result.lifecycle.reason, 'CHECKPOINT_LIFECYCLE_STATE_MISSING');
});

test('checkpoint validation permits active latest pointer before terminal summaries', () => {
  const { swarmDir } = makeSwarmDir({ checkpoint: 'post-forge' });
  write(path.join(swarmDir, 'logs', 'pipeline', 'latest.json'), JSON.stringify({ run_id: 'run-1' }, null, 2));

  const result = validateCheckpointState({ checkpoint: 'post-forge', swarmDir });

  assert.equal(result.ok, true);
});

test('captured checkpoint bundle records manifest and validates copied state', () => {
  const { root, swarmDir } = makeSwarmDir({ checkpoint: 'pre-module-review' });
  const checkpointRoot = defaultCheckpointRoot(fs.mkdtempSync(path.join(os.tmpdir(), 'real-e2e-checkpoint-store-')));
  const workspace = {
    runId: 'run-1',
    projectName: 'project-a',
    artifactRoot: root,
    worktreePath: path.join(root, 'worktree'),
    projectSrc: path.join(root, 'worktree', 'Projects', 'project-a', 'src'),
    swarmDir,
  };

  const captured = captureCheckpoint({
    checkpointRoot,
    checkpoint: 'pre-module-review',
    workspace,
    seedId: 'seed-1',
  });
  assert.equal(fs.existsSync(path.join(captured.checkpoint_dir, 'checkpoint-manifest.json')), true);

  const validation = validateCheckpointBundle({
    checkpointDir: captured.checkpoint_dir,
    checkpoint: 'pre-module-review',
  });
  assert.equal(validation.ok, true);
  assert.equal(validation.manifest.source.run_id, 'run-1');
  assert.equal(validation.manifest.fixture_family, DEFAULT_CHECKPOINT_FIXTURE_FAMILY);
  assert.equal(fs.existsSync(path.join(captured.checkpoint_dir, 'origin.git')), false);
});

test('checkpoint bundle validation rejects wrong scenario hook or fixture family before reuse', () => {
  const { root, swarmDir } = makeSwarmDir({ checkpoint: 'post-forge' });
  const checkpointRoot = defaultCheckpointRoot(fs.mkdtempSync(path.join(os.tmpdir(), 'real-e2e-checkpoint-contract-store-')));
  const workspace = {
    runId: 'run-1',
    projectName: 'project-a',
    artifactRoot: root,
    worktreePath: path.join(root, 'worktree'),
    projectSrc: path.join(root, 'worktree', 'Projects', 'project-a', 'src'),
    swarmDir,
  };

  const captured = captureCheckpoint({
    checkpointRoot,
    checkpoint: 'post-forge',
    workspace,
    seedId: 'seed-1',
  });

  const wrongHook = validateCheckpointBundle({
    checkpointDir: captured.checkpoint_dir,
    checkpoint: 'post-forge',
    scenarioId: 'echo-malformed-output',
  });
  assert.equal(wrongHook.ok, false);
  assert.equal(wrongHook.reason, 'CHECKPOINT_CONTRACT_UNSATISFIED');
  assert.deepEqual(wrongHook.scenario_contract.failures, [
    { field: 'required_hook', expected: 'pre-module-review', actual: 'post-forge' },
    {
      field: 'fault_injection_surface',
      expected: ['git-sync', 'crash-resume.*'],
      actual: 'module-review',
    },
  ]);

  const manifestPath = path.join(captured.checkpoint_dir, 'checkpoint-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.fixture_family = 'single-module';
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const wrongFixture = validateCheckpointBundle({
    checkpointDir: captured.checkpoint_dir,
    checkpoint: 'post-forge',
    scenarioId: 'git-cleanup-failure',
  });
  assert.equal(wrongFixture.ok, false);
  assert.equal(wrongFixture.reason, 'CHECKPOINT_CONTRACT_UNSATISFIED');
  assert.deepEqual(wrongFixture.scenario_contract.failures, [
    { field: 'manifest.fixture_family', expected: 'standard-4-module', actual: 'single-module' },
  ]);

  const direct = validateScenarioCheckpointContract({
    scenarioId: 'git-cleanup-failure',
    checkpoint: 'post-forge',
    manifest: {
      fixture_family: DEFAULT_CHECKPOINT_FIXTURE_FAMILY,
      hook_contract: captured.manifest.hook_contract,
    },
  });
  assert.equal(direct.ok, true);
});

test('checkpoint validation rejects module-buster artifact without lifecycle PASS', () => {
  const { swarmDir } = makeSwarmDir({ checkpoint: 'pre-module-review' });
  write(path.join(swarmDir, 'logs', 'pipeline', 'runs', 'run-1', 'lifecycle', 'read-models.json'), JSON.stringify({
    schema_version: 'pipeline_lifecycle_read_models.v1',
    pipeline: { run_id: 'run-1', status: 'running' },
    modules: {
      '01-nginx': { module_id: '01-nginx', status: 'FAIL' },
    },
  }, null, 2));

  const result = validateCheckpointState({ checkpoint: 'pre-module-review', swarmDir });

  assert.equal(result.ok, false);
  assert.deepEqual(result.semantics.failures, [
    { path: 'lifecycle.modules.01-nginx.status', expected: 'PASS', actual: 'FAIL' },
    { path: 'lifecycle.modules.02-nginx.status', expected: 'PASS', actual: 'missing' },
    { path: 'lifecycle.modules.03-nginx.status', expected: 'PASS', actual: 'missing' },
    { path: 'lifecycle.modules.04-nginx.status', expected: 'PASS', actual: 'missing' },
  ]);
});

test('checkpoint validation rejects forge completion before lifecycle ready-for-testing', () => {
  const { swarmDir } = makeSwarmDir({ checkpoint: 'post-forge' });
  write(path.join(swarmDir, 'logs', 'pipeline', 'runs', 'run-1', 'lifecycle', 'read-models.json'), JSON.stringify({
    schema_version: 'pipeline_lifecycle_read_models.v1',
    pipeline: { run_id: 'run-1', status: 'running' },
    modules: {
      '01-nginx': { module_id: '01-nginx', status: 'IN_PROGRESS' },
    },
  }, null, 2));

  const result = validateCheckpointState({ checkpoint: 'post-forge', swarmDir });

  assert.equal(result.ok, false);
  assert.deepEqual(result.semantics.failures, [
    { path: 'lifecycle.modules.01-nginx.status', expected: 'READY_FOR_TESTING', actual: 'IN_PROGRESS' },
  ]);
});

test('post-final-review checkpoint capture prunes terminal files from late copied bundle', () => {
  const { root, swarmDir } = makeSwarmDir({ checkpoint: 'post-final-review' });
  const checkpointRoot = defaultCheckpointRoot(fs.mkdtempSync(path.join(os.tmpdir(), 'real-e2e-checkpoint-prune-store-')));
  write(path.join(swarmDir, 'logs', 'pipeline', 'summary.json'), '{"status":"blocked"}\n');
  write(path.join(swarmDir, 'logs', 'pipeline', 'latest.json'), '{"status":"blocked"}\n');
  assert.equal(validateCheckpointState({ checkpoint: 'post-final-review', swarmDir }).ok, false);

  const captured = captureCheckpoint({
    checkpointRoot,
    checkpoint: 'post-final-review',
    workspace: {
      runId: 'run-1',
      projectName: 'project-a',
      artifactRoot: root,
      worktreePath: path.join(root, 'worktree'),
      projectSrc: path.join(root, 'worktree', 'Projects', 'project-a', 'src'),
      swarmDir,
    },
    seedId: 'seed-1',
  });

  const validation = validateCheckpointBundle({
    checkpointDir: captured.checkpoint_dir,
    checkpoint: 'post-final-review',
  });
  assert.equal(validation.ok, true);
  assert.deepEqual(captured.manifest.pruned_forbidden_swarm_paths, [
    'logs/pipeline/summary.json',
    'logs/pipeline/latest.json',
  ]);
});

test('checkpoint capture controller captures phase boundary before downstream artifacts appear', async () => {
  const { root, swarmDir } = makeSwarmDir({ checkpoint: 'pre-forge' });
  const checkpointRoot = defaultCheckpointRoot(fs.mkdtempSync(path.join(os.tmpdir(), 'real-e2e-checkpoint-controller-store-')));
  const workspace = {
    runId: 'run-1',
    projectName: 'project-a',
    artifactRoot: root,
    worktreePath: path.join(root, 'worktree'),
    projectSrc: path.join(root, 'worktree', 'Projects', 'project-a', 'src'),
    swarmDir,
  };
  const controller = startCheckpointCaptureController({
    checkpointRoot,
    workspace,
    seedId: 'seed-1',
    checkpoints: ['post-forge'],
    intervalMs: 10,
  });

  write(path.join(swarmDir, 'modules', '01-nginx', 'forge-completion.json'));
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.deepEqual((await controller.stop()).pending, ['post-forge']);
});

test('checkpoint capture controller waits for lifecycle boundary after forge artifact', async () => {
  const { root, swarmDir } = makeSwarmDir({ checkpoint: 'pre-forge' });
  const checkpointRoot = defaultCheckpointRoot(fs.mkdtempSync(path.join(os.tmpdir(), 'real-e2e-checkpoint-controller-boundary-store-')));
  const workspace = {
    runId: 'run-1',
    projectName: 'project-a',
    artifactRoot: root,
    worktreePath: path.join(root, 'worktree'),
    projectSrc: path.join(root, 'worktree', 'Projects', 'project-a', 'src'),
    swarmDir,
  };
  const controller = startCheckpointCaptureController({
    checkpointRoot,
    workspace,
    seedId: 'seed-1',
    checkpoints: ['post-forge'],
    intervalMs: 10,
  });

  write(path.join(swarmDir, 'modules', '01-nginx', 'forge-completion.json'));
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.deepEqual([...controller.state.pending], ['post-forge']);
  write(path.join(swarmDir, 'logs', 'pipeline', 'runs', 'run-1', 'lifecycle', 'canonical-events.jsonl'), [
    JSON.stringify({ type: 'pipeline_run.started', refs: { run_id: 'run-1' }, data: { project: 'project-a' } }),
    '',
  ].join('\n'));
  write(path.join(swarmDir, 'logs', 'pipeline', 'runs', 'run-1', 'lifecycle', 'read-models.json'), JSON.stringify({
    schema_version: 'pipeline_lifecycle_read_models.v1',
    pipeline: { run_id: 'run-1', status: 'running' },
    modules: {
      '01-nginx': { module_id: '01-nginx', status: 'READY_FOR_TESTING' },
    },
  }, null, 2));
  await new Promise((resolve) => setTimeout(resolve, 40));
  write(path.join(swarmDir, 'modules', '01-nginx', 'buster-output.json'));
  const result = await controller.stop();

  assert.deepEqual(result.pending, []);
  assert.equal(result.captured[0]?.checkpoint, 'post-forge');
  assert.equal(validateCheckpointBundle({
    checkpointDir: result.captured[0].checkpoint_dir,
    checkpoint: 'post-forge',
  }).ok, true);
});

test('checkpoint restore rewrites run-scoped project state and validates restored boundary', () => {
  const { root, swarmDir } = makeSwarmDir({ checkpoint: 'post-forge' });
  write(path.join(swarmDir, 'logs', 'pipeline', 'runs', 'run-1', 'lifecycle', 'canonical-events.jsonl'), [
    JSON.stringify({ refs: { run_id: 'run-1' }, data: { project: 'project-a' } }),
    '',
  ].join('\n'));
  write(path.join(swarmDir, 'logs', 'pipeline', 'runs', 'run-1', 'lifecycle', 'read-models.json'), JSON.stringify({
    pipeline: { run_id: 'run-1', project: 'project-a' },
    modules: {
      '01-nginx': {
        module_id: '01-nginx',
        status: 'READY_FOR_TESTING',
        commit_hash: '1234567890abcdef1234567890abcdef12345678',
      },
    },
  }, null, 2));
  write(path.join(swarmDir, 'logs', 'pipeline', 'runs', 'run-1', 'lifecycle', 'canonical-events.jsonl'), [
    JSON.stringify({
      refs: { run_id: 'run-1' },
      data: { project: 'project-a', commit_hash: '1234567890abcdef1234567890abcdef12345678' },
    }),
    '',
  ].join('\n'));
  const checkpointRoot = defaultCheckpointRoot(fs.mkdtempSync(path.join(os.tmpdir(), 'real-e2e-checkpoint-restore-store-')));
  const captured = captureCheckpoint({
    checkpointRoot,
    checkpoint: 'post-forge',
    seedId: 'seed-1',
    workspace: {
      runId: 'run-1',
      projectName: 'project-a',
      artifactRoot: root,
      worktreePath: path.join(root, 'worktree'),
      swarmDir,
    },
  });
  const restoreRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'real-e2e-checkpoint-restore-target-'));
  const workspace = {
    runId: 'run-2',
    projectName: 'project-b',
    artifactRoot: restoreRoot,
    worktreePath: path.join(restoreRoot, 'worktree'),
    projectSrc: path.join(restoreRoot, 'worktree', 'Projects', 'project-b', 'src'),
    swarmDir: path.join(restoreRoot, 'worktree', 'Projects', 'project-b', 'src', '.swarm'),
  };

  const restored = restoreCheckpointProjectSource({
    checkpointDir: captured.checkpoint_dir,
    checkpoint: 'post-forge',
    workspace,
  });

  assert.equal(restored.restored_project, 'project-b');
  assert.equal(restored.restored_run_id, 'run-2');
  assert.equal(validateCheckpointState({ checkpoint: 'post-forge', swarmDir: workspace.swarmDir }).ok, true);
  const restoredLifecycle = fs.readFileSync(
    path.join(workspace.swarmDir, 'logs', 'pipeline', 'runs', 'run-2', 'lifecycle', 'canonical-events.jsonl'),
    'utf8',
  );
  assert.match(restoredLifecycle, /run-2/);
  assert.match(restoredLifecycle, /project-b/);
  assert.doesNotMatch(restoredLifecycle, /run-1|project-a/);
  const restoredReadModels = fs.readFileSync(
    path.join(workspace.swarmDir, 'logs', 'pipeline', 'runs', 'run-2', 'lifecycle', 'read-models.json'),
    'utf8',
  );
  assert.match(restoredReadModels, /run-2/);
  assert.match(restoredReadModels, /project-b/);
  assert.equal(JSON.parse(restoredReadModels).modules['01-nginx'].commit_hash, null);
  const restoredEvents = fs.readFileSync(
    path.join(workspace.swarmDir, 'logs', 'pipeline', 'runs', 'run-2', 'lifecycle', 'canonical-events.jsonl'),
    'utf8',
  );
  assert.match(restoredEvents, /1234567890abcdef1234567890abcdef12345678/);
});

test('checkpoint restore rewrites pipeline run identity from latest pointer', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'real-e2e-checkpoint-pipeline-run-'));
  const swarmDir = path.join(root, 'worktree', 'Projects', 'project-a', 'src', '.swarm');
  write(path.join(swarmDir, 'progress.json'), JSON.stringify({
    project: 'project-a',
    real_e2e: { scenario_id: 'success' },
  }, null, 2));
  write(path.join(swarmDir, 'modules', '01-nginx', 'forge-completion.json'), '{"status":"READY_FOR_TESTING"}\n');
  write(path.join(swarmDir, 'logs', 'pipeline', 'latest.json'), JSON.stringify({
    run_id: 'run-seed',
    run_dir: 'runs/run-seed',
    telemetry_stream_key: 'pipeline:telemetry:project-a:run-seed',
  }, null, 2));
  write(path.join(swarmDir, 'logs', 'pipeline', 'runs', 'run-seed', 'lifecycle', 'read-models.json'), JSON.stringify({
    pipeline: { run_id: 'run-seed', status: 'RUNNING' },
    modules: { '01-nginx': { status: 'READY_FOR_TESTING' } },
  }, null, 2));
  write(path.join(swarmDir, 'logs', 'pipeline', 'runs', 'run-seed', 'lifecycle', 'canonical-events.jsonl'), [
    JSON.stringify({ type: 'pipeline_run.started', run_id: 'run-seed', project: 'project-a' }),
    '',
  ].join('\n'));

  const checkpointRoot = defaultCheckpointRoot(fs.mkdtempSync(path.join(os.tmpdir(), 'real-e2e-checkpoint-pipeline-store-')));
  const captured = captureCheckpoint({
    checkpointRoot,
    checkpoint: 'post-forge',
    seedId: 'seed-1',
    workspace: {
      runId: 'outer-seed',
      projectName: 'project-a',
      artifactRoot: root,
      worktreePath: path.join(root, 'worktree'),
      swarmDir,
    },
  });
  assert.equal(captured.manifest.source.pipeline_run_id, 'run-seed');

  const restoreRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'real-e2e-checkpoint-pipeline-target-'));
  const workspace = {
    runId: 'outer-restored',
    projectName: 'project-b',
    artifactRoot: restoreRoot,
    worktreePath: path.join(restoreRoot, 'worktree'),
    projectSrc: path.join(restoreRoot, 'worktree', 'Projects', 'project-b', 'src'),
    swarmDir: path.join(restoreRoot, 'worktree', 'Projects', 'project-b', 'src', '.swarm'),
  };

  restoreCheckpointProjectSource({
    checkpointDir: captured.checkpoint_dir,
    checkpoint: 'post-forge',
    workspace,
  });

  assert.equal(fs.existsSync(path.join(workspace.swarmDir, 'logs', 'pipeline', 'runs', 'outer-restored')), true);
  assert.equal(fs.existsSync(path.join(workspace.swarmDir, 'logs', 'pipeline', 'runs', 'run-seed')), false);
  const latest = JSON.parse(fs.readFileSync(path.join(workspace.swarmDir, 'logs', 'pipeline', 'latest.json'), 'utf8'));
  assert.equal(latest.run_id, 'outer-restored');
  assert.equal(latest.run_dir, 'runs/outer-restored');
  assert.match(latest.telemetry_stream_key, /outer-restored/);
  const readModels = fs.readFileSync(path.join(workspace.swarmDir, 'logs', 'pipeline', 'runs', 'outer-restored', 'lifecycle', 'read-models.json'), 'utf8');
  assert.match(readModels, /outer-restored/);
  assert.doesNotMatch(readModels, /run-seed|project-a/);
});
