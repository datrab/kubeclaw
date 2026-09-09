#!/usr/bin/env node
import fs from 'node:fs';
import { registryTestContract } from './registry-test-contract.mjs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

import {
  applyRealE2EWorkspaceScenario,
  applyRealE2EScenario,
  failureMatrixExecutionBoundary,
  listFailureMatrixSuiteIds,
  realE2EScenarioModuleIds,
  resolveFailureMatrixSuite,
  resolveRealE2EScenario,
  scenarioMutationContractForScenario,
  validateRealE2EScenarioSetup,
} from './failure-scenarios.mjs';
import {
  applyRealE2EExecutionBoundary,
  buildProgress,
  buildRunConfig,
  normalizeRealE2ERuntimeDefaults,
  REPO_ROOT,
  writeRealE2ESwarmFiles,
} from './real-run-workspace.mjs';
import { expectedFailureContractForScenario } from './real-run-evidence.mjs';
import { malformedOutputScenarioConfig } from './malformed-output-publisher.mjs';

process.env.KUBECLAW_REGISTRY_CONFIG ??= registryTestContract;
const FIXTURE_DIR = path.join(REPO_ROOT, 'tests', 'verification', 'e2e', 'fixtures', 'nginx-project');
process.env.REAL_E2E_DEPLOYMENT_IMAGE = process.env.REAL_E2E_DEPLOYMENT_IMAGE
  || 'registry-mirror.kubeclaw.svc.cluster.local:5000/library/nginx:1.27-alpine@sha256:62223d644fa234c3a1cc785ee14242ec47a77364226f1c811d2f669f96dc2ac8';
const DEFAULT_MODULE_TIMEOUT_MINUTES = 10;
const MODULE_BUSTER_AUTHORITY_EVIDENCE = Object.freeze(new Set([
  'buster_module_failure',
  'buster_module_infra_failure',
  'buster_invalid_completion_identity',
  'buster_module_timeout',
]));

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function withEnv(updates, fn) {
  const prior = new Map();
  for (const [key, value] of Object.entries(updates)) {
    prior.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = String(value);
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of prior.entries()) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function envForBoundary(boundary) {
  return {
    REAL_E2E_EXECUTION_BOUNDARY: boundary,
    REAL_E2E_TERMINAL_EXTRAS: boundary === 'full' ? undefined : '0',
  };
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function expectedExecutionOrder(moduleIds, boundary) {
  if (boundary === 'modules') return [...moduleIds];
  if (boundary === 'module-review') return [...moduleIds, 'gate:module-review'];
  if (boundary === 'final-buster') return [...moduleIds, 'gate:final-buster'];
  if (boundary === 'final-review') {
    return [
      ...moduleIds,
      'gate:module-review',
      'gate:operator-approval',
      'gate:final-buster',
      'gate:final-review',
    ];
  }
  return [
    ...moduleIds,
    'gate:module-review',
    'gate:operator-approval',
    'gate:final-buster',
    'gate:final-review',
  ];
}

function expectedScenarioExecutionOrder({ scenarioId, moduleIds, boundary }) {
  const base = expectedExecutionOrder(moduleIds, boundary);
  if (scenarioId === 'approval-deny' || scenarioId === 'approval-timeout-block') {
    const approval = 'gate:operator-approval';
    if (!base.includes(approval)) return base;
    return [
      approval,
      ...base.filter((entry) => entry !== approval),
    ];
  }
  if (scenarioId === 'architecture-validator-block') {
    return ['REAL_E2E_EXPECTED_ARCH_VALIDATOR_UNKNOWN_MODULE', ...base];
  }
  return base;
}

function seededStaleCheckpointProgress({ projectName, runId }) {
  const progress = withEnv({ REAL_E2E_EXECUTION_BOUNDARY: 'full', REAL_E2E_TERMINAL_EXTRAS: undefined }, () => buildProgress({
    projectName,
    runId,
    moduleIds: ['01-nginx', '02-nginx', '03-nginx', '04-nginx'],
  }));
  progress.defaults.models.forge = 'gpt-5.5';
  progress.defaults.models.buster = 'gpt-5.5';
  progress.defaults.models.echo = 'gpt-5.5';
  progress.defaults.models.arch_validator = 'gpt-5.5';
  progress.pipeline_review = {
    ...(progress.pipeline_review || {}),
    enabled: true,
    model: 'gpt-5.5',
  };
  for (const module of Object.values(progress.modules || {})) {
    module.timeout_minutes = 3;
    module.thinking_level = 'medium';
  }
  progress.real_e2e = {
    ...(progress.real_e2e || {}),
    execution_boundary: 'full',
    module_scope: ['01-nginx', '02-nginx', '03-nginx', '04-nginx'],
  };
  return progress;
}

function materializeScenario({ rootDir, suiteId, scenarioId, mode }) {
  const boundary = failureMatrixExecutionBoundary({ suite: suiteId, scenario: scenarioId });
  return withEnv(envForBoundary(boundary), () => {
    const runId = `real-e2e-audit-${mode}-${scenarioId}`;
    const projectName = `real-e2e-audit-${mode}-${scenarioId}`;
    const worktreePath = path.join(rootDir, suiteId, scenarioId, mode, 'worktree');
    const projectSrc = path.join(worktreePath, 'Projects', projectName, 'src');
    const swarmDir = path.join(projectSrc, '.swarm');
    fs.mkdirSync(path.dirname(projectSrc), { recursive: true });
    fs.cpSync(FIXTURE_DIR, projectSrc, { recursive: true });

    const baseProgress = mode === 'restored'
      ? seededStaleCheckpointProgress({ projectName, runId })
      : buildProgress({ projectName, runId, moduleIds: realE2EScenarioModuleIds(scenarioId) });
    execFileSync('git', ['init', '-q', worktreePath]);
    execFileSync('git', ['-C', worktreePath, 'add', '.']);
    execFileSync('git', ['-C', worktreePath, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'original fixture']);
    baseProgress.real_e2e.coverage_base_revision = execFileSync('git', ['-C', worktreePath, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const normalized = mode === 'restored'
      ? normalizeRealE2ERuntimeDefaults(cloneJson(baseProgress), { scenarioId })
      : cloneJson(baseProgress);
    applyRealE2EExecutionBoundary(normalized);
    const { progress, scenario } = applyRealE2EScenario(normalized, scenarioId);
    applyRealE2EWorkspaceScenario({ projectSrc, progress, scenarioId: scenario.id });
    writeJson(path.join(swarmDir, 'progress.json'), progress);
    writeRealE2ESwarmFiles(swarmDir, progress);
    const config = buildRunConfig({ runId, worktreePath, scenarioId: scenario.id });
    writeJson(path.join(rootDir, suiteId, scenarioId, mode, 'swarm.config.json'), config);
    validateRealE2EScenarioSetup({
      progress,
      config,
      projectSrc,
      swarmDir,
      scenarioId: scenario.id,
    });
    return { boundary, config, mode, progress, projectSrc, runId, scenario, swarmDir };
  });
}

function invariantFailures({ materialized, scenarioId }) {
  const failures = [];
  const { boundary, config, mode, progress, swarmDir } = materialized;
  const expectedModules = [...realE2EScenarioModuleIds(scenarioId)];
  const moduleIds = Object.keys(progress.modules || {});
  const executionOrder = Array.isArray(progress.execution_order) ? progress.execution_order : [];
  const expectedOrder = expectedScenarioExecutionOrder({ scenarioId, moduleIds: expectedModules, boundary });
  const push = (code, message, details = {}) => failures.push({ code, message, mode, ...details });

  if (progress.real_e2e?.execution_boundary !== boundary) {
    push('execution_boundary_mismatch', 'progress execution boundary did not match suite/scenario boundary', {
      expected: boundary,
      actual: progress.real_e2e?.execution_boundary ?? null,
    });
  }
  if (JSON.stringify(moduleIds) !== JSON.stringify(expectedModules)) {
    push('module_scope_mismatch', 'progress modules did not match scenario module scope', {
      expected: expectedModules,
      actual: moduleIds,
    });
  }
  if (JSON.stringify(progress.real_e2e?.module_scope || []) !== JSON.stringify(expectedModules)) {
    push('real_e2e_module_scope_mismatch', 'real_e2e.module_scope did not match scenario module scope', {
      expected: expectedModules,
      actual: progress.real_e2e?.module_scope || null,
    });
  }
  if (JSON.stringify(executionOrder) !== JSON.stringify(expectedOrder)) {
    push('execution_order_mismatch', 'execution order did not match the execution boundary', {
      expected: expectedOrder,
      actual: executionOrder,
    });
  }
  if (boundary !== 'full' && config.case_study?.enabled !== false) {
    push('terminal_extra_case_study_enabled', 'case study must be disabled outside full execution boundary', {
      actual: config.case_study?.enabled ?? null,
    });
  }
  if (boundary !== 'full' && config.pipeline_review?.enabled !== false) {
    push('terminal_extra_pipeline_review_enabled', 'pipeline review must be disabled outside full execution boundary', {
      actual: config.pipeline_review?.enabled ?? null,
    });
  }
  if (config.case_study?.model !== config.fallback_model) {
    push('case_study_model_mismatch', 'case study model did not normalize to the fallback model', {
      expected: config.fallback_model,
      actual: config.case_study?.model ?? null,
    });
  }
  if (MODULE_BUSTER_AUTHORITY_EVIDENCE.has(materialized.scenario.expectedEvidence)) {
    if (!['modules', 'module-review'].includes(boundary)) {
      push('module_buster_authority_boundary_mismatch', 'module Buster authority scenario must not be scoped as a runtime-config/full-pipeline failure', {
        expected: ['modules', 'module-review'],
        actual: boundary,
      });
    }
    const mutationContract = scenarioMutationContractForScenario(scenarioId);
    if (!mutationContract.allowed_mutation_channels.includes('buster-worker-api')
      && materialized.scenario.expectedEvidence === 'buster_invalid_completion_identity') {
      push('module_buster_identity_mutation_channel_mismatch', 'Buster output identity scenario must mutate through the Buster worker API channel', {
        allowed_mutation_channels: mutationContract.allowed_mutation_channels,
      });
    }
  }
  if (materialized.scenario.expectedEvidence === 'forge_malformed_output') {
    const failure = expectedFailureContractForScenario(materialized.scenario);
    if (failure.expectedStageId !== 'forge-01-nginx') {
      push('forge_malformed_v2_failure_contract_stale', 'Forge malformed output must be attributed to the canonical v2 Forge stage', {
        actual: {
          expected_stage_id: failure.expectedStageId,
          allowed_stage_events: failure.allowedStageEventTypes,
        },
      });
    }
    const malformedConfig = malformedOutputScenarioConfig(materialized.scenario.id);
    if (malformedConfig?.targetMayBeRewritten !== true) {
      push('forge_malformed_target_rewrite_contract_missing', 'retryable Forge malformed output must allow the retried Forge artifact to replace the malformed target', {
        actual: malformedConfig?.targetMayBeRewritten ?? null,
      });
    }
  }
  for (const [moduleId, module] of Object.entries(progress.modules || {})) {
    if (!Number.isFinite(Number(module.timeout_minutes)) || Number(module.timeout_minutes) <= 0) {
      push('module_timeout_invalid', 'module timeout must be a positive number', {
        module_id: moduleId,
        actual: module.timeout_minutes ?? null,
      });
    }
    if (mode === 'restored' && scenarioId !== 'forge-timeout' && scenarioId !== 'buster-module-timeout'
      && Number(module.timeout_minutes) === 3) {
      push('restored_stale_module_timeout', 'restored checkpoint preserved a stale module timeout', {
        module_id: moduleId,
        actual: module.timeout_minutes,
      });
    }
  }
  const progressFile = readJson(path.join(swarmDir, 'progress.json'));
  const contractModules = progressFile.contracts?.module_review?.module_ids || [];
  if (JSON.stringify(contractModules) !== JSON.stringify(expectedModules)) {
    push('module_review_contract_scope_mismatch', 'generated module-review contract did not match scenario scope', {
      expected: expectedModules,
      actual: contractModules,
    });
  }
  const architectureText = fs.readFileSync(path.join(swarmDir, 'ARCHITECTURE.md'), 'utf8');
  if (!expectedModules.includes('04-nginx') && architectureText.includes('Four modules are intentional')) {
    push('stale_full_graph_architecture_text', 'scoped scenario kept full graph architecture text');
  }
  return failures;
}

export function auditFailureMatrixContracts({ suites = listFailureMatrixSuiteIds(), rootDir = null } = {}) {
  const auditRoot = rootDir || fs.mkdtempSync(path.join(os.tmpdir(), 'real-e2e-contract-audit-'));
  const cases = [];
  const failures = [];
  for (const suiteId of suites) {
    const suite = resolveFailureMatrixSuite(suiteId);
    for (const scenarioId of suite.scenarios) {
      resolveRealE2EScenario(scenarioId);
      for (const mode of ['fresh', 'restored']) {
        try {
          const materialized = materializeScenario({ rootDir: auditRoot, suiteId, scenarioId, mode });
          const scenarioFailures = invariantFailures({ materialized, scenarioId });
          failures.push(...scenarioFailures.map((failure) => ({ suite: suiteId, scenario: scenarioId, ...failure })));
          cases.push({
            suite: suiteId,
            scenario: scenarioId,
            mode,
            boundary: materialized.boundary,
            ok: scenarioFailures.length === 0,
            failures: scenarioFailures,
          });
        } catch (error) {
          const setupFailures = Array.isArray(error?.failures) ? error.failures : [];
          const failure = {
            suite: suiteId,
            scenario: scenarioId,
            mode,
            code: error?.code || 'materialization_failed',
            message: error?.message || String(error),
            setup_failures: setupFailures,
          };
          failures.push(failure);
          cases.push({
            suite: suiteId,
            scenario: scenarioId,
            mode,
            boundary: failureMatrixExecutionBoundary({ suite: suiteId, scenario: scenarioId }),
            ok: false,
            failures: [failure],
          });
        }
      }
    }
  }
  return {
    ok: failures.length === 0,
    audit_root: auditRoot,
    suites,
    cases,
    failures,
  };
}

function parseArgs(argv) {
  const args = { suites: listFailureMatrixSuiteIds(), json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--suite') args.suites = [argv[++index] || ''];
    else if (arg === '--suites') {
      args.suites = String(argv[++index] || '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
    } else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  args.suites.forEach((suite) => resolveFailureMatrixSuite(suite));
  return args;
}

function usage() {
  return [
    'Usage: node tests/verification/e2e/audit-failure-matrix-contracts.mjs [--suite <id>|--suites a,b] [--json]',
    '',
    'Materializes every requested real E2E scenario in fresh and restored-checkpoint modes without launching agents.',
    'Fails on stale harness assumptions before expensive real pipeline runs.',
    '',
  ].join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      process.stdout.write(usage());
      process.exit(0);
    }
    const result = auditFailureMatrixContracts({ suites: args.suites });
    if (args.json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else if (result.ok) {
      process.stdout.write(`real E2E contract audit passed: ${result.cases.length} materialized cases across ${result.suites.length} suite(s)\n`);
    } else {
      process.stderr.write(`real E2E contract audit failed: ${result.failures.length} failure(s)\n`);
      for (const failure of result.failures.slice(0, 20)) {
        process.stderr.write(`- ${failure.suite}/${failure.scenario}/${failure.mode}: ${failure.code} ${failure.message}\n`);
      }
      if (result.failures.length > 20) {
        process.stderr.write(`... ${result.failures.length - 20} more failure(s)\n`);
      }
    }
    process.exit(result.ok ? 0 : 1);
  } catch (error) {
    process.stderr.write(`${error?.stack || error?.message || String(error)}\n`);
    process.exit(1);
  }
}
