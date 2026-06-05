import { installQuietRuntimeConsole } from '../lib/verification-console.mjs';
const quietConsole = installQuietRuntimeConsole({ label: 'contracts/check-worker-control-result-surface' });
import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { pathToFileURL } from 'url';

function parseArgs(argv = process.argv.slice(2)) {
  const args = { sourceRoot: process.cwd() };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--source-root') args.sourceRoot = path.resolve(argv[i + 1]);
  }
  return args;
}

const { sourceRoot } = parseArgs();
const helperPath = path.join(sourceRoot, 'skills/nova/pipeline/services/contracts/worker-control-result.ts');
const orchestrationPath = path.join(sourceRoot, 'skills/nova/pipeline/agents/orchestration.ts');
const moduleWorkerControlResultsPath = path.join(sourceRoot, 'skills/nova/pipeline/agents/module-worker-control-results.ts');
const moduleWorkersPath = path.join(sourceRoot, 'skills/nova/pipeline/agents/module-workers.ts');
const moduleRunnerPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/module-runner.ts');
const moduleRunnerBusterWorkerPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/module-runner-buster-worker.ts');
const moduleRunnerForgePath = path.join(sourceRoot, 'skills/nova/pipeline/runners/module-runner-forge.ts');
const moduleRunnerSharedPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/module-runner-shared.ts');
const registryPath = path.join(sourceRoot, 'skills/nova/pipeline/core/registry.ts');

const helperSource = fs.readFileSync(helperPath, 'utf8');
const orchestrationSource = fs.readFileSync(orchestrationPath, 'utf8');
const moduleWorkerControlResultsSource = fs.readFileSync(moduleWorkerControlResultsPath, 'utf8');
const moduleWorkersSource = fs.readFileSync(moduleWorkersPath, 'utf8');
const moduleRunnerSource = fs.readFileSync(moduleRunnerPath, 'utf8');
const moduleRunnerBusterWorkerSource = fs.readFileSync(moduleRunnerBusterWorkerPath, 'utf8');
const moduleRunnerForgeSource = fs.readFileSync(moduleRunnerForgePath, 'utf8');
const moduleRunnerSharedSource = fs.readFileSync(moduleRunnerSharedPath, 'utf8');
const registrySource = fs.readFileSync(registryPath, 'utf8');

for (const marker of [
  'export function cloneSerializable(',
  'export function buildTypedWorkerControlResult(',
  'export function isTypedWorkerControlResult(',
  'export function coerceTypedWorkerControlResult(',
  'export function validateTypedWorkerControlResult(',
  'export function normalizeTypedWorkerControlResult(',
]) {
  assert.equal(helperSource.includes(marker), true, `shared worker control-result helper must export ${marker}`);
}

for (const forbidden of [
  'WORKER_CONTROL_RESULT_MAPPINGS',
  'export function mapWorkerBackendResultToControl(',
  'export function projectTypedWorkerCompatibilityResult(',
  'export function projectModuleForgeWorkerCompatibilityResult(',
  'export function projectModuleBusterWorkerCompatibilityResult(',
  "from '../compatibility-authority.ts'",
  "from './control-result-mapping.ts'",
]) {
  assert.equal(helperSource.includes(forbidden), false, `worker control-result helper must not keep ${forbidden}`);
}

assert.equal(orchestrationSource.includes("from './module-worker-control-results.ts'"), true, 'orchestration should import the extracted module worker control-result helper');
assert.equal(orchestrationSource.includes('function cloneSerializable('), false, 'orchestration must not keep a local cloneSerializable helper for worker control results');
assert.equal(orchestrationSource.includes('buildTypedWorkerControlResult({'), false, 'orchestration should not build worker control results inline after extraction');
assert.equal(orchestrationSource.includes('mapWorkerBackendResultToControl('), false, 'orchestration should not map worker backend facts inline after extraction');
assert.equal(orchestrationSource.includes('projectModuleForgeWorkerCompatibilityResult'), false, 'orchestration must not re-export Forge worker compatibility projections');
assert.equal(orchestrationSource.includes('projectModuleBusterWorkerCompatibilityResult'), false, 'orchestration must not re-export Buster worker compatibility projections');
assert.equal(orchestrationSource.includes('allowCompatibilityCoercion'), false, 'orchestration must not keep worker compatibility coercion opt-in paths');
assert.equal(orchestrationSource.includes('compatibility_result'), false, 'worker control-result metadata must not embed compatibility_result payloads');
assert.equal(orchestrationSource.includes('compatibilityResult'), false, 'worker compatibility projection should not accept a secondary compatibilityResult authority input');
assert.equal(orchestrationSource.includes('isTypedWorkerControlResult('), false, 'orchestration should not test worker control-result shape inline after extraction');
assert.equal(orchestrationSource.includes("from './module-workers.ts'"), true, 'orchestration should import the extracted module worker execution helper');
assert.equal(orchestrationSource.includes('|| agentType'), false, 'ACP orchestration must not fall back to agentType as a hidden agent id');
assert.equal(orchestrationSource.includes("requires explicit acp_agent_id or model harness mapping"), true, 'ACP orchestration must fail closed when no agent id authority exists');

assert.equal(moduleWorkerControlResultsSource.includes("from '../services/contracts/worker-control-result.ts'"), true, 'module worker control-result helper should import the shared worker control-result helper');
assert.equal(moduleWorkerControlResultsSource.includes('buildTypedWorkerControlResult({'), true, 'module worker control-result helper should build typed controls through the shared helper');
assert.equal(moduleWorkerControlResultsSource.includes('mapWorkerBackendResultToControl('), false, 'module worker control-result helper must not map compatibility backend result shapes through the shared contract');
assert.equal(moduleWorkerControlResultsSource.includes('coerceTypedWorkerControlResult('), true, 'module worker control-result helper should coerce worker control results through the shared helper');
assert.equal(moduleWorkerControlResultsSource.includes('isTypedWorkerControlResult('), true, 'module worker control-result helper should test worker control-result shape through the shared helper');
assert.equal(moduleWorkerControlResultsSource.includes('result?.ok'), false, 'module worker control builders must not use result.ok as worker authority');
assert.equal(moduleWorkerControlResultsSource.includes('poll_result?.ok'), false, 'module worker control builders must not use poll_result.ok as worker authority');
assert.equal(moduleWorkerControlResultsSource.includes('workerInput?.moduleId'), false, 'module worker control builders should read typed ids.moduleId rather than legacy top-level moduleId');
assert.equal(moduleWorkerControlResultsSource.includes('workerInput?.attempt'), false, 'module worker control builders should read typed ids.attempt rather than legacy top-level attempt');
assert.equal(moduleWorkerControlResultsSource.includes('workerInput?.moduleDir'), false, 'module worker control builders should read typed executionContext.moduleDir rather than legacy top-level moduleDir');
assert.equal(moduleWorkerControlResultsSource.includes('result?.failureClass'), false, 'Buster worker failure_class authority must not accept legacy camelCase failureClass');
assert.equal(moduleWorkerControlResultsSource.includes('_redis_entry?.failure_class'), false, 'Buster worker failure_class authority must not read legacy Redis entry failure_class');

assert.equal(moduleWorkersSource.includes('return buildModuleForgeWorkerControlResult(config, workerInput,'), true, 'Forge worker backend should return typed worker control results directly');
assert.equal(moduleWorkersSource.includes('return buildModuleBusterWorkerControlResult(config, workerInput,'), true, 'Buster worker backend should return typed worker control results directly');
assert.equal(moduleWorkersSource.includes('normalizeModuleWorkerInput('), true, 'module workers should canonicalize worker input before runner logic reads it');
assert.equal(moduleWorkersSource.includes('_redis_entry?.failure_class'), false, 'module worker backend must not read legacy Redis entry failure_class');
assert.equal(moduleWorkersSource.includes("terminalStatus === STATUS.FAIL"), false, 'module worker backend must not infer failure_class from final FAIL status');
assert.equal(moduleWorkersSource.includes("return 'unknown'"), false, 'module worker backend must not default missing Buster failure_class to unknown');

assert.equal(moduleRunnerSharedSource.includes("from '../services/contracts/worker-control-result.ts'"), true, 'module-runner shared helper should import the shared worker control-result validator');
assert.equal(moduleRunnerSharedSource.includes('normalizeTypedWorkerControlResult('), true, 'module-runner shared helper should normalize worker control results through the shared helper');
assert.equal(moduleRunnerSharedSource.includes('allowCompatibilityCoercion'), false, 'module-runner shared normalization must not pass worker compatibility coercion flags');
assert.equal(moduleRunnerSource.includes('normalizeTypedWorkerControlResult('), false, 'module-runner should not keep direct worker control-result normalization after the slice');
assert.equal(moduleRunnerBusterWorkerSource.includes('projectModuleBusterWorkerCompatibilityResult'), false, 'module-runner Buster worker helper must consume typed worker controls directly');
assert.equal(moduleRunnerForgeSource.includes('projectModuleForgeWorkerCompatibilityResult'), false, 'module-runner Forge helper must consume typed worker controls directly');
assert.equal(registrySource.includes('allowCompatibilityCoercion'), false, 'registry must not pass worker compatibility coercion flags');
assert.equal(registrySource.includes('coerceModuleForgeWorkerControlResult'), false, 'registry should receive typed Forge worker controls directly from the backend effect');
assert.equal(registrySource.includes('coerceModuleBusterWorkerControlResult'), false, 'registry should receive typed Buster worker controls directly from the backend effect');

const helperMod = await import(pathToFileURL(helperPath).href);
const moduleWorkerControlResultsMod = await import(pathToFileURL(moduleWorkerControlResultsPath).href);
const moduleWorkersMod = await import(pathToFileURL(moduleWorkersPath).href);
assert.equal(typeof helperMod.cloneSerializable, 'function', 'shared worker control-result helper should expose cloneSerializable');
assert.equal(typeof helperMod.buildTypedWorkerControlResult, 'function', 'shared worker control-result helper should expose buildTypedWorkerControlResult');
assert.equal(typeof helperMod.mapWorkerBackendResultToControl, 'undefined', 'shared worker mapper must be removed');
assert.equal(typeof helperMod.projectTypedWorkerCompatibilityResult, 'undefined', 'generic worker compatibility projector must be removed');
assert.equal(typeof helperMod.projectModuleForgeWorkerCompatibilityResult, 'undefined', 'Forge worker compatibility projector must be removed');
assert.equal(typeof helperMod.projectModuleBusterWorkerCompatibilityResult, 'undefined', 'Buster worker compatibility projector must be removed');
assert.equal(typeof helperMod.isTypedWorkerControlResult, 'function', 'shared worker control-result helper should expose isTypedWorkerControlResult');
assert.equal(typeof helperMod.coerceTypedWorkerControlResult, 'function', 'shared worker control-result helper should expose coerceTypedWorkerControlResult');
assert.equal(typeof helperMod.validateTypedWorkerControlResult, 'function', 'shared worker control-result helper should expose validateTypedWorkerControlResult');
assert.equal(typeof helperMod.normalizeTypedWorkerControlResult, 'function', 'shared worker control-result helper should expose normalizeTypedWorkerControlResult');
assert.equal(typeof moduleWorkerControlResultsMod.buildModuleBusterWorkerControlResult, 'function', 'module worker control-result helper should expose Buster result builder');

const canonicalBusterWorkerInput = {
  ids: {
    runId: 'run-worker-contract',
    moduleId: 'module-worker-contract',
    attempt: 1,
    stageId: 'worker:module_buster',
  },
  refs: {
    moduleAttemptRef: 'module_attempt:run-worker-contract:module-worker-contract:1',
  },
  worker: {
    workerType: 'module_buster',
  },
  executionContext: {
    moduleDir: 'module-worker-contract',
  },
};
const explicitBusterFailureControl = moduleWorkerControlResultsMod.buildModuleBusterWorkerControlResult(
  { project: 'contract-test', _runId: 'run-worker-contract' },
  canonicalBusterWorkerInput,
  {
    nextAction: 'request_fix',
    issueType: 'code',
    outcomeClass: 'fix_requested',
    reason: 'buster_failed',
    failureClass: 'pretest_code',
    pollResult: {
      ok: false,
      reason: 'buster_failed',
      failure_class: 'pretest_code',
      status: { status: 'FAIL' },
    },
    finalStatus: { status: 'FAIL' },
  },
);
assert.equal(explicitBusterFailureControl.producerType, 'module_buster', 'Buster worker builder should return typed worker control');
assert.equal(explicitBusterFailureControl.nextAction, 'request_fix', 'explicit Buster failureClass should drive typed control mapping');
assert.equal(
  explicitBusterFailureControl.diagnostics?.metadata?.failure_class,
  'pretest_code',
  'Buster worker metadata should preserve explicit typed failureClass',
);
assert.throws(
  () => moduleWorkerControlResultsMod.buildModuleBusterWorkerControlResult(
    { project: 'contract-test', _runId: 'run-worker-contract' },
    canonicalBusterWorkerInput,
    {
      nextAction: 'block',
      issueType: 'unknown',
      outcomeClass: 'error',
      reason: 'missing failure class',
      pollResult: { ok: false, status: { status: 'FAIL' } },
      finalStatus: { status: 'FAIL' },
    },
  ),
  /requires explicit typed failureClass/,
  'Buster worker builder must reject failing typed controls without explicit failureClass',
);
assert.throws(
  () => moduleWorkerControlResultsMod.buildModuleBusterWorkerControlResult(
    { project: 'contract-test', _runId: 'run-worker-contract' },
    canonicalBusterWorkerInput,
    {
      nextAction: 'block',
      issueType: 'environment',
      reason: 'missing outcome class',
      failureClass: 'spawn_failed',
      pollResult: { ok: false, status: { status: 'FAIL' } },
      finalStatus: { status: 'FAIL' },
    },
  ),
  /requires explicit canonical outcomeClass/,
  'Buster worker builder must reject controls without canonical outcomeClass',
);

assert.equal(typeof moduleWorkersMod.runModuleForgeWorker, 'function', 'module workers should export runModuleForgeWorker');
const defaultDependencyForgeResult = await moduleWorkersMod.runModuleForgeWorker({
  config: { project: 'contract-test', _runId: 'run-default-deps' },
  progress: {},
  workerInput: {
    ids: { moduleId: 'default-deps-module', attempt: 1 },
    executionContext: { moduleDir: 'default-deps-module', timeoutMinutes: 1 },
    model: 'test-model',
    prompt: 'contract test',
  },
  deps: {
    spawnAgent: async () => ({}),
    verifyAgentAlive: async () => true,
    killAgent: async () => {},
    pollForgeCompletionWithRateLimitRecovery: async () => ({ ok: true, reason: 'agent_ended_meaningful_diff', status: { status: 'READY_FOR_TESTING', summary: 'done' } }),
    loadStatus: () => ({ status: 'READY_FOR_TESTING' }),
    saveStreamLog: () => {},
    clearShutdownContext: () => {},
  },
});
assert.equal(defaultDependencyForgeResult?.producerType, 'module_forge', 'Forge worker default dependency path should return typed worker control');
assert.equal(defaultDependencyForgeResult?.nextAction, 'pass', 'Forge worker default dependency path should complete without injected getTrackedAgent');

const defaultDependencyBusterResult = await moduleWorkersMod.runModuleBusterWorker({
  config: { project: 'contract-test', _runId: 'run-default-deps' },
  progress: {},
  workerInput: {
    ids: { moduleId: 'default-deps-module', attempt: 1, dispatchId: 'dispatch-default-deps' },
    executionContext: { moduleDir: 'default-deps-module', timeoutMinutes: 1 },
    model: 'test-model',
    prompt: 'contract test',
    status: { status: 'TESTING' },
  },
  deps: {
    archiveModuleCompletions: async () => ({ failed: false }),
    spawnAgent: async () => ({ dispatch_id: 'dispatch-default-deps', run_id: 'run-default-deps' }),
    killAgent: async () => {},
    pollDualWithRateLimitRecovery: async () => ({ ok: false, reason: 'timeout', status: { status: 'FAIL' } }),
    loadStatus: () => ({ status: 'FAIL' }),
    saveStreamLog: () => {},
    clearShutdownContext: () => {},
  },
});
assert.equal(defaultDependencyBusterResult?.producerType, 'module_buster', 'Buster worker default dependency path should return typed worker control');
assert.equal(defaultDependencyBusterResult?.nextAction, 'retry', 'Buster timeout should be typed retryable environment work');
assert.equal(defaultDependencyBusterResult?.diagnostics?.metadata?.failure_class, 'timeout', 'Buster timeout should carry explicit typed failure_class metadata');

assert.throws(
  () => helperMod.normalizeTypedWorkerControlResult({
    schemaVersion: 'v0',
    producerKind: 'worker',
    producerType: 'module_forge',
    nested: { headers: { authorization: 'Bearer abcdefghijklmnopqrstuvwxyz' } },
  }, {
    producerType: 'module_forge',
    label: 'Module Forge',
    coerce: (value) => value,
  }),
  (error) => {
    const diagnosticText = JSON.stringify(error?.diagnostics || {});
    return error?.diagnostics?.diagnosticType === 'plugin_contract_invalid'
      && error.diagnostics.rawResultPreview === undefined
      && error.diagnostics.coercedResultPreview === undefined
      && error.diagnostics.rawResultSummary?.redacted === true
      && error.diagnostics.coercedResultSummary?.redacted === true
      && !diagnosticText.includes('abcdefghijklmnopqrstuvwxyz');
  },
  'worker contract diagnostics must summarize/redact nested secret-like raw plugin output at source',
);

quietConsole.restore();
console.log(JSON.stringify({ ok: true, checked: 'typed-worker-controls-only' }));
