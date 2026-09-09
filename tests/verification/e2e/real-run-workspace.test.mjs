import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import {
  assertSafeArchitectureSeedBranches,
  assertSafeRunBranchPublish,
  architectureBranchNameForProject,
  buildRunConfig,
  buildProgress,
  cleanupRealE2ERunWorkspace,
  createRealE2ERunWorkspace,
  isSafeE2ERemoteBranchName,
  isSafeE2ERunBranchName,
  normalizeRealE2ERunConfigDefaults,
  normalizeRealE2ERuntimeDefaults,
  REPO_ROOT,
  validateRealE2EModel,
} from './real-run-workspace.mjs';
import {
  applyRealE2EConfigScenario,
  applyRealE2EFileScenario,
  applyRealE2EScenario,
  validateRealE2EScenarioSetup,
} from './failure-scenarios.mjs';

// Auth names are part of the non-secret operator fixture; generation never resolves their values.
process.env.KUBECLAW_REGISTRY_CONFIG = JSON.stringify({ schemaVersion: 'registry-clients.v1', registry: {
  endpoint: 'https://registry.example.test:5443', transport: 'https',
  auth: { usernameEnvironmentVariable: 'REGISTRY_TEST_USER', passwordEnvironmentVariable: 'REGISTRY_TEST_PASSWORD' },
} });

process.env.REAL_E2E_DEPLOYMENT_IMAGE = 'registry-mirror.kubeclaw.svc.cluster.local:5000/library/nginx:1.27-alpine@sha256:62223d644fa234c3a1cc785ee14242ec47a77364226f1c811d2f669f96dc2ac8';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const execFileAsync = promisify(execFile);

function withEnv(key, value, fn) {
  const prior = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  try {
    return fn();
  } finally {
    if (prior === undefined) delete process.env[key];
    else process.env[key] = prior;
  }
}

test('real e2e generation requires a published immutable deployment image', () => {
  withEnv('REAL_E2E_DEPLOYMENT_IMAGE', undefined, () => {
    assert.throws(() => buildProgress({ projectName: 'missing-deployment-image' }), /REAL_E2E_DEPLOYMENT_IMAGE_REQUIRED/u);
  });
  withEnv('REAL_E2E_DEPLOYMENT_IMAGE', 'registry-local/image:latest', () => {
    assert.throws(() => buildProgress({ projectName: 'mutable-deployment-image' }), /REAL_E2E_DEPLOYMENT_IMAGE_INVALID/u);
  });
});

test('generated real e2e config defaults to provider-qualified gpt-5.3-codex-spark with thinking none', () => {
  const progress = buildProgress({ projectName: 'unit-model-defaults' });

  assert.equal(progress.defaults.models.forge, 'openai/gpt-5.3-codex-spark');
  assert.equal(progress.defaults.models.buster, 'openai/gpt-5.3-codex-spark');
  assert.equal(progress.defaults.models.echo, 'openai/gpt-5.3-codex-spark');
  assert.equal(progress.defaults.models.arch_validator, 'openai/gpt-5.3-codex-spark');
  assert.equal(progress.defaults.thinking.forge, 'none');
  assert.equal(progress.defaults.thinking.buster, 'none');
  assert.equal(progress.defaults.thinking.echo, 'none');
  assert.equal(progress.defaults.thinking.arch_validator, 'none');
  assert.equal(progress.arch_validation.thinking_level, 'none');
  assert.equal(progress.arch_validation.agent_max_attempts, 2);
  assert.equal(progress.pipeline_review, undefined);
  assert.equal(progress.case_study, undefined);
  assert.equal(progress.modules['01-nginx'].thinking_level, 'none');
  assert.equal(progress.gates['module-review'].forge_thinking_level, 'none');
  assert.equal(progress.gates['final-review'].forge_thinking_level, 'none');
});

test('generated real e2e seed requires publishable case study output', () => {
  const config = buildRunConfig({
    runId: 'real-e2e-unit-case-study',
    worktreePath: '/tmp/real-e2e-unit-case-study/worktree',
    scenarioId: 'success',
  });

  assert.equal(config.case_study.enabled, true);
  assert.equal(config.case_study.model, 'openai/gpt-5.3-codex-spark');
  assert.equal(config.case_study.thinking_level, 'none');
  assert.equal(config.case_study.agent_id, 'codex');
  assert.equal(config.case_study.output_file, '.swarm/artifacts/v2/reports/case-study.md');
  assert.equal(config.case_study.timeout_minutes, 30);
});

test('non-smoke suite profile disables optional terminal extras canonically', () => {
  withEnv('REAL_E2E_TERMINAL_EXTRAS', '0', () => {
    const progress = buildProgress({ projectName: 'unit-no-terminal-extras' });
    const config = buildRunConfig({
      runId: 'real-e2e-unit-no-terminal-extras',
      worktreePath: '/tmp/real-e2e-unit-no-terminal-extras/worktree',
      scenarioId: 'retry-budget-exhausted',
    });

    assert.equal(progress.pipeline_review, undefined);
    assert.equal(config.case_study.enabled, false);
  });
});

test('module execution boundary disables terminal extras without env override', () => {
  withEnv('REAL_E2E_TERMINAL_EXTRAS', undefined, () => withEnv('REAL_E2E_EXECUTION_BOUNDARY', 'modules', () => {
    const progress = buildProgress({ projectName: 'unit-module-boundary-terminal-extras' });
    const config = buildRunConfig({
      runId: 'real-e2e-unit-module-boundary-terminal-extras',
      worktreePath: '/tmp/real-e2e-unit-module-boundary-terminal-extras/worktree',
      scenarioId: 'retry-fix-malformed-output',
    });

    assert.equal(progress.pipeline_review, undefined);
    assert.equal(config.case_study.enabled, false);
    assert.equal(config.pipeline_review.enabled, false);
  }));
});

test('final-review execution boundary keeps summary scope without optional terminal extras', () => {
  withEnv('REAL_E2E_TERMINAL_EXTRAS', undefined, () => withEnv('REAL_E2E_EXECUTION_BOUNDARY', 'final-review', () => {
    const progress = buildProgress({ projectName: 'unit-final-review-boundary-terminal-extras' });
    const config = buildRunConfig({
      runId: 'real-e2e-unit-final-review-boundary-terminal-extras',
      worktreePath: '/tmp/real-e2e-unit-final-review-boundary-terminal-extras/worktree',
      scenarioId: 'crash-after-final-review-before-summary',
    });

    assert.deepEqual(progress.execution_order, [
      '01-nginx',
      '02-nginx',
      '03-nginx',
      '04-nginx',
      'gate:module-review',
      'gate:operator-approval',
      'gate:final-buster',
      'gate:final-review',
    ]);
    assert.equal(progress.real_e2e.execution_boundary, 'final-review');
    assert.equal(progress.pipeline_review, undefined);
    assert.equal(config.case_study.enabled, false);
    assert.equal(config.pipeline_review.enabled, false);
  }));
});

test('scenario module scope keeps module retry cases to the exercised module', () => {
  withEnv('REAL_E2E_EXECUTION_BOUNDARY', 'modules', () => {
    const { progress } = applyRealE2EScenario(
      normalizeRealE2ERuntimeDefaults(buildProgress({
        projectName: 'unit-scenario-module-scope',
        moduleIds: ['01-nginx', '02-nginx', '03-nginx', '04-nginx'],
      }), { scenarioId: 'retry-fix-malformed-output' }),
      'retry-fix-malformed-output',
    );

    assert.deepEqual(Object.keys(progress.modules), ['01-nginx']);
    assert.deepEqual(progress.real_e2e.module_scope, ['01-nginx']);
    assert.deepEqual(progress.execution_order, ['01-nginx']);
    assert.equal(progress.arch_validation.enabled, false);
    assert.equal(progress.arch_validation.agent_enabled, false);
    assert.deepEqual(progress.gates['module-review'].contract.module_ids, ['01-nginx']);
    assert.equal(progress.gates['final-buster'].test_config?.unit, undefined);
  });
});

test('architecture validator scenario keeps its owned phase enabled at a module boundary', () => {
  withEnv('REAL_E2E_EXECUTION_BOUNDARY', 'modules', () => {
    const progress = normalizeRealE2ERuntimeDefaults(buildProgress({
      projectName: 'unit-architecture-validator-boundary',
    }), { scenarioId: 'architecture-validator-block' });

    assert.equal(progress.arch_validation.enabled, true);
    assert.equal(progress.arch_validation.agent_enabled, true);
  });
});

test('scenario module scope preserves the full graph for graph-owned scenarios', () => {
  withEnv('REAL_E2E_EXECUTION_BOUNDARY', 'modules', () => {
    const { progress } = applyRealE2EScenario(
      normalizeRealE2ERuntimeDefaults(buildProgress({
        projectName: 'unit-scenario-full-graph-scope',
        moduleIds: ['01-nginx', '02-nginx', '03-nginx', '04-nginx'],
      }), { scenarioId: 'multi-module-independent-success' }),
      'multi-module-independent-success',
    );

    assert.deepEqual(Object.keys(progress.modules), ['01-nginx', '02-nginx', '03-nginx', '04-nginx']);
    assert.deepEqual(progress.real_e2e.module_scope, ['01-nginx', '02-nginx', '03-nginx', '04-nginx']);
    assert.deepEqual(progress.execution_order, ['01-nginx', '02-nginx', '03-nginx', '04-nginx']);
    assert.equal(progress.gates['final-buster'].test_config?.unit, undefined);
  });
});

test('module-review boundary stops after scoped module review gate', () => {
  withEnv('REAL_E2E_EXECUTION_BOUNDARY', 'module-review', () => {
    const { progress } = applyRealE2EScenario(
      normalizeRealE2ERuntimeDefaults(buildProgress({
        projectName: 'unit-module-review-scope',
        moduleIds: ['01-nginx', '02-nginx', '03-nginx', '04-nginx'],
      }), { scenarioId: 'retry-buster-pass-echo-rejects' }),
      'retry-buster-pass-echo-rejects',
    );

    assert.deepEqual(Object.keys(progress.modules), ['01-nginx']);
    assert.deepEqual(progress.execution_order, ['01-nginx', 'gate:module-review']);
    assert.equal(progress.pipeline_review, undefined);
    assert.match(progress.architecture_intent.module_graph, /complete module set/);
    assert.doesNotMatch(progress.architecture_intent.module_graph, /Four modules/);
    assert.deepEqual(progress.contracts.runtime_config.static_serving.surfaces, []);
  });
});

test('final-buster boundary stops after scoped final Buster gate', () => {
  withEnv('REAL_E2E_EXECUTION_BOUNDARY', 'final-buster', () => {
    const progress = normalizeRealE2ERuntimeDefaults(buildProgress({
      projectName: 'unit-final-buster-scope',
      moduleIds: ['01-nginx', '02-nginx', '03-nginx', '04-nginx'],
    }), { scenarioId: 'buster-gate-failure' });

    assert.deepEqual(Object.keys(progress.modules), ['01-nginx']);
    assert.deepEqual(progress.execution_order, ['01-nginx', 'gate:final-buster']);
    assert.equal(progress.pipeline_review, undefined);
  });
});

test('run config runtime normalization refreshes terminal generator models', () => {
  withEnv('REAL_E2E_TERMINAL_EXTRAS', undefined, () => withEnv('REAL_E2E_EXECUTION_BOUNDARY', 'full', () => {
    const config = normalizeRealE2ERunConfigDefaults({
      fallback_model: 'gpt-5.5',
      case_study: {
        enabled: true,
        model: 'gpt-5.5',
        thinking_level: 'medium',
        agent_id: 'codex',
        output_file: 'stale.md',
        timeout_minutes: 99,
      },
      pipeline_review: {
        enabled: true,
        model: 'gpt-5.5',
        thinking_level: 'medium',
        agent_id: 'codex',
        output_file: 'stale-review.md',
        json_output_file: 'stale-review.json',
        timeout_minutes: 99,
      },
    });

    assert.equal(config.fallback_model, 'openai/gpt-5.3-codex-spark');
    assert.equal(config.case_study.enabled, true);
    assert.equal(config.case_study.model, 'openai/gpt-5.3-codex-spark');
    assert.equal(config.case_study.thinking_level, 'none');
    assert.equal(config.case_study.output_file, '.swarm/artifacts/v2/reports/case-study.md');
    assert.equal(config.case_study.timeout_minutes, 30);
    assert.equal(config.pipeline_review.enabled, true);
    assert.equal(config.pipeline_review.model, 'openai/gpt-5.3-codex-spark');
    assert.equal(config.pipeline_review.thinking_level, 'none');
    assert.equal(config.pipeline_review.output_file, '.swarm/artifacts/v2/reports/pipeline-review.md');
    assert.equal(config.pipeline_review.json_output_file, '.swarm/artifacts/v2/reports/pipeline-review.json');
    assert.equal(config.pipeline_review.timeout_minutes, 10);
  }));
});

test('pipeline review timeout scenario uses run config as the only pipeline review authority', () => {
  const { progress } = applyRealE2EScenario(
    buildProgress({ projectName: 'unit-pipeline-review-timeout' }),
    'pipeline-review-timeout',
  );
  const config = buildRunConfig({
    runId: 'run-unit-pipeline-review-timeout',
    worktreePath: REPO_ROOT,
    scenarioId: 'pipeline-review-timeout',
  });

  assert.equal(progress.pipeline_review, undefined);
  assert.equal(config.pipeline_review.timeout_minutes, 0.001);
});

test('suite execution boundary narrows generated progress order canonically', () => {
  withEnv('REAL_E2E_EXECUTION_BOUNDARY', 'modules', () => {
    const progress = buildProgress({ projectName: 'unit-suite-boundary' });
    assert.deepEqual(progress.execution_order, ['01-nginx', '02-nginx', '03-nginx', '04-nginx']);
    assert.equal(progress.real_e2e.execution_boundary, 'modules');
  });

  withEnv('REAL_E2E_EXECUTION_BOUNDARY', 'module-review', () => {
    const progress = buildProgress({ projectName: 'unit-suite-boundary-review' });
    assert.deepEqual(progress.execution_order, ['01-nginx', '02-nginx', '03-nginx', '04-nginx', 'gate:module-review']);
    assert.equal(progress.real_e2e.execution_boundary, 'module-review');
  });

  withEnv('REAL_E2E_EXECUTION_BOUNDARY', 'final-review', () => {
    const progress = buildProgress({ projectName: 'unit-suite-boundary-final-review' });
    assert.deepEqual(progress.execution_order, [
      '01-nginx',
      '02-nginx',
      '03-nginx',
      '04-nginx',
      'gate:module-review',
      'gate:operator-approval',
      'gate:final-buster',
      'gate:final-review',
    ]);
    assert.equal(progress.real_e2e.execution_boundary, 'final-review');
  });
});

test('generated real e2e seed declares intentional minimal fixture architecture', () => {
  const progress = buildProgress({ projectName: 'unit-architecture-intent' });

  assert.deepEqual(Object.keys(progress.modules), ['01-nginx', '02-nginx', '03-nginx', '04-nginx']);
  assert.deepEqual(progress.execution_order.slice(0, 4), ['01-nginx', '02-nginx', '03-nginx', '04-nginx']);
  assert.equal(progress.architecture_intent.kind, 'intentional_minimal_pipeline_fixture');
  assert.match(progress.architecture_intent.module_graph, /01 provides a shared runtime foundation/);
  assert.match(progress.architecture_intent.module_graph, /02 and 03 exercise parallel isolated branches/);
  assert.match(progress.architecture_intent.module_graph, /04 exercises join\/release assembly/);
  assert.match(progress.architecture_intent.release_boundary, /Module 04 intentionally owns both static app composition and deployment packaging/);
  assert.match(progress.architecture_intent.non_goal, /not modeling an independently evolving product domain/);
  assert.equal(progress.notes.some((note) => note.includes('intentional test topology')), true);
});

test('generated real e2e seed declares explicit static serving contracts', () => {
  const progress = buildProgress({ projectName: 'unit-static-serving', moduleIds: ['01-nginx', '02-nginx', '03-nginx', '04-nginx'] });
  const staticServing = progress.contracts.runtime_config.static_serving;

  assert.equal(staticServing.web_root, 'src');
  assert.equal(staticServing.sentinel_text, 'REAL_E2E_NGINX_OK');
  assert.deepEqual(staticServing.surfaces.map((surface) => surface.served_as), [
    '/content/branch-a.html',
    '/assets/branch-b.css',
  ]);
  assert.equal(JSON.stringify(progress.modules).includes('health_path'), false);
  assert.equal(JSON.stringify(progress.modules).includes('smoke_paths'), false);
  assert.equal(progress.modules['01-nginx'].agent_judgment.required, true);
  assert.equal(progress.modules['01-nginx'].agent_judgment.reason, 'foundation_module_requires_buster_agent_judgment');
  assert.equal(progress.modules['02-nginx'].agent_judgment.required, false);
  assert.equal(progress.modules['02-nginx'].agent_judgment.reason, 'seed_leaf_modules_use_deterministic_suite_authority');
  assert.equal(progress.modules['03-nginx'].max_fails, 3);
  assert.equal(progress.modules['03-nginx'].auto_retry_threshold, 2);
});

test('real e2e model preflight permits only the canonical Spark model', () => {
  assert.equal(
    validateRealE2EModel('openai/gpt-5.3-codex-spark'),
    'openai/gpt-5.3-codex-spark',
  );
  assert.throws(() => validateRealE2EModel('gpt-4.1'), /REAL_E2E_MODEL_MUST_BE_SPARK/);
  assert.throws(
    () => validateRealE2EModel('openai/gpt-4.1/xhigh'),
    /REAL_E2E_MODEL_MUST_BE_SPARK/,
  );
});

test('generated real e2e module and Buster gate use bounded internal timeouts', () => {
  const progress = buildProgress({
    projectName: 'unit-timeout-defaults',
    moduleIds: ['01-nginx', '02-nginx', '03-nginx', '04-nginx'],
  });

  assert.equal(progress.modules['01-nginx'].timeout_minutes, 10);
  assert.equal(progress.modules['02-nginx'].timeout_minutes, 10);
  assert.equal(progress.gates['final-buster'].timeout_minutes, 10);
  assert.equal(progress.gates['module-review'].timeout_minutes, 15);
  assert.equal(progress.gates['final-review'].timeout_minutes, 20);
  assert.equal(progress.pipeline_review, undefined);
});

test('checkpoint restore normalization refreshes harness-owned runtime defaults before scenario overrides', () => {
  const progress = buildProgress({
    projectName: 'unit-stale-checkpoint-defaults',
    moduleIds: ['01-nginx', '02-nginx', '03-nginx', '04-nginx'],
  });
  progress.defaults.models.forge = 'gpt-4.1';
  progress.defaults.thinking.forge = 'low';
  progress.modules['01-nginx'].timeout_minutes = 6;
  progress.modules['02-nginx'].timeout_minutes = 3;
  progress.modules['03-nginx'].timeout_minutes = 3;
  progress.modules['04-nginx'].timeout_minutes = 3;
  progress.modules['02-nginx'].thinking_level = 'low';
  progress.gates['final-buster'].timeout_minutes = 3;
  progress.gates['final-buster'].model = 'gpt-4.1';
  progress.pipeline_review = { timeout_minutes: 3 };

  const normalized = normalizeRealE2ERuntimeDefaults(progress);

  assert.equal(normalized.defaults.models.forge, 'openai/gpt-5.3-codex-spark');
  assert.equal(normalized.defaults.thinking.forge, 'none');
  assert.equal(normalized.modules['01-nginx'].timeout_minutes, 10);
  assert.equal(normalized.modules['02-nginx'].timeout_minutes, 10);
  assert.equal(normalized.modules['03-nginx'].timeout_minutes, 10);
  assert.equal(normalized.modules['04-nginx'].timeout_minutes, 10);
  assert.equal(normalized.modules['02-nginx'].thinking_level, 'none');
  assert.equal(normalized.gates['final-buster'].timeout_minutes, 10);
  assert.equal(normalized.gates['final-buster'].model, 'openai/gpt-5.3-codex-spark');
  assert.equal(normalized.pipeline_review, undefined);

  const { progress: scenarioProgress } = applyRealE2EScenario(normalized, 'forge-timeout');
  assert.equal(scenarioProgress.modules['01-nginx'].timeout_minutes, 0.001);
});

function approvalTimeoutPolicyForScenario(scenarioId) {
  const base = buildProgress({ projectName: `unit-${scenarioId}` });
  const { progress } = applyRealE2EScenario(base, scenarioId);
  return progress.gates?.['operator-approval']?.on_timeout;
}

test('generated approval gate config uses production lowercase timeout policy', () => {
  assert.equal(approvalTimeoutPolicyForScenario('success'), 'block');
});

test('approval timeout scenarios preserve production lowercase timeout policy', () => {
  assert.equal(approvalTimeoutPolicyForScenario('approval-timeout-block'), 'block');
});

test('approval behavior scenarios exercise operator gate before any Forge module', () => {
  for (const scenarioId of ['approval-deny', 'approval-timeout-block']) {
    const base = buildProgress({ projectName: `unit-${scenarioId}` });
    const { progress } = applyRealE2EScenario(base, scenarioId);

    assert.equal(progress.execution_order[0], 'gate:operator-approval', scenarioId);
    assert.equal(progress.execution_order.includes('01-nginx'), true, scenarioId);
    assert.equal(progress.execution_order.indexOf('gate:operator-approval') < progress.execution_order.indexOf('01-nginx'), true, scenarioId);
    assert.equal(progress.real_e2e.approval_before_modules, true, scenarioId);
    assert.equal(progress.evidence.require_discord_delivery_receipt, true, scenarioId);
  }
});

test('retry-buster-pass-echo-rejects keeps canonical echo reviewer configured', () => {
  const base = buildProgress({ projectName: 'unit-retry-buster-pass-echo-rejects' });
  const { progress } = applyRealE2EScenario(base, 'retry-buster-pass-echo-rejects');
  const gate = progress.gates['module-review'];

  assert.equal(gate.primary_reviewer, 'echo-codex');
  assert.equal(gate.instructions_file, 'echo-review/MODULE-REVIEW-REJECT-INSTRUCTIONS.md');
  assert.equal(gate.output_file, 'logs/echo-review/MODULE-REVIEW.json');
  assert.notEqual(gate.reviewers?.length, 0);
});

test('retry-buster-pass-echo-rejects materializes canonical swarm review instructions', async () => {
  let workspace = null;
  try {
    workspace = await createRealE2ERunWorkspace({ scenarioId: 'retry-buster-pass-echo-rejects' });
    const instructions = fs.readFileSync(
      path.join(workspace.swarmDir, 'echo-review', 'MODULE-REVIEW-REJECT-INSTRUCTIONS.md'),
      'utf8',
    );
    const architecture = fs.readFileSync(path.join(workspace.swarmDir, 'ARCHITECTURE.md'), 'utf8');

    assert.match(instructions, /canonical retry-buster-pass-echo-rejects fixture/);
    assert.match(architecture, /complete for this scenario/);
    assert.doesNotMatch(architecture, /modules 02 and 03|module 04|four-module/i);
  } finally {
    if (workspace) await cleanupRealE2ERunWorkspace(workspace);
  }
});

test('retry malformed-output scenarios use a one-shot command fault without restoring legacy unit', () => {
  const scenarioId = 'retry-fix-malformed-output';
  const base = buildProgress({ projectName: `unit-${scenarioId}` });
  const { progress } = applyRealE2EScenario(base, scenarioId);
  const commandSuite = progress.modules['01-nginx'].real_e2e_command_suites[0];

  assert.equal(progress.modules['01-nginx'].max_fails, 3);
  assert.equal(progress.modules['01-nginx'].auto_retry_threshold, 1);
  assert.deepEqual(commandSuite, { kind: 'fail-once', suite: 'retry-fixture' });
  assert.equal(progress.modules['01-nginx'].test_suites.includes('unit'), false);
  assert.equal(progress.modules['01-nginx'].test_config.unit, undefined);
});

test('Buster gate failure configures a remaining legacy API failure', () => {
  const base = buildProgress({ projectName: 'unit-buster-gate-failure' });
  const { progress } = applyRealE2EScenario(base, 'buster-gate-failure');
  const api = progress.gates['final-buster'].test_config.api;

  assert.match(api.spec_file, /real-e2e-expected-buster-gate-failure\.json/);
  assert.equal(progress.gates['final-buster'].test_config.unit, undefined);
});

test('namespace lease denied scenario preserves intentional invalid prefix through final Buster', async () => {
  const base = buildProgress({ projectName: 'unit-namespace-lease-denied' });
  const { progress } = applyRealE2EScenario(base, 'namespace-lease-denied');
  assert.equal(progress.real_e2e.kubernetes_fixture.namespace_prefix, 'prod');

  let workspace = null;
  try {
    workspace = await createRealE2ERunWorkspace({ scenarioId: 'namespace-lease-denied' });
    const generatedProgress = JSON.parse(fs.readFileSync(path.join(workspace.swarmDir, 'progress.json'), 'utf8'));
    const contract = JSON.parse(fs.readFileSync(path.join(workspace.swarmDir, 'real-e2e-scenario-contract.json'), 'utf8'));

    assert.equal(generatedProgress.real_e2e.kubernetes_fixture.namespace_prefix, 'prod');
    assert.equal(contract.scenario_id, 'namespace-lease-denied');
    assert.equal(contract.intentional_fixture.owner, 'final-buster');
    assert.equal(contract.intentional_fixture.intent, 'namespace_safety_rejection');
    assert.deepEqual(contract.intentional_fixture.preserve, ['real_e2e.kubernetes_fixture.namespace_prefix']);
  } finally {
    if (workspace) await cleanupRealE2ERunWorkspace(workspace);
  }
});

test('scenario setup preflight rejects drift before pipeline execution', () => {
  const base = buildProgress({ projectName: 'unit-namespace-lease-denied-drift' });
  const { progress } = applyRealE2EScenario(base, 'namespace-lease-denied');
  progress.real_e2e.kubernetes_fixture.namespace_prefix = 'test';

  assert.throws(
    () => validateRealE2EScenarioSetup({
      progress,
      config: {},
      projectSrc: SCRIPT_DIR,
      scenarioId: 'namespace-lease-denied',
    }),
    (error) => {
      assert.equal(error.message, 'real E2E scenario setup contract failed for namespace-lease-denied');
      assert.deepEqual(error.failures, [{
        field: 'real_e2e.kubernetes_fixture.namespace_prefix',
        expected: 'prod',
        actual: 'test',
      }]);
      return true;
    },
  );
});

test('scenario setup preflight validates swarm-owned fixture files under swarm dir', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'real-e2e-swarm-setup-contract-'));
  const projectSrc = path.join(root, 'src');
  const swarmDir = path.join(projectSrc, '.swarm');
  fs.mkdirSync(swarmDir, { recursive: true });
  const base = buildProgress({ projectName: 'unit-retry-buster-pass-echo-rejects' });
  const { progress } = applyRealE2EScenario(base, 'retry-buster-pass-echo-rejects');

  assert.throws(
    () => validateRealE2EScenarioSetup({
      progress,
      config: {},
      projectSrc,
      swarmDir,
      scenarioId: 'retry-buster-pass-echo-rejects',
    }),
    (error) => {
      assert.equal(error.message, 'real E2E scenario setup contract failed for retry-buster-pass-echo-rejects');
      assert.deepEqual(error.failures, [{
        field: 'swarm_file:echo-review/MODULE-REVIEW-REJECT-INSTRUCTIONS.md',
        expected_line: 'This is the canonical retry-buster-pass-echo-rejects fixture: return status "FAIL" with at least one critical issue after confirming the module retry recovered and reached module review.',
        actual: null,
      }]);
      return true;
    },
  );
});

test('k8s pod never ready scenario preserves intentional readiness failure through review', async () => {
  let workspace = null;
  try {
    workspace = await createRealE2ERunWorkspace({ scenarioId: 'k8s-pod-never-ready' });
    const manifest = fs.readFileSync(path.join(workspace.projectSrc, 'k8s', 'deployment.yaml'), 'utf8');
    const contract = JSON.parse(fs.readFileSync(path.join(workspace.swarmDir, 'real-e2e-scenario-contract.json'), 'utf8'));

    assert.match(manifest, /readinessProbe:\s+exec:\s+command: \["\/bin\/sh", "-c", "exit 1"\]/s);
    assert.equal(contract.scenario_id, 'k8s-pod-never-ready');
    assert.equal(contract.intentional_fixture.intent, 'pod_readiness_timeout');
    assert.deepEqual(contract.intentional_fixture.evidence, ['readinessProbe.exec.command=/bin/sh -c exit 1']);
  } finally {
    if (workspace) await cleanupRealE2ERunWorkspace(workspace);
  }
});

test('Kubernetes fixture policy scenario uses a denied namespace prefix', async () => {
  let workspace = null;
  try {
    workspace = await createRealE2ERunWorkspace({ scenarioId: 'k8s-context-invalid' });
    const progress = JSON.parse(fs.readFileSync(path.join(workspace.swarmDir, 'progress.json'), 'utf8'));
    assert.equal(progress.real_e2e.kubernetes_fixture.namespace_prefix, 'prod');
    assert.equal(progress.real_e2e.intentional_config_failure.error_code, 'KUBERNETES_FIXTURE_NAMESPACE_PREFIX_DENIED');
    assert.equal(fs.existsSync(path.join(workspace.projectSrc, '.real-e2e-invalid-kubeconfig')), false);
  } finally {
    if (workspace) await cleanupRealE2ERunWorkspace(workspace);
  }
});

test('registry pull failure targets the executed Kubernetes fixture image', async () => {
  const base = buildProgress({ projectName: 'unit-registry-pull-failure' });
  const { progress } = applyRealE2EScenario(base, 'registry-pull-failure');
  assert.match(progress.real_e2e.kubernetes_fixture.image.reference, /real-e2e-intentional-missing@sha256:f{64}$/u);

  let workspace = null;
  try {
    workspace = await createRealE2ERunWorkspace({ scenarioId: 'registry-pull-failure' });
    const dockerfile = fs.readFileSync(path.join(workspace.projectSrc, 'Dockerfile'), 'utf8');
    const manifest = fs.readFileSync(path.join(workspace.projectSrc, 'k8s', 'deployment.yaml'), 'utf8');
    const generatedProgress = JSON.parse(fs.readFileSync(path.join(workspace.swarmDir, 'progress.json'), 'utf8'));

    assert.doesNotMatch(dockerfile, /real-e2e-intentional-missing-base/);
    assert.match(manifest, /real-e2e-intentional-missing@sha256:f{64}/u);
    assert.match(generatedProgress.real_e2e.kubernetes_fixture.image.reference, /real-e2e-intentional-missing@sha256:f{64}$/u);
  } finally {
    if (workspace) await cleanupRealE2ERunWorkspace(workspace);
  }
});

test('multi-module instructions declare distinct module-owned surfaces', async () => {
  let workspace = null;
  try {
    workspace = await createRealE2ERunWorkspace({ scenarioId: 'multi-module-independent-success' });
    const forge = fs.readFileSync(path.join(workspace.swarmDir, 'modules', '02-nginx', 'FORGE.md'), 'utf8');
    const foundation = fs.readFileSync(path.join(workspace.swarmDir, 'modules', '01-nginx', 'FORGE.md'), 'utf8');
    const integration = fs.readFileSync(path.join(workspace.swarmDir, 'modules', '04-nginx', 'FORGE.md'), 'utf8');
    assert.match(forge, /`src\/content\/branch-a\.html`/);
    assert.match(forge, /`\.swarm\/contracts\/module-outputs\/02-content\.json`/);
    assert.doesNotMatch(forge, /`Dockerfile`/);
    assert.match(foundation, /Own only `nginx\/default\.conf`/);
    assert.match(forge, /Consume the foundation through `\.swarm\/contracts\/runtime-config\.json`/);
    assert.match(forge, /not by treating module 01 packaging as an interface/);
    assert.match(integration, /`src\/index\.html`/);
    assert.match(integration, /`k8s\/deployment\.yaml`/);
    assert.match(integration, /app_composition/);
    assert.match(integration, /deployment_packaging/);
  } finally {
    if (workspace) await cleanupRealE2ERunWorkspace(workspace);
  }
});

test('success seed uses a four-module DAG with sequential and parallel module work', async () => {
  let workspace = null;
  try {
    workspace = await createRealE2ERunWorkspace({ scenarioId: 'success' });
    const progress = JSON.parse(fs.readFileSync(path.join(workspace.swarmDir, 'progress.json'), 'utf8'));

    assert.deepEqual(Object.keys(progress.modules), ['01-nginx', '02-nginx', '03-nginx', '04-nginx']);
    assert.deepEqual(progress.modules['01-nginx'].depends_on, []);
    assert.deepEqual(progress.modules['02-nginx'].depends_on, ['01-nginx']);
    assert.deepEqual(progress.modules['03-nginx'].depends_on, ['01-nginx']);
    assert.deepEqual(progress.modules['04-nginx'].depends_on, ['01-nginx', '02-nginx', '03-nginx']);
    assert.deepEqual(progress.execution_order.slice(0, 4), ['01-nginx', '02-nginx', '03-nginx', '04-nginx']);
    assert.deepEqual(progress.gates['module-review'].contract.module_ids, ['01-nginx', '02-nginx', '03-nginx', '04-nginx']);
    assert.equal(progress.modules['01-nginx'].agent_judgment.required, true);
    assert.equal(progress.modules['01-nginx'].agent_judgment.reason, 'foundation_module_requires_buster_agent_judgment');
    assert.equal(progress.modules['02-nginx'].agent_judgment.required, false);
    assert.equal(progress.modules['02-nginx'].agent_judgment.reason, 'seed_leaf_modules_use_deterministic_suite_authority');
    assert.equal(progress.modules['03-nginx'].max_fails, 3);
    assert.equal(progress.modules['03-nginx'].auto_retry_threshold, 2);
    assert.deepEqual(progress.modules['01-nginx'].owned_paths, ['nginx/default.conf']);
    assert.deepEqual(progress.modules['04-nginx'].owned_paths, ['Dockerfile', 'src/index.html', 'src/integration/module-map.json', 'k8s/deployment.yaml']);
    assert.equal(progress.modules['01-nginx'].test_config.serve.dockerfile.endsWith('/Dockerfile'), true);
    assert.equal(progress.modules['02-nginx'].test_config.serve.dockerfile.endsWith('/Dockerfile'), true);
    assert.equal(progress.modules['03-nginx'].test_config.serve.dockerfile.endsWith('/Dockerfile'), true);
    assert.deepEqual(progress.contracts.module_outputs['02-nginx'].consumes, ['.swarm/contracts/module-outputs/01-foundation.json']);
    assert.deepEqual(progress.contracts.module_outputs['03-nginx'].consumes, ['.swarm/contracts/module-outputs/01-foundation.json']);
    assert.deepEqual(progress.contracts.module_outputs['01-nginx'].provides, ['foundation-runtime-static-serving.v2']);
    assert.deepEqual(progress.contracts.module_outputs['02-nginx'].consumed_surfaces, ['foundation-runtime-static-serving.v2']);
    assert.deepEqual(progress.contracts.module_outputs['02-nginx'].provides, ['branch-a-static-content.v2']);
    assert.deepEqual(progress.contracts.module_outputs['02-nginx'].provided_surfaces, ['src/content/branch-a.html']);
    assert.deepEqual(progress.contracts.module_outputs['03-nginx'].provides, ['branch-b-static-asset.v2']);
    assert.deepEqual(progress.contracts.module_outputs['03-nginx'].provided_surfaces, ['src/assets/branch-b.css']);
    assert.deepEqual(progress.contracts.module_outputs['04-nginx'].consumed_surfaces, [
      'foundation-runtime-static-serving.v2',
      'src/content/branch-a.html',
      'src/assets/branch-b.css',
    ]);
    assert.deepEqual(progress.contracts.module_outputs['04-nginx'].contract_boundaries, [
      'image_packaging: Dockerfile copies foundation config and assembled static source into nginx',
      'app_composition: src/index.html + src/integration/module-map.json',
      'deployment_packaging: k8s/deployment.yaml',
    ]);
  } finally {
    if (workspace) await cleanupRealE2ERunWorkspace(workspace);
  }
});

test('expected-failure scenarios use the smallest canonical module scope', async () => {
  let workspace = null;
  try {
    workspace = await createRealE2ERunWorkspace({ scenarioId: 'approval-deny' });
    const progress = JSON.parse(fs.readFileSync(path.join(workspace.swarmDir, 'progress.json'), 'utf8'));

    assert.deepEqual(Object.keys(progress.modules), ['01-nginx']);
    assert.deepEqual(progress.real_e2e.module_scope, ['01-nginx']);
    assert.deepEqual(progress.execution_order, [
      'gate:operator-approval',
      '01-nginx',
      'gate:module-review',
      'gate:final-buster',
      'gate:final-review',
    ]);
    assert.deepEqual(progress.gates['module-review'].contract.module_ids, ['01-nginx']);
    assert.equal(progress.contracts.deployable_artifact.release_candidate_module, '01-nginx');
  } finally {
    if (workspace) await cleanupRealE2ERunWorkspace(workspace);
  }
});

test('generated real e2e run config excludes the deleted Buster queue contract', async () => {
  let workspace = null;
  try {
    workspace = await createRealE2ERunWorkspace({ scenarioId: 'success' });
    const config = JSON.parse(fs.readFileSync(workspace.runConfigPath, 'utf8'));

    assert.equal(config.pre_check.lint_report_path, '/app/skills/pipeline/tools/lint-report.ts');
    assert.equal(config.fallback_model, 'openai/gpt-5.3-codex-spark');
    assert.equal(config.agents.buster.redis_js_path, undefined);
    assert.equal(config.agents.buster.dispatch, undefined);
    assert.equal(config.buster.runtime.task_stream, undefined);
  } finally {
    if (workspace) await cleanupRealE2ERunWorkspace(workspace);
  }
});

test('generated nginx fixture keeps the reproducible run id placeholder', async () => {
  let workspace = null;
  try {
    workspace = await createRealE2ERunWorkspace({ scenarioId: 'success' });
    const html = fs.readFileSync(path.join(workspace.projectSrc, 'src', 'index.html'), 'utf8');

    assert.match(html, /<p id="run-id">REAL_E2E_RUN_ID_PLACEHOLDER<\/p>/);
    assert.doesNotMatch(html, /<p id="run-id">real-pipeline-e2e-[^<]+<\/p>/);
  } finally {
    if (workspace) await cleanupRealE2ERunWorkspace(workspace);
  }
});

test('generated review contract assigns Kubernetes fixture authority to final Buster', async () => {
  let workspace = null;
  try {
    workspace = await createRealE2ERunWorkspace({ scenarioId: 'success' });
    const architecture = fs.readFileSync(path.join(workspace.swarmDir, 'ARCHITECTURE.md'), 'utf8');
    const moduleReview = fs.readFileSync(path.join(workspace.swarmDir, 'echo-review', 'MODULE-REVIEW-INSTRUCTIONS.md'), 'utf8');
    const pipelineReview = fs.readFileSync(path.join(workspace.swarmDir, 'pipeline-review', 'PIPELINE-REVIEW-INSTRUCTIONS.md'), 'utf8');
    const finalBuster = fs.readFileSync(path.join(workspace.swarmDir, 'buster-test', 'FINAL-BUSTER.md'), 'utf8');
    const foundationForge = fs.readFileSync(path.join(workspace.swarmDir, 'modules', '01-nginx', 'FORGE.md'), 'utf8');
    const foundationBuster = fs.readFileSync(path.join(workspace.swarmDir, 'modules', '01-nginx', 'BUSTER.md'), 'utf8');
    const secondaryForge = fs.readFileSync(path.join(workspace.swarmDir, 'modules', '02-nginx', 'FORGE.md'), 'utf8');
    const secondaryBuster = fs.readFileSync(path.join(workspace.swarmDir, 'modules', '02-nginx', 'BUSTER.md'), 'utf8');
    const releaseForge = fs.readFileSync(path.join(workspace.swarmDir, 'modules', '04-nginx', 'FORGE.md'), 'utf8');
    const releaseBuster = fs.readFileSync(path.join(workspace.swarmDir, 'modules', '04-nginx', 'BUSTER.md'), 'utf8');
    const manifest = fs.readFileSync(path.join(workspace.projectSrc, 'k8s', 'deployment.yaml'), 'utf8');
    const progress = JSON.parse(fs.readFileSync(path.join(workspace.swarmDir, 'progress.json'), 'utf8'));
    const pipeline = JSON.parse(fs.readFileSync(path.join(workspace.swarmDir, 'pipeline.json'), 'utf8'));
    const finalGate = progress.gates['final-buster'];

    assert.equal(pipeline.gates['final-buster'].tests['api-flow'].uses, 'kubeclaw.api-flow@1');
    assert.equal(pipeline.gates['final-buster'].tests.openapi.uses, 'kubeclaw.openapi@1');
    assert.equal(pipeline.gates['final-buster'].tests['api-flow'].inputs.deployment.from, 'kubernetes-deployment');
    assert.equal(pipeline.gates['final-buster'].tests.openapi.inputs.deployment.from, 'kubernetes-deployment');
    assert.equal(fs.existsSync(path.join(workspace.swarmDir, 'api-flow-success.json')), true);
    assert.equal(fs.existsSync(path.join(workspace.swarmDir, 'openapi-success.json')), true);

    assert.match(architecture, /module manifest stays reusable with only Deployment, Service, and app-owned Secret resources/);
    assert.match(architecture, /Module 01 owns the shared nginx runtime config/);
    assert.match(architecture, /Module 04 owns copying the assembled `src\/` tree into the nginx web root/);
    assert.match(architecture, /Kubernetes fixture waits for pod and Service readiness/);
    assert.match(architecture, /HTTP provider validates app content through the internal Service URL/);
    assert.match(moduleReview, /Do not require static BusterNamespaceLease or Ingress manifests in module source/);
    assert.match(moduleReview, /Kubernetes fixture owns its run-scoped lease/);
    assert.match(moduleReview, /preview suite to use an explicit preview URL/);
    assert.match(moduleReview, /checked_contracts/);
    assert.match(moduleReview, /opened_artifacts/);
    assert.match(moduleReview, /failed_commands/);
    assert.match(moduleReview, /unverified_requirements/);
    assert.match(moduleReview, /PASS is invalid if `failed_commands` or `unverified_requirements` is non-empty/);
    assert.match(pipelineReview, /Do not report benign startup tool failures, transcript compaction notices, or accepted-output session-stop grace expiry/);
    assert.match(foundationBuster, /downstream immutable deployment reference/);
    assert.match(foundationBuster, /deterministic suite results as pre-test evidence only/);
    assert.match(foundationBuster, /foundation module requires Buster agent judgment/);
    assert.match(foundationBuster, /final verdict for this module must come from the Buster agent output/);
    assert.match(foundationForge, /Forge completion artifact must name the inspected owned files/);
    assert.match(foundationForge, /leave them unchanged and write the Forge completion artifact/);
    assert.match(secondaryForge, /Forge completion artifact must name the inspected owned files/);
    assert.match(secondaryForge, /leave them unchanged and write the Forge completion artifact/);
    assert.match(secondaryBuster, /preview infrastructure contracts as references/);
    assert.match(secondaryBuster, /final-preview validation are final-Buster gate owned/);
    assert.match(secondaryBuster, /must not define the preview lease or an Ingress/);
    assert.match(releaseForge, /Preserve the digest-pinned image/);
    assert.match(releaseForge, /`Dockerfile`/);
    assert.match(releaseBuster, /immutable image declared by the deployable artifact contract/);
    assert.match(finalBuster, /Kubernetes fixture creates a run-scoped BusterNamespaceLease/);
    assert.match(finalBuster, /HTTP provider must validate the app through the internal Service URL/);
    assert.match(finalBuster, /Do not ask Forge, Echo, or reusable module manifests to create final-preview lease or Ingress resources/);
    assert.match(finalBuster, /Do not add Role or RoleBinding resources for `pods\/portforward`/);
    assert.equal(finalGate.test_suites, undefined);
    assert.equal(finalGate.test_config, undefined);
    assert.deepEqual(
      Object.keys(pipeline.gates['final-buster'].tests).filter((id) => id.includes('security')),
      ['security-headers', 'dependency-security', 'image-security', 'kubernetes-policy-security', 'kubernetes-runtime-security'],
    );
    assert.equal(pipeline.modules['01-nginx'].suites.unit.uses, 'kubeclaw.unit-suite@1');
    assert.equal(
      pipeline.modules['01-nginx'].suites.unit.add.command.config.executable,
      'npm',
    );
    assert.deepEqual(
      pipeline.modules['01-nginx'].suites.unit.add.command.config.args,
      ['run', 'verify:01-nginx'],
    );
    assert.equal(pipeline.modules['01-nginx'].tests['size-budget-artifact'].uses, 'kubeclaw.direct-command@1');
    assert.equal(pipeline.modules['01-nginx'].tests['size-budget'].uses, 'kubeclaw.size-budget@1');
    assert.deepEqual(pipeline.modules['01-nginx'].tests.health.needs, ['size-budget']);
    assert.equal(pipeline.gates['final-buster'].suites.unit.uses, 'kubeclaw.unit-suite@1');
    assert.equal(pipeline.gates['final-buster'].tests['size-budget-artifact'].uses, 'kubeclaw.direct-command@1');
    assert.equal(pipeline.gates['final-buster'].tests['size-budget'].uses, 'kubeclaw.size-budget@1');
    assert.equal(pipeline.gates['final-buster'].tests['container-build'].uses, 'kubeclaw.container-build@1');
    assert.deepEqual(pipeline.gates['final-buster'].fixtures['kubernetes-deployment'].needs,
      ['size-budget', 'container-build']);
    assert.deepEqual(pipeline.gates['final-buster'].fixtures['kubernetes-deployment'].inputs.image, {
      from: 'container-build', output: 'image',
    });
    assert.equal(pipeline.gates['final-buster'].tests.health.uses, 'kubeclaw.http@1');
    assert.equal(pipeline.gates['final-buster'].tests.health.inputs.deployment.from, 'kubernetes-deployment');
    assert.equal(pipeline.gates['final-buster'].fixtures['kubernetes-deployment'].uses, 'kubeclaw.kubernetes-fixture@1');
    assert.equal(pipeline.gates['final-buster'].fixtures['kubernetes-deployment'].config.image, undefined);
    assert.deepEqual(pipeline.lint, {
      uses: 'kubeclaw.lint.full', policyProject: 'workspace',
      rawManifests: [`Projects/${progress.project}/src/k8s/deployment.yaml`], helmCharts: [],
    });
    assert.match(manifest, /name: REDIS_HOST\s+value: redis\.default\.svc\.cluster\.local/u);
    assert.equal(finalGate.contract.preview_infrastructure_ref, 'contracts.preview_infrastructure');
    assert.equal(finalGate.test_config, undefined);
    assert.equal(finalGate.test_suites, undefined);
    assert.equal(pipeline.gates['final-buster'].fixtures['tailscale-exposure'].uses,
      'kubeclaw.tailscale-exposure@1');
    assert.equal(pipeline.gates['final-buster'].tests['public-http-health'].inputs.endpoint.from,
      'tailscale-exposure');
    assert.doesNotMatch(manifest, /kind:\s*Secret/);
    assert.doesNotMatch(manifest, /real-pipeline-e2e-preview-login/);
    assert.doesNotMatch(manifest, /BusterNamespaceLease|kind:\s*Ingress/);
  } finally {
    if (workspace) await cleanupRealE2ERunWorkspace(workspace);
  }
});

test('generated fixture declares canonical artifact, runtime, review, and preview contracts', async () => {
  let workspace = null;
  try {
    workspace = await createRealE2ERunWorkspace({ scenarioId: 'success' });
    const progress = JSON.parse(fs.readFileSync(path.join(workspace.swarmDir, 'progress.json'), 'utf8'));
    const architecture = fs.readFileSync(path.join(workspace.swarmDir, 'ARCHITECTURE.md'), 'utf8');
    const deployableArtifact = JSON.parse(fs.readFileSync(path.join(workspace.swarmDir, 'contracts', 'deployable-artifact.json'), 'utf8'));
    const runtimeConfig = JSON.parse(fs.readFileSync(path.join(workspace.swarmDir, 'contracts', 'runtime-config.json'), 'utf8'));
    const moduleReview = JSON.parse(fs.readFileSync(path.join(workspace.swarmDir, 'contracts', 'module-review.json'), 'utf8'));
    const previewInfrastructure = JSON.parse(fs.readFileSync(path.join(workspace.swarmDir, 'contracts', 'preview-infrastructure.json'), 'utf8'));
    const finalGate = progress.gates['final-buster'];
    const moduleContracts = progress.modules['01-nginx'].contracts;

    assert.deepEqual(progress.contracts.deployable_artifact, deployableArtifact);
    assert.deepEqual(progress.contracts.runtime_config, runtimeConfig);
    assert.deepEqual(progress.contracts.module_review, moduleReview);
    assert.deepEqual(progress.contracts.preview_infrastructure, previewInfrastructure);
    assert.equal(deployableArtifact.artifact_type, 'deployable_artifact_contract');
    assert.equal(deployableArtifact.authority.producer, 'release-candidate-module-buster');
    assert.equal(deployableArtifact.authority.consumer, 'final-buster');
    assert.equal(deployableArtifact.release_candidate_module, '04-nginx');
    assert.match(deployableArtifact.authority.rule, /Only the release_candidate_module Buster owns immutable image verification/);
    assert.match(deployableArtifact.image.reference, /@sha256:[a-f0-9]{64}$/);
    assert.equal(deployableArtifact.runtime_config_ref, '.swarm/contracts/runtime-config.json');
    assert.equal(runtimeConfig.artifact_type, 'runtime_config_contract');
    assert.equal(runtimeConfig.authority.owner, 'application-module');
    assert.equal(runtimeConfig.authority.validator, 'buster-k8s-suite');
    assert.deepEqual(runtimeConfig.env, []);
    assert.deepEqual(runtimeConfig.config_maps, []);
    assert.deepEqual(runtimeConfig.secrets, []);
    assert.equal(runtimeConfig.credentials.requires_login, false);
    assert.deepEqual(runtimeConfig.allowed_app_resources, ['Deployment', 'Service', 'Secret']);
    assert.deepEqual(runtimeConfig.static_serving, {
      web_root: 'src',
      sentinel_text: 'REAL_E2E_NGINX_OK',
      surfaces: [
        {
          producer_module: '02-nginx',
          consumer_module: '04-nginx',
          producer_contract: '.swarm/contracts/module-outputs/02-content.json',
          provided_surface: 'src/content/branch-a.html',
          source_path: 'src/content/branch-a.html',
          served_as: '/content/branch-a.html',
          expected_marker: 'REAL_E2E_BRANCH_A_CONTENT',
        },
        {
          producer_module: '03-nginx',
          consumer_module: '04-nginx',
          producer_contract: '.swarm/contracts/module-outputs/03-assets.json',
          provided_surface: 'src/assets/branch-b.css',
          source_path: 'src/assets/branch-b.css',
          served_as: '/assets/branch-b.css',
          expected_marker: '#real-e2e-content-branch',
        },
      ],
    });
    assert.equal(moduleReview.artifact_type, 'module_review_contract');
    assert.deepEqual(moduleReview.module_ids, ['01-nginx', '02-nginx', '03-nginx', '04-nginx']);
    assert.deepEqual(moduleReview.surfaces.contract_refs, [
      'contracts.deployable_artifact',
      'contracts.runtime_config',
      'contracts.preview_infrastructure',
      '.swarm/contracts/module-outputs/01-foundation.json',
      '.swarm/contracts/module-outputs/02-content.json',
      '.swarm/contracts/module-outputs/03-assets.json',
      '.swarm/contracts/module-outputs/04-integration.json',
    ]);
    assert.deepEqual(moduleReview.surfaces.evidence_refs, [
      '.swarm/logs/modules/01-nginx',
      '.swarm/logs/modules/02-nginx',
      '.swarm/logs/modules/03-nginx',
      '.swarm/logs/modules/04-nginx',
    ]);
    assert.equal(previewInfrastructure.artifact_type, 'preview_infrastructure_contract');
    assert.equal(previewInfrastructure.authority.owner, 'final-buster');
    assert.deepEqual(previewInfrastructure.gate_owned_resources, ['BusterNamespaceLease', 'tailscale-ingress-exposure', 'preview-url', 'cleanup-policy']);
    assert.equal(previewInfrastructure.static_module_preview_resources, 'forbidden');
    assert.deepEqual(moduleContracts, {
      deployable_artifact_ref: 'contracts.deployable_artifact',
      runtime_config_ref: 'contracts.runtime_config',
      module_review_ref: 'contracts.module_review',
      module_output_ref: '.swarm/contracts/module-outputs/01-foundation.json',
    });
    assert.equal(progress.gates['module-review'].contract.module_review_ref, 'contracts.module_review');
    assert.deepEqual(progress.gates['module-review'].contract.module_ids, ['01-nginx', '02-nginx', '03-nginx', '04-nginx']);
    assert.deepEqual(progress.gates['module-review'].contract.reviewed_contract_refs, [
      'contracts.deployable_artifact',
      'contracts.runtime_config',
      'contracts.preview_infrastructure',
    ]);
    assert.deepEqual(finalGate.contract, {
      deployable_artifact_ref: 'contracts.deployable_artifact',
      runtime_config_ref: 'contracts.runtime_config',
      preview_infrastructure_ref: 'contracts.preview_infrastructure',
    });
    assert.match(architecture, /deployable-artifact\.json.*immutable deployment handoff/s);
    assert.match(architecture, /runtime-config\.json.*application runtime and static serving boundary/s);
    assert.match(architecture, /module-review\.json.*Echo review ownership/s);
    assert.match(architecture, /preview-infrastructure\.json.*exposure fixture returns the public URL to the HTTP provider/s);
    assert.match(architecture, /Empty env\/config\/secret lists are valid/);
  } finally {
    if (workspace) await cleanupRealE2ERunWorkspace(workspace);
  }
});

test('real e2e runner auto-approves architecture findings through a separate gate state', () => {
  const runner = fs.readFileSync(path.join(SCRIPT_DIR, 'run-real-pipeline-e2e.mjs'), 'utf8');

  assert.match(runner, /operator-approval-gate-status\.json/);
  assert.match(runner, /architecture-approval-gate-status\.json/);
  assert.match(runner, /REAL_E2E_ARCH_APPROVAL_DECISION/);
  assert.match(runner, /real-e2e-architecture-approval/);
});

test('generated final review does not require post-final-review v2 report artifacts', async () => {
  let workspace = null;
  try {
    workspace = await createRealE2ERunWorkspace({ scenarioId: 'success' });
    const finalReview = fs.readFileSync(path.join(workspace.swarmDir, 'echo-review', 'FINAL-REVIEW-INSTRUCTIONS.md'), 'utf8');

    assert.match(finalReview, /Review the pre-completion run artifacts/);
    assert.match(finalReview, /do not require post-final-review v2 report artifacts/);
    assert.doesNotMatch(finalReview, /logs\/pipeline/);
    assert.doesNotMatch(finalReview, /read model/);
    assert.match(finalReview, /final Buster produced deployment and security evidence/);
  } finally {
    if (workspace) await cleanupRealE2ERunWorkspace(workspace);
  }
});

test('generated final review requires the exact immutable deployment artifact', async () => {
  let workspace = null;
  try {
    workspace = await createRealE2ERunWorkspace({ scenarioId: 'success' });
    const architecture = fs.readFileSync(path.join(workspace.swarmDir, 'ARCHITECTURE.md'), 'utf8');
    const finalReview = fs.readFileSync(path.join(workspace.swarmDir, 'echo-review', 'FINAL-REVIEW-INSTRUCTIONS.md'), 'utf8');
    const finalBuster = fs.readFileSync(path.join(workspace.swarmDir, 'buster-test', 'FINAL-BUSTER.md'), 'utf8');

    assert.match(architecture, /release assembly module Buster owns immutable image verification/);
    assert.match(architecture, /Final Buster deploys that exact image/);
    assert.match(finalReview, /Require final Buster to deploy the exact release assembly module Buster artifact contract/);
    assert.match(finalReview, /Do not accept a separate final-gate rebuild/);
    assert.match(finalReview, /immutable image reference, manifest digest, lease name, namespace, and creation time/);
    assert.match(finalBuster, /Deploy the exact digest-pinned image and checked manifest/);
    assert.match(finalBuster, /Record the immutable image reference, manifest digest, lease name, namespace, and creation time/);
  } finally {
    if (workspace) await cleanupRealE2ERunWorkspace(workspace);
  }
});

test('tailscale exposure unreachable scenario uses an explicit unreachable HTTP target', async () => {
  const base = buildProgress({ projectName: 'unit-tailscale-exposure-url-unreachable' });
  const { progress } = applyRealE2EScenario(base, 'tailscale-exposure-url-unreachable');
  assert.equal(progress.real_e2e.public_http_url_override, 'http://127.0.0.1:1');
  assert.equal(progress.real_e2e.public_http_timeout_ms, 1000);

  let workspace = null;
  try {
    workspace = await createRealE2ERunWorkspace({ scenarioId: 'tailscale-exposure-url-unreachable' });
    const pipeline = JSON.parse(fs.readFileSync(path.join(workspace.swarmDir, 'pipeline.json'), 'utf8'));
    const publicHttp = pipeline.gates['final-buster'].tests['public-http-health'];
    assert.equal(publicHttp.config.url, 'http://127.0.0.1:1');
    assert.equal(publicHttp.config.requestTimeoutMs, 1000);
    assert.equal(publicHttp.inputs, undefined);
  } finally {
    if (workspace) await cleanupRealE2ERunWorkspace(workspace);
  }
});

test('tailscale exposure wrong content scenario changes the public HTTP marker', async () => {
  const base = buildProgress({ projectName: 'unit-tailscale-exposure-wrong-content' });
  const { progress } = applyRealE2EScenario(base, 'tailscale-exposure-wrong-content');
  assert.equal(progress.real_e2e.public_http_expected_text, 'REAL_E2E_EXPECTED_DIFFERENT_DEPLOYMENT_MARKER');

  let workspace = null;
  try {
    workspace = await createRealE2ERunWorkspace({ scenarioId: 'tailscale-exposure-wrong-content' });
    const pipeline = JSON.parse(fs.readFileSync(path.join(workspace.swarmDir, 'pipeline.json'), 'utf8'));
    const publicHttp = pipeline.gates['final-buster'].tests['public-http-health'];
    assert.equal(publicHttp.config.expectedText, 'REAL_E2E_EXPECTED_DIFFERENT_DEPLOYMENT_MARKER');
    assert.equal(publicHttp.inputs.endpoint.from, 'tailscale-exposure');
  } finally {
    if (workspace) await cleanupRealE2ERunWorkspace(workspace);
  }
});

test('buster infra failure declares module-Buster fixture without source mutation', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'real-e2e-buster-infra-contract-'));
  const projectSrc = path.join(root, 'Projects', 'demo', 'src');
  const moduleDir = path.join(projectSrc, '.swarm', 'modules', '01-nginx');
  fs.mkdirSync(moduleDir, { recursive: true });
  fs.writeFileSync(path.join(moduleDir, 'FORGE.md'), 'Verify `Dockerfile` remains coherent.\n');

  applyRealE2EFileScenario({ projectSrc, scenarioId: 'buster-module-infra-failure' });

  const forge = fs.readFileSync(path.join(moduleDir, 'FORGE.md'), 'utf8');
  const contract = JSON.parse(fs.readFileSync(path.join(projectSrc, '.swarm', 'real-e2e-scenario-contract.json'), 'utf8'));
  assert.doesNotMatch(forge, /REAL_E2E_BUSTER_INFRA_UNAVAILABLE/);
  assert.equal(contract.scenario_id, 'buster-module-infra-failure');
  assert.equal(contract.intentional_fixture.owner, 'module-buster');
  assert.deepEqual(contract.intentional_fixture.evidence, ['REAL_E2E_BUSTER_INFRA_UNAVAILABLE']);
  assert.equal(fs.existsSync(path.join(projectSrc, 'REAL_E2E_BUSTER_INFRA_UNAVAILABLE')), false);
});

test('redis unavailable scenario configures production Redis clients directly', () => {
  const unavailable = applyRealE2EConfigScenario({
    telemetry: { enabled: true, stream_max_len: 10 },
    agent_observability: { ingester: { enabled: true } },
  }, 'redis-unavailable');
  assert.equal(unavailable.telemetry.redisHost, '127.0.0.1');
  assert.equal(unavailable.telemetry.redisPort, 1);
  assert.equal(unavailable.agent_observability.ingester.redisHost, '127.0.0.1');
  assert.equal(unavailable.agent_observability.ingester.redisPort, 1);
});

test('architecture branch names are project scoped and remote cleanup guarded', () => {
  assert.equal(
    architectureBranchNameForProject('real-pipeline-e2e-real-e2e-123'),
    'real-pipeline-e2e-real-e2e-123/architecture',
  );
  assert.equal(isSafeE2ERemoteBranchName('real-pipeline-e2e-real-e2e-123/architecture'), true);
  assert.equal(isSafeE2ERemoteBranchName('verification/e2e/success-real-e2e-123'), true);
  assert.equal(isSafeE2ERemoteBranchName('main'), false);
  assert.equal(isSafeE2ERemoteBranchName('feature/not-owned-by-e2e'), false);
  assert.equal(isSafeE2ERemoteBranchName('other-project/architecture'), false);
  assert.equal(isSafeE2ERunBranchName('verification/e2e/success-real-e2e-123'), true);
  assert.equal(isSafeE2ERunBranchName('main'), false);
});

test('architecture seed refuses to commit from non-e2e worktree branches', () => {
  assert.doesNotThrow(() => assertSafeArchitectureSeedBranches({
    worktreeBranch: 'verification/e2e/success-real-e2e-123',
    expectedWorktreeBranch: 'verification/e2e/success-real-e2e-123',
    architectureBranch: 'real-pipeline-e2e-real-e2e-123/architecture',
  }));

  assert.throws(() => assertSafeArchitectureSeedBranches({
    worktreeBranch: 'main',
    expectedWorktreeBranch: 'verification/e2e/success-real-e2e-123',
    architectureBranch: 'real-pipeline-e2e-real-e2e-123/architecture',
  }), /unexpected worktree branch/);

  assert.throws(() => assertSafeArchitectureSeedBranches({
    worktreeBranch: 'verification/e2e/success-real-e2e-123',
    expectedWorktreeBranch: 'verification/e2e/success-real-e2e-123',
    architectureBranch: 'main',
  }), /Unsafe architecture branch/);
});

test('run branch publishing is guarded to generated e2e branches', () => {
  assert.doesNotThrow(() => assertSafeRunBranchPublish({
    branchName: 'verification/e2e/success-real-e2e-123',
  }));

  assert.throws(() => assertSafeRunBranchPublish({
    branchName: 'main',
  }), /Unsafe E2E run branch publish target/);

  assert.throws(() => assertSafeRunBranchPublish({
    branchName: 'real-pipeline-e2e-real-e2e-123/architecture',
  }), /Unsafe E2E run branch publish target/);
});

test('run-scoped origin makes architecture branch fetchable before module release', async () => {
  let workspace = null;
  const originalOrigin = (await execFileAsync('git', ['remote', 'get-url', 'origin'], {
    encoding: 'utf8',
  })).stdout.trim();
  try {
    workspace = await createRealE2ERunWorkspace({ scenarioId: 'buster-module-failure' });
    const workspaceOrigin = (await execFileAsync('git', ['remote', 'get-url', 'origin'], {
      cwd: workspace.worktreePath,
      encoding: 'utf8',
    })).stdout.trim();
    assert.equal(workspaceOrigin, workspace.runOriginPath);
    assert.equal((await execFileAsync('git', ['remote', 'get-url', 'origin'], {
      encoding: 'utf8',
    })).stdout.trim(), originalOrigin);
    await execFileAsync('git', [
      'fetch',
      'origin',
      `refs/heads/${workspace.architectureBranchName}:refs/remotes/origin/${workspace.architectureBranchName}`,
    ], {
      cwd: workspace.worktreePath,
      encoding: 'utf8',
    });
  } finally {
    if (workspace) await cleanupRealE2ERunWorkspace(workspace);
  }
});

test('git push failure scenarios keep setup Git remotes canonical', async () => {
  let workspace = null;
  try {
    workspace = await createRealE2ERunWorkspace({ scenarioId: 'git-credential-failure' });
    const fetchOrigin = (await execFileAsync('git', ['remote', 'get-url', 'origin'], {
      cwd: workspace.worktreePath,
      encoding: 'utf8',
    })).stdout.trim();
    const pushOrigin = (await execFileAsync('git', ['remote', 'get-url', '--push', 'origin'], {
      cwd: workspace.worktreePath,
      encoding: 'utf8',
    })).stdout.trim();

    assert.equal(fetchOrigin, workspace.runOriginPath);
    assert.equal(pushOrigin, workspace.runOriginPath);
    await execFileAsync('git', [
      'fetch',
      'origin',
      `refs/heads/${workspace.architectureBranchName}:refs/remotes/origin/${workspace.architectureBranchName}`,
    ], {
      cwd: workspace.worktreePath,
      encoding: 'utf8',
    });

    const cleanup = await cleanupRealE2ERunWorkspace(workspace);
    workspace = null;
    assert.equal(cleanup.steps.some((step) => step.step === 'git_push_url_restore'), false);
    assert.equal(
      cleanup.steps
        .filter((step) => step.step.startsWith('git_') || step.step === 'artifact_root_remove')
        .every((step) => step.ok),
      true,
    );
  } finally {
    if (workspace) await cleanupRealE2ERunWorkspace(workspace);
  }
});

test('git commit failure scenario keeps setup hooks untouched', async () => {
  let workspace = null;
  try {
    workspace = await createRealE2ERunWorkspace({ scenarioId: 'git-commit-failure' });
    const hookPath = path.join(workspace.worktreePath, '.git', 'hooks', 'pre-commit');
    assert.equal(fs.existsSync(hookPath), false);
  } finally {
    if (workspace) await cleanupRealE2ERunWorkspace(workspace);
  }
});

test('git failure scenarios do not write harness fault intent into progress or run config', () => {
  const { progress } = applyRealE2EScenario(buildProgress({ projectName: 'unit-git-runtime-intent' }), 'git-credential-failure');
  const config = applyRealE2EConfigScenario(buildRunConfig({
    runId: 'run-unit-git-runtime-intent',
    worktreePath: REPO_ROOT,
    scenarioId: 'success',
  }), 'git-credential-failure');

  assert.equal(progress.real_e2e?.intentional_git_failure, undefined);
  assert.equal(config.real_e2e?.intentional_git_failure, undefined);
});

test('git merge conflict fixture preserves architecture branch in scenario origin', async () => {
  const originalOrigin = (await execFileAsync('git', ['remote', 'get-url', 'origin'], {
    encoding: 'utf8',
  })).stdout.trim();
  const originalPushOrigin = (await execFileAsync('git', ['remote', 'get-url', '--push', 'origin'], {
    encoding: 'utf8',
  })).stdout.trim();
  let workspace = null;
  try {
    workspace = await createRealE2ERunWorkspace({ scenarioId: 'git-merge-conflict' });
    const conflictRemote = workspace.gitConflictFixture?.remote;
    assert.ok(conflictRemote);

    await execFileAsync('git', [
      `--git-dir=${conflictRemote}`,
      'show-ref',
      '--verify',
      `refs/heads/${workspace.branchName}`,
    ]);
    await execFileAsync('git', [
      `--git-dir=${conflictRemote}`,
      'show-ref',
      '--verify',
      `refs/heads/${workspace.architectureBranchName}`,
    ]);

    const cleanup = await cleanupRealE2ERunWorkspace(workspace);
    workspace = null;
    assert.equal(cleanup.steps.find((step) => step.step === 'git_origin_restore')?.ok, true);
    assert.equal((await execFileAsync('git', ['remote', 'get-url', 'origin'], {
      encoding: 'utf8',
    })).stdout.trim(), originalOrigin);
    assert.equal((await execFileAsync('git', ['remote', 'get-url', '--push', 'origin'], {
      encoding: 'utf8',
    })).stdout.trim(), originalPushOrigin);
  } finally {
    if (workspace) await cleanupRealE2ERunWorkspace(workspace);
  }
});

test('nginx fixture listens on the configured Buster health port', () => {
  const nginxConfig = fs.readFileSync(path.join(SCRIPT_DIR, 'fixtures', 'nginx-project', 'nginx', 'default.conf'), 'utf8');
  assert.match(nginxConfig, /listen 8080;/);
  assert.match(nginxConfig, /location = \/runtime-foundation-check/);
});

test('nginx fixture pins its base image and verifies production contract fields', async () => {
  const fixtureDir = path.join(SCRIPT_DIR, 'fixtures', 'nginx-project');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'real-e2e-nginx-fixture-'));
  try {
    fs.cpSync(fixtureDir, tmpDir, { recursive: true });

    const dockerfile = fs.readFileSync(path.join(tmpDir, 'Dockerfile'), 'utf8');
    assert.match(dockerfile, /nginx:1\.27-alpine@sha256:[a-f0-9]{64}/);

    const manifest = fs.readFileSync(path.join(tmpDir, 'k8s', 'deployment.yaml'), 'utf8');
    assert.match(manifest, /- name: http\s+containerPort: 8080/);
    assert.match(manifest, /- name: http\s+port: 80\s+targetPort: http/);

    const result = await execFileAsync('npm', ['run', 'verify', '--silent'], {
      cwd: tmpDir,
      encoding: 'utf8',
      timeout: 30000,
      maxBuffer: 1024 * 1024,
    });
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.module, 'all');
    assert.equal(parsed.checked.includes('pinned base image'), true);
    assert.equal(parsed.checked.includes('foundation config packaged'), true);
    assert.equal(parsed.checked.includes('content branch surface'), true);
    assert.equal(parsed.checked.includes('asset branch surface'), true);
    assert.equal(parsed.checked.includes('integration content surface'), true);
    assert.equal(parsed.checked.includes('reusable manifest structure'), true);

    for (const moduleId of ['01-nginx', '02-nginx', '03-nginx', '04-nginx']) {
      const moduleResult = await execFileAsync('npm', ['run', `verify:${moduleId}`, '--silent'], {
        cwd: tmpDir,
        encoding: 'utf8',
        timeout: 30000,
        maxBuffer: 1024 * 1024,
      });
      const moduleParsed = JSON.parse(moduleResult.stdout);
      assert.equal(moduleParsed.ok, true, moduleId);
      assert.equal(moduleParsed.module, moduleId);
      assert.equal(moduleParsed.checked.length > 0, true, moduleId);
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('generated real e2e progress omits retired health and preview configuration', () => {
  const progress = buildProgress({ projectName: 'real-pipeline-e2e-unit' });
  assert.equal(JSON.stringify(progress).includes('health_path'), false);
  assert.equal(JSON.stringify(progress).includes('health_retries'), false);
  assert.equal(JSON.stringify(progress).includes('smoke_paths'), false);
  assert.equal(JSON.stringify(progress).includes('tailscale_preview'), false);
});

test('final deployment uses the fixture provider and a dependent HTTP check', async () => {
  let workspace = null;
  try {
    workspace = await createRealE2ERunWorkspace({ scenarioId: 'success' });
    const pipeline = JSON.parse(fs.readFileSync(path.join(workspace.swarmDir, 'pipeline.json'), 'utf8'));
    const gate = pipeline.gates['final-buster'];
    assert.equal(gate.tests['size-budget-artifact'].uses, 'kubeclaw.direct-command@1');
    assert.deepEqual(gate.tests['size-budget-artifact'].config.args.slice(0, 2), ['--format=ustar', '--transform=s,^\\./,,;s,^\\.$,root,']);
    assert.equal(gate.tests['size-budget'].uses, 'kubeclaw.size-budget@1');
    assert.deepEqual(gate.tests['size-budget'].inputs['build-output'], {
      from: 'size-budget-artifact',
      output: 'artifact-1',
    });
    assert.equal(gate.fixtures['kubernetes-deployment'].uses, 'kubeclaw.kubernetes-fixture@1');
    assert.equal(gate.tests['container-build'].uses, 'kubeclaw.container-build@1');
    assert.deepEqual(gate.fixtures['kubernetes-deployment'].needs, ['size-budget', 'container-build']);
    assert.deepEqual(gate.fixtures['kubernetes-deployment'].inputs.image, {
      from: 'container-build', output: 'image',
    });
    assert.equal(gate.fixtures['kubernetes-deployment'].config.retention.mode, 'delete');
    assert.equal(gate.tests.health.uses, 'kubeclaw.http@1');
    assert.equal(gate.tests.health.inputs.deployment.from, 'kubernetes-deployment');
    assert.equal(gate.tests.health.config.expectedText, 'REAL_E2E_NGINX_OK');
  } finally {
    if (workspace) await cleanupRealE2ERunWorkspace(workspace);
  }
});

test('real e2e fixture delegates lease cleanup to the provider lifecycle', () => {
  const source = fs.readFileSync(path.join(SCRIPT_DIR, 'real-run-workspace.mjs'), 'utf8');

  assert.match(source, /uses: 'kubeclaw\.kubernetes-fixture@1'/);
  assert.match(source, /retention_mode: 'delete'/);
  assert.match(source, /inputs: deploymentInput/);
});

test('namespace controller waits for namespace deletion before removing cleanup finalizer', () => {
  const source = fs.readFileSync(path.join(REPO_ROOT, 'cmd', 'buster-namespace-controller', 'main.go'), 'utf8');

  assert.match(source, /return c\.waitForNamespaceDeleted\(ctx, namespaceName\)/);
  assert.match(source, /namespace .* was not deleted before cleanup timeout/);
  assert.match(source, /return c\.removeFinalizer\(ctx, item\)/);
});

test('namespace controller keeps credential delivery separate from preview exposure', () => {
  const source = fs.readFileSync(path.join(REPO_ROOT, 'cmd', 'buster-namespace-controller', 'main.go'), 'utf8');
  const previewExposure = source.match(/func \(c \*controller\) ensurePreviewExposure[\s\S]*?\n}\n\nfunc \(c \*controller\) copySecrets/)?.[0] || '';

  assert.doesNotMatch(previewExposure, /credentials(?:Available|Ref)|previewCredentialsAvailable/);
  assert.match(previewExposure, /if !serviceReady \{[\s\S]*?"exposurePhase":\s+"Pending"/);
  assert.match(previewExposure, /Waiting for Service\/" \+ exposure\.ServiceName \+ " before creating Tailscale ingress/);
});
