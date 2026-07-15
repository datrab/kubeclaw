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
  REPO_ROOT,
  validateRealE2EModel,
} from './real-run-workspace.mjs';
import {
  applyRealE2EConfigScenario,
  applyRealE2EFileScenario,
  applyRealE2EScenario,
  validateRealE2EScenarioSetup,
} from './failure-scenarios.mjs';

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

test('generated real e2e config defaults to advertised gpt-5.4 with thinking none', () => {
  const progress = buildProgress({ projectName: 'unit-model-defaults' });

  assert.equal(progress.defaults.models.forge, 'gpt-5.4');
  assert.equal(progress.defaults.models.buster, 'gpt-5.4');
  assert.equal(progress.defaults.models.echo, 'gpt-5.4');
  assert.equal(progress.defaults.models.arch_validator, 'gpt-5.4');
  assert.equal(progress.defaults.thinking.forge, 'none');
  assert.equal(progress.defaults.thinking.buster, 'none');
  assert.equal(progress.defaults.thinking.echo, 'none');
  assert.equal(progress.defaults.thinking.arch_validator, 'none');
  assert.equal(progress.arch_validation.thinking_level, 'none');
  assert.equal(progress.arch_validation.agent_max_attempts, 2);
  assert.equal(progress.pipeline_review.thinking_level, 'none');
  assert.equal(progress.pipeline_review.agent_max_attempts, 2);
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
  assert.equal(config.case_study.model, 'gpt-5.4');
  assert.equal(config.case_study.thinking_level, 'none');
  assert.equal(config.case_study.agent_id, 'codex');
  assert.equal(config.case_study.output_file, 'logs/pipeline/case-study.md');
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

    assert.equal(progress.pipeline_review.enabled, false);
    assert.equal(config.case_study.enabled, false);
  });
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

test('generated real e2e seed declares explicit static serving and module-owned smoke checks', () => {
  const progress = buildProgress({ projectName: 'unit-static-serving', moduleIds: ['01-nginx', '02-nginx', '03-nginx', '04-nginx'] });
  const staticServing = progress.contracts.runtime_config.static_serving;

  assert.equal(staticServing.web_root, 'src');
  assert.equal(staticServing.sentinel_text, 'REAL_E2E_NGINX_OK');
  assert.deepEqual(staticServing.surfaces.map((surface) => surface.served_as), [
    '/content/branch-a.html',
    '/assets/branch-b.css',
  ]);
  assert.deepEqual(progress.modules['02-nginx'].test_config.serve.smoke_paths, ['/content/branch-a.html']);
  assert.deepEqual(progress.modules['02-nginx'].test_config.serve.smoke_expected_text, { '/content/branch-a.html': 'REAL_E2E_BRANCH_A_CONTENT' });
  assert.deepEqual(progress.modules['03-nginx'].test_config.serve.smoke_paths, ['/assets/branch-b.css']);
  assert.deepEqual(progress.modules['03-nginx'].test_config.serve.smoke_expected_text, { '/assets/branch-b.css': '#real-e2e-content-branch' });
  assert.deepEqual(progress.modules['04-nginx'].test_config.serve.smoke_paths, ['/', '/content/branch-a.html', '/assets/branch-b.css']);
  assert.deepEqual(progress.modules['04-nginx'].test_config.serve.smoke_expected_text, {
    '/': 'REAL_E2E_NGINX_OK',
    '/content/branch-a.html': 'REAL_E2E_BRANCH_A_CONTENT',
    '/assets/branch-b.css': '#real-e2e-content-branch',
  });
  assert.equal(progress.modules['01-nginx'].agent_judgment.required, true);
  assert.equal(progress.modules['01-nginx'].agent_judgment.reason, 'foundation_module_requires_buster_agent_judgment');
  assert.equal(progress.modules['02-nginx'].agent_judgment.required, false);
  assert.equal(progress.modules['02-nginx'].agent_judgment.reason, 'seed_leaf_modules_use_deterministic_suite_authority');
  assert.equal(progress.modules['03-nginx'].max_fails, 3);
  assert.equal(progress.modules['03-nginx'].auto_retry_threshold, 2);
});

test('real e2e model preflight accepts advertised GPT-5.4 ids', () => {
  assert.equal(validateRealE2EModel('gpt-5.4'), 'gpt-5.4');
  assert.equal(validateRealE2EModel('gpt-5.4/low'), 'gpt-5.4/low');
});

test('generated real e2e module and Buster gate use bounded internal timeouts', () => {
  const progress = buildProgress({
    projectName: 'unit-timeout-defaults',
    moduleIds: ['01-nginx', '02-nginx', '03-nginx', '04-nginx'],
  });

  assert.equal(progress.modules['01-nginx'].timeout_minutes, 6);
  assert.equal(progress.modules['02-nginx'].timeout_minutes, 3);
  assert.equal(progress.gates['final-buster'].timeout_minutes, 5);
  assert.equal(progress.gates['module-review'].timeout_minutes, 15);
  assert.equal(progress.gates['final-review'].timeout_minutes, 20);
  assert.equal(progress.pipeline_review.timeout_minutes, 10);
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
  assert.equal(gate.instructions_file, 'echo-review/MODULE-REVIEW-INSTRUCTIONS.md');
  assert.equal(gate.output_file, 'logs/echo-review/MODULE-REVIEW.json');
  assert.notEqual(gate.reviewers?.length, 0);
});

test('retry malformed-output scenarios enforce unit failures before retry', () => {
  const scenarioId = 'retry-fix-malformed-output';
  const base = buildProgress({ projectName: `unit-${scenarioId}` });
  const { progress } = applyRealE2EScenario(base, scenarioId);
  const unit = progress.modules['01-nginx'].test_config.unit;

  assert.equal(progress.modules['01-nginx'].max_fails, 3);
  assert.equal(progress.modules['01-nginx'].auto_retry_threshold, 1);
  assert.equal(unit.thresholds.max_failures, 0);
  assert.equal(Array.isArray(unit.test_cmd), true);
  assert.match(unit.test_cmd.join(' '), /REAL_E2E_EXPECTED_RETRYABLE_FORGE_CODE_FAILURE/);
});

test('Buster gate failure configures final gate failing unit command', () => {
  const base = buildProgress({ projectName: 'unit-buster-gate-failure' });
  const { progress } = applyRealE2EScenario(base, 'buster-gate-failure');
  const unit = progress.gates['final-buster'].test_config.unit;

  assert.equal(Array.isArray(unit.test_cmd), true);
  assert.match(unit.test_cmd.join(' '), /REAL_E2E_EXPECTED_BUSTER_GATE_FAILURE/);
});

test('namespace lease denied scenario preserves intentional invalid prefix through final Buster', async () => {
  const base = buildProgress({ projectName: 'unit-namespace-lease-denied' });
  const { progress } = applyRealE2EScenario(base, 'namespace-lease-denied');
  assert.equal(progress.gates['final-buster'].test_config.k8s.namespace_prefix, 'prod');

  let workspace = null;
  try {
    workspace = await createRealE2ERunWorkspace({ scenarioId: 'namespace-lease-denied' });
    const generatedProgress = JSON.parse(fs.readFileSync(path.join(workspace.swarmDir, 'progress.json'), 'utf8'));
    const contract = JSON.parse(fs.readFileSync(path.join(workspace.swarmDir, 'real-e2e-scenario-contract.json'), 'utf8'));

    assert.equal(generatedProgress.gates['final-buster'].test_config.k8s.namespace_prefix, 'prod');
    assert.equal(contract.scenario_id, 'namespace-lease-denied');
    assert.equal(contract.intentional_fixture.owner, 'final-buster');
    assert.equal(contract.intentional_fixture.intent, 'namespace_safety_rejection');
    assert.deepEqual(contract.intentional_fixture.preserve, ['gates.final-buster.test_config.k8s.namespace_prefix']);
  } finally {
    if (workspace) await cleanupRealE2ERunWorkspace(workspace);
  }
});

test('scenario setup preflight rejects drift before pipeline execution', () => {
  const base = buildProgress({ projectName: 'unit-namespace-lease-denied-drift' });
  const { progress } = applyRealE2EScenario(base, 'namespace-lease-denied');
  progress.gates['final-buster'].test_config.k8s.namespace_prefix = 'test';

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
        field: 'gates.final-buster.test_config.k8s.namespace_prefix',
        expected: 'prod',
        actual: 'test',
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

    assert.match(manifest, /path: \/real-e2e-intentional-not-ready/);
    assert.equal(contract.scenario_id, 'k8s-pod-never-ready');
    assert.equal(contract.intentional_fixture.intent, 'pod_readiness_timeout');
    assert.deepEqual(contract.intentional_fixture.evidence, ['/real-e2e-intentional-not-ready']);
  } finally {
    if (workspace) await cleanupRealE2ERunWorkspace(workspace);
  }
});

test('registry pull failure targets final Buster k8s build only', async () => {
  const base = buildProgress({ projectName: 'unit-registry-pull-failure' });
  const { progress } = applyRealE2EScenario(base, 'registry-pull-failure');
  const finalK8s = progress.gates['final-buster'].test_config.k8s;

  assert.equal(finalK8s.source_image, undefined);
  assert.match(finalK8s.dockerfile, /Dockerfile\.real-e2e-missing-base$/);
  assert.match(finalK8s.build_context, /\/src$/);
  assert.equal(progress.modules['01-nginx'].test_config.serve.dockerfile.endsWith('/Dockerfile'), true);

  let workspace = null;
  try {
    workspace = await createRealE2ERunWorkspace({ scenarioId: 'registry-pull-failure' });
    const dockerfile = fs.readFileSync(path.join(workspace.projectSrc, 'Dockerfile'), 'utf8');
    const finalDockerfile = fs.readFileSync(path.join(workspace.projectSrc, 'Dockerfile.real-e2e-missing-base'), 'utf8');
    const generatedProgress = JSON.parse(fs.readFileSync(path.join(workspace.swarmDir, 'progress.json'), 'utf8'));

    assert.doesNotMatch(dockerfile, /real-e2e-intentional-missing-base/);
    assert.match(finalDockerfile, /real-e2e-intentional-missing-base:never/);
    assert.equal(generatedProgress.gates['final-buster'].test_config.k8s.source_image, undefined);
    assert.match(generatedProgress.gates['final-buster'].test_config.k8s.dockerfile, /Dockerfile\.real-e2e-missing-base$/);
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
    assert.deepEqual(progress.contracts.module_outputs['01-nginx'].provides, ['foundation-runtime-static-serving.v1']);
    assert.deepEqual(progress.contracts.module_outputs['02-nginx'].consumed_surfaces, ['foundation-runtime-static-serving.v1']);
    assert.deepEqual(progress.contracts.module_outputs['02-nginx'].provides, ['branch-a-static-content.v1']);
    assert.deepEqual(progress.contracts.module_outputs['02-nginx'].provided_surfaces, ['src/content/branch-a.html']);
    assert.deepEqual(progress.contracts.module_outputs['03-nginx'].provides, ['branch-b-static-asset.v1']);
    assert.deepEqual(progress.contracts.module_outputs['03-nginx'].provided_surfaces, ['src/assets/branch-b.css']);
    assert.deepEqual(progress.contracts.module_outputs['04-nginx'].consumed_surfaces, [
      'foundation-runtime-static-serving.v1',
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

test('expected-failure scenarios keep the canonical four-module architecture graph', async () => {
  let workspace = null;
  try {
    workspace = await createRealE2ERunWorkspace({ scenarioId: 'approval-deny' });
    const progress = JSON.parse(fs.readFileSync(path.join(workspace.swarmDir, 'progress.json'), 'utf8'));

    assert.deepEqual(Object.keys(progress.modules), ['01-nginx', '02-nginx', '03-nginx', '04-nginx']);
    assert.deepEqual(progress.execution_order.slice(0, 4), ['gate:operator-approval', '01-nginx', '02-nginx', '03-nginx']);
    assert.equal(progress.execution_order.includes('04-nginx'), true);
    assert.deepEqual(progress.gates['module-review'].contract.module_ids, ['01-nginx', '02-nginx', '03-nginx', '04-nginx']);
    assert.equal(progress.contracts.deployable_artifact.release_candidate_module, '04-nginx');
  } finally {
    if (workspace) await cleanupRealE2ERunWorkspace(workspace);
  }
});

test('generated real e2e run config uses repo-local profile tool paths', async () => {
  let workspace = null;
  try {
    workspace = await createRealE2ERunWorkspace({ scenarioId: 'success' });
    const config = JSON.parse(fs.readFileSync(workspace.runConfigPath, 'utf8'));

    assert.equal(config.pre_check.lint_report_path, path.join(workspace.worktreePath, 'skills', 'nova', 'pipeline', 'tools', 'lint-report.ts'));
    assert.equal(config.agents.buster.redis_js_path, path.join(workspace.worktreePath, 'skills', 'nova', 'pipeline', 'tools', 'redis.ts'));
    assert.equal(config.fallback_model, 'gpt-5.4');
    assert.doesNotMatch(config.pre_check.lint_report_path, /^\/app\/skills\//);
    assert.doesNotMatch(config.agents.buster.redis_js_path, /^\/app\/skills\//);
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

test('generated review contract assigns namespace lease preview exposure to final Buster', async () => {
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
    const finalGate = progress.gates['final-buster'];

    assert.match(architecture, /module manifest stays reusable with only Deployment, Service, and app-owned Secret resources/);
    assert.match(architecture, /Module 01 owns the shared nginx runtime config/);
    assert.match(architecture, /Module 04 owns copying the assembled `src\/` tree into the nginx web root/);
    assert.match(architecture, /preview-infrastructure\.json.*final Buster owns run-scoped preview exposure deterministically/s);
    assert.match(architecture, /external tailnet DNS\/HTTPS reachability is not required from the Buster\/Nova pod/);
    assert.match(architecture, /spec\.exposure\.provider=tailscale-ingress/);
    assert.match(moduleReview, /Do not require static BusterNamespaceLease or Ingress manifests in module source/);
    assert.match(moduleReview, /provider=tailscale-ingress.*dynamic BusterNamespaceLease/s);
    assert.match(moduleReview, /gates\.final-buster\.test_config\.k8s\.preview/);
    assert.match(moduleReview, /checked_contracts/);
    assert.match(moduleReview, /opened_artifacts/);
    assert.match(moduleReview, /failed_commands/);
    assert.match(moduleReview, /unverified_requirements/);
    assert.match(moduleReview, /PASS is invalid if `failed_commands` or `unverified_requirements` is non-empty/);
    assert.match(pipelineReview, /Do not report benign startup tool failures, transcript compaction notices, or accepted-output session-stop grace expiry/);
    assert.match(foundationBuster, /downstream release-candidate reference/);
    assert.match(foundationBuster, /foundation module must not require its reusable manifest to use the final release-candidate image/);
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
    assert.match(releaseForge, /Preserve the reusable deployment manifest image placeholder `real-pipeline-e2e-nginx:verification`/);
    assert.match(releaseForge, /`Dockerfile`/);
    assert.match(releaseForge, /final Buster owns release-candidate image promotion and run-scoped manifest override/);
    assert.match(releaseBuster, /Require `k8s\/deployment\.yaml` to keep the reusable image placeholder `real-pipeline-e2e-nginx:verification`/);
    assert.match(releaseBuster, /final Buster must promote and override the image at deployment time/);
    assert.match(finalBuster, /deterministic Buster k8s suite creates the final preview/);
    assert.match(finalBuster, /must not require tailnet DNS from the Buster\/Nova pod/);
    assert.match(finalBuster, /preview\.provider.*tailscale-ingress/);
    assert.match(finalBuster, /spec\.exposure\.provider=tailscale-ingress/);
    assert.match(finalBuster, /Do not ask Forge, Echo, or reusable module manifests to create final-preview lease or Ingress resources/);
    assert.match(finalBuster, /Do not ask Forge or module manifests to add Role or RoleBinding resources for `pods\/portforward`/);
    assert.match(finalBuster, /pod readiness, an internal service content check, and a dynamic preview URL/);
    assert.match(finalBuster, /gates\.final-buster\.test_config\.k8s\.preview/);
    assert.deepEqual(finalGate.test_suites, ['build', 'health', 'unit', 'manifest', 'k8s', 'tailscale-preview']);
    assert.equal(finalGate.contract.preview_infrastructure_ref, 'contracts.preview_infrastructure');
    assert.equal(finalGate.test_config.serve.image, 'localhost/real-pipeline-e2e-nginx:module');
    assert.equal(finalGate.test_config.serve.dockerfile, undefined);
    assert.equal(finalGate.test_config.k8s.source_image, 'localhost/real-pipeline-e2e-nginx:module');
    assert.equal(finalGate.test_config.k8s.dockerfile, undefined);
    assert.equal(finalGate.test_config.k8s.preview.contract, 'dynamic-buster-namespace-lease');
    assert.equal(finalGate.test_config.k8s.preview.provider, 'tailscale-ingress');
    assert.equal(finalGate.test_config.manifest.enforced, true);
    assert.deepEqual(finalGate.test_config.tailscale_preview, {
      source_suite: 'k8s',
      expected_text: 'REAL_E2E_NGINX_OK',
      smoke_paths: ['/content/branch-a.html', '/assets/branch-b.css'],
      smoke_expected_text: {
        '/content/branch-a.html': 'REAL_E2E_BRANCH_A_CONTENT',
        '/assets/branch-b.css': '#real-e2e-content-branch',
      },
    });
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
    assert.match(deployableArtifact.authority.rule, /Only the release_candidate_module Buster owns release-candidate image verification/);
    assert.equal(deployableArtifact.image.reference, 'localhost/real-pipeline-e2e-nginx:module');
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
    assert.match(architecture, /deployable-artifact\.json.*release-candidate handoff/s);
    assert.match(architecture, /runtime-config\.json.*application runtime and static serving boundary/s);
    assert.match(architecture, /module-review\.json.*Echo review ownership/s);
    assert.match(architecture, /preview-infrastructure\.json.*final Buster owns run-scoped preview exposure/s);
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

test('generated final review does not require post-final-review terminal artifacts', async () => {
  let workspace = null;
  try {
    workspace = await createRealE2ERunWorkspace({ scenarioId: 'success' });
    const finalReview = fs.readFileSync(path.join(workspace.swarmDir, 'echo-review', 'FINAL-REVIEW-INSTRUCTIONS.md'), 'utf8');

    assert.match(finalReview, /Review the pre-completion run artifacts/);
    assert.match(finalReview, /do not require post-final-review terminal artifacts/);
    assert.match(finalReview, /logs\/pipeline\/summary\.json/);
    assert.match(finalReview, /logs\/pipeline\/runs\/<run_id>\/summary\.json/);
    assert.match(finalReview, /logs\/pipeline-review\/PIPELINE-REVIEW\.\{md,json\}/);
    assert.match(finalReview, /non-running `logs\/pipeline\/latest\.json`/);
    assert.match(finalReview, /non-PENDING final-review read model/);
    assert.match(finalReview, /final Buster produced deployment and preview evidence/);
  } finally {
    if (workspace) await cleanupRealE2ERunWorkspace(workspace);
  }
});

test('generated final review requires final Buster to promote the module release candidate', async () => {
  let workspace = null;
  try {
    workspace = await createRealE2ERunWorkspace({ scenarioId: 'success' });
    const architecture = fs.readFileSync(path.join(workspace.swarmDir, 'ARCHITECTURE.md'), 'utf8');
    const finalReview = fs.readFileSync(path.join(workspace.swarmDir, 'echo-review', 'FINAL-REVIEW-INSTRUCTIONS.md'), 'utf8');
    const finalBuster = fs.readFileSync(path.join(workspace.swarmDir, 'buster-test', 'FINAL-BUSTER.md'), 'utf8');

    assert.match(architecture, /release assembly module Buster owns release-candidate verification/);
    assert.match(architecture, /Final Buster promotes the configured contract image/);
    assert.match(finalReview, /Require final Buster to promote and deploy the release assembly module Buster deployable artifact contract/);
    assert.match(finalReview, /do not accept a separate final-gate rebuild as equivalent evidence/);
    assert.match(finalReview, /source_image_id/);
    assert.match(finalReview, /registry_image_digest/);
    assert.match(finalBuster, /Promote the deployable artifact contract image/);
    assert.match(finalBuster, /validate that exact deployed image in Kubernetes/);
    assert.match(finalBuster, /Record immutable promotion evidence/);
  } finally {
    if (workspace) await cleanupRealE2ERunWorkspace(workspace);
  }
});

test('tailscale preview unreachable scenario uses explicit unreachable preview URL', async () => {
  const base = buildProgress({ projectName: 'unit-tailscale-preview-url-unreachable' });
  const { progress } = applyRealE2EScenario(base, 'tailscale-preview-url-unreachable');
  const finalGate = progress.gates['final-buster'];

  assert.ok(finalGate.test_suites.includes('k8s'));
  assert.equal(finalGate.test_suites.includes('tailscale-preview'), true);
  assert.equal(finalGate.test_config.tailscale_preview.source_suite, 'explicit');
  assert.equal(finalGate.test_config.tailscale_preview.preview_url, 'http://127.0.0.1:1');
  assert.equal(finalGate.test_config.tailscale_preview.expected_text, 'REAL_E2E_NGINX_OK');
  assert.equal(finalGate.test_config.tailscale_preview.connect_timeout_seconds, 1);
  assert.equal(finalGate.test_config.tailscale_preview.max_time_seconds, 1);

  let workspace = null;
  try {
    workspace = await createRealE2ERunWorkspace({ scenarioId: 'tailscale-preview-url-unreachable' });
    const generatedProgress = JSON.parse(fs.readFileSync(path.join(workspace.swarmDir, 'progress.json'), 'utf8'));
    const generatedFinalGate = generatedProgress.gates['final-buster'];

    assert.equal(generatedFinalGate.test_config.tailscale_preview.source_suite, 'explicit');
    assert.equal(generatedFinalGate.test_config.tailscale_preview.preview_url, 'http://127.0.0.1:1');
    assert.equal(generatedFinalGate.test_config.tailscale_preview.connect_timeout_seconds, 1);
    assert.equal(generatedFinalGate.test_config.tailscale_preview.max_time_seconds, 1);
  } finally {
    if (workspace) await cleanupRealE2ERunWorkspace(workspace);
  }
});

test('tailscale preview wrong deployment scenario changes k8s preview expected marker', async () => {
  const base = buildProgress({ projectName: 'unit-tailscale-preview-wrong-deployment' });
  const { progress } = applyRealE2EScenario(base, 'tailscale-preview-wrong-deployment');
  const finalGate = progress.gates['final-buster'];

  assert.ok(finalGate.test_suites.includes('k8s'));
  assert.equal(finalGate.test_suites.includes('tailscale-preview'), true);
  assert.equal(finalGate.test_config.k8s.preview.expected_text, 'REAL_E2E_EXPECTED_DIFFERENT_DEPLOYMENT_MARKER');
  assert.equal(finalGate.test_config.tailscale_preview.source_suite, 'k8s');

  let workspace = null;
  try {
    workspace = await createRealE2ERunWorkspace({ scenarioId: 'tailscale-preview-wrong-deployment' });
    const generatedProgress = JSON.parse(fs.readFileSync(path.join(workspace.swarmDir, 'progress.json'), 'utf8'));
    const generatedFinalGate = generatedProgress.gates['final-buster'];

    assert.equal(generatedFinalGate.test_config.k8s.preview.expected_text, 'REAL_E2E_EXPECTED_DIFFERENT_DEPLOYMENT_MARKER');
    assert.equal(generatedFinalGate.test_config.tailscale_preview.source_suite, 'k8s');
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
    assert.equal(cleanup.ok, true);
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

test('generated real e2e serve config uses HTTP smoke paths only', () => {
  const progress = buildProgress({ projectName: 'real-pipeline-e2e-unit' });
  assert.deepEqual(progress.modules['01-nginx'].test_config.serve.smoke_paths, ['/', '/runtime-foundation-check']);
  assert.deepEqual(progress.modules['01-nginx'].test_config.serve.smoke_expected_text, {
    '/': 'REAL_E2E_NGINX_OK',
    '/runtime-foundation-check': 'REAL_E2E_NGINX_OK',
  });
  assert.equal(progress.gates['final-buster'].test_config.serve.smoke_paths, undefined);
});

test('final preview validates stable fixture content without mutating source run identity', () => {
  const progress = buildProgress({ projectName: 'real-pipeline-e2e-unit', runId: 'real-e2e-unit-run' });
  const k8s = progress.gates['final-buster'].test_config.k8s;

  assert.equal(k8s.cleanup_policy, 'keep');
  assert.equal(k8s.preview.expected_text, 'REAL_E2E_NGINX_OK');
  assert.equal(k8s.preview.reveal_credentials, undefined);
  assert.equal(k8s.preview.credentials_secret_name, undefined);
  assert.equal(k8s.preview.credentials_keys, undefined);
  assert.equal(k8s.test_credentials, undefined);
});

test('real e2e cleanup hands kept final-preview leases back to controller delete authority', () => {
  const source = fs.readFileSync(path.join(SCRIPT_DIR, 'real-run-workspace.mjs'), 'utf8');

  assert.match(source, /setLeaseCleanupPolicyDelete\(name, kubeclawNamespace\)/);
  assert.match(source, /cleanupPolicy.*delete/s);
  assert.match(source, /waitForLeaseDeleted\(name, kubeclawNamespace\)/);
  assert.match(source, /controller_finalizer_removed_after_delete_policy/);
});

test('namespace controller waits for namespace deletion before removing cleanup finalizer', () => {
  const source = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'buster-namespace-controller.mjs'), 'utf8');

  assert.match(source, /await waitForNamespaceDeleted\(namespaceName\)/);
  assert.match(source, /namespace .* was not deleted before cleanup timeout/);
  assert.match(source, /await removeFinalizer\(lease\)/);
});
