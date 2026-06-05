import { installQuietRuntimeConsole } from '../lib/verification-console.mjs';
const quietConsole = installQuietRuntimeConsole({ label: 'contracts/check-module-runner-slice-surface' });
import fs from 'fs';
import os from 'os';
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
const moduleRunnerPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/module-runner.ts');
const sharedPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/module-runner-shared.ts');
const forgePath = path.join(sourceRoot, 'skills/nova/pipeline/runners/module-runner-forge.ts');
const prebusterPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/module-runner-prebuster.ts');
const attemptPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/module-runner/attempt.ts');
const stateMachinePath = path.join(sourceRoot, 'skills/nova/pipeline/runners/module-runner/state-machine.ts');
const preflightPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/module-runner/preflight.ts');
const busterPhasePath = path.join(sourceRoot, 'skills/nova/pipeline/runners/module-runner/buster-phase.ts');
const busterDispatchPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/module-runner/buster-phase/dispatch.ts');
const busterPollFailurePath = path.join(sourceRoot, 'skills/nova/pipeline/runners/module-runner/buster-phase/poll-failure.ts');
const busterTerminalFailurePath = path.join(sourceRoot, 'skills/nova/pipeline/runners/module-runner/buster-phase/terminal-failure.ts');
const terminalResultsPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/module-runner/terminal-results.ts');
const contextPath = path.join(sourceRoot, 'skills/nova/pipeline/core/context.ts');
const registryPath = path.join(sourceRoot, 'skills/nova/pipeline/core/registry.ts');
const registryBuiltinsPath = path.join(sourceRoot, 'skills/nova/pipeline/core/registry/builtins.ts');
const constantsPath = path.join(sourceRoot, 'skills/nova/pipeline/core/constants.ts');
const pluginContextRuntimePath = path.join(sourceRoot, 'skills/nova/pipeline/core/plugin-context-runtime.ts');

const moduleRunnerSource = fs.readFileSync(moduleRunnerPath, 'utf8');
const sharedSource = fs.readFileSync(sharedPath, 'utf8');
const forgeSource = fs.readFileSync(forgePath, 'utf8');
const prebusterSource = fs.readFileSync(prebusterPath, 'utf8');
const attemptSource = fs.readFileSync(attemptPath, 'utf8');
const stateMachineSource = fs.readFileSync(stateMachinePath, 'utf8');
const preflightSource = fs.readFileSync(preflightPath, 'utf8');
const orchestrationSource = fs.readFileSync(path.join(sourceRoot, 'skills/nova/pipeline/agents/orchestration.ts'), 'utf8');
const busterPhaseSource = fs.readFileSync(busterPhasePath, 'utf8');
const busterDispatchSource = fs.readFileSync(busterDispatchPath, 'utf8');
const busterPollFailureSource = fs.readFileSync(busterPollFailurePath, 'utf8');
const busterTerminalFailureSource = fs.readFileSync(busterTerminalFailurePath, 'utf8');
const terminalResultsSource = fs.readFileSync(terminalResultsPath, 'utf8');
const contextSource = fs.readFileSync(contextPath, 'utf8');
const registrySource = fs.readFileSync(registryPath, 'utf8');
const registryBuiltinsSource = fs.readFileSync(registryBuiltinsPath, 'utf8');
const registryRuntimeSource = `${registrySource}\n${registryBuiltinsSource}`;
const constantsSource = fs.readFileSync(constantsPath, 'utf8');

for (const marker of [
  'export function currentAttemptNumber(',
  'export function buildModuleForgeRunInput(',
  'export function buildModuleValidatorRunInput(',
  'export function buildModuleBusterRunInput(',
  'export function buildModuleWorkerPluginInvocation(',
  'export function buildModuleValidatorPluginInvocation(',
  'export function normalizeModuleBusterWorkerResult(',
  'export function emitTerminalModuleFailTelemetry(',
]) {
  assert.equal(sharedSource.includes(marker), true, `module-runner shared helper must export ${marker}`);
}

for (const marker of [
  'export async function runModuleForgePhase(',
  'export async function finalizeForgeOnlyPass(',
]) {
  assert.equal(forgeSource.includes(marker), true, `module-runner forge helper must export ${marker}`);
}
assert.equal(prebusterSource.includes('export async function prepareModuleForBuster('), true, 'module-runner pre-Buster helper must export prepareModuleForBuster');
assert.equal(attemptSource.includes('export async function executeModuleAttempt('), true, 'module-runner attempt helper must export executeModuleAttempt');
assert.equal(stateMachineSource.includes('export async function runModuleAttemptStateMachine('), true, 'module-runner state machine must export runModuleAttemptStateMachine');
assert.equal(stateMachineSource.includes('export function planLoadedModuleStatus('), true, 'module-runner state machine must export loaded-status planner');
assert.equal(stateMachineSource.includes('export function planModuleAttemptPhase('), true, 'module-runner state machine must export phase planner');
assert.equal(preflightSource.includes('export async function runModulePreflight('), true, 'module-runner preflight helper must export runModulePreflight');
assert.equal(busterPhaseSource.includes('export async function runModuleBusterPhase('), true, 'module-runner Buster phase helper must export runModuleBusterPhase');
assert.equal(terminalResultsSource.includes('export function buildPassTerminalResult('), false, 'terminal result helper must not expose raw PASS builder');
assert.equal(terminalResultsSource.includes('export function buildFailTerminalResult('), false, 'terminal result helper must not expose raw FAIL builder');
assert.equal(terminalResultsSource.includes('export function buildModulePassTerminalResult('), true, 'terminal result helper must expose typed module PASS builder');
assert.equal(terminalResultsSource.includes('export function buildBlockedTerminalResult('), true, 'terminal result helper must expose BLOCKED builder');
assert.equal(terminalResultsSource.includes('export function buildRateLimitTerminalResult('), false, 'terminal result helper must not expose raw RATE_LIMIT builder');

assert.equal(moduleRunnerSource.includes("from './module-runner-shared.ts'"), true, 'module-runner should import the shared module-runner helper surface');
assert.equal(moduleRunnerSource.includes("from './module-runner/attempt.ts'"), true, 'module-runner should import the extracted attempt helper surface');
assert.equal(attemptSource.includes("from './state-machine.ts'"), true, 'module-runner attempt should delegate lifecycle routing to the explicit state machine');
assert.equal(sharedSource.includes("from '../services/contracts/pipeline-step-result.ts'"), false, 'module-runner shared helper must not retain step-result compatibility projection');
assert.equal(moduleRunnerSource.includes('return attempt.result;'), true, 'module-runner should receive canonical step results from executeModuleAttempt');
assert.equal(moduleRunnerSource.includes('buildModuleStepResult'), false, 'module-runner facade must not own module terminal envelope projection');
assert.equal(attemptSource.includes('buildTypedModuleAttemptTerminal('), true, 'module-runner attempt should project terminal outcomes before returning to facade');
assert.equal(attemptSource.includes('buildModuleStepResult'), false, 'module-runner attempt must not call deleted module step compatibility reconstruction');
assert.equal(attemptSource.includes('function buildTypedModuleAttemptResult('), true, 'module-runner attempt should own explicit typed module terminal result creation');
assert.equal(sharedSource.includes('export function buildModuleStepResult('), false, 'shared module-runner helper must delete buildModuleStepResult compatibility reconstruction');
assert.equal(attemptSource.includes('resolveResultAttempt(rawResult)'), true, 'module terminal projection must not derive attempt authority from status active_agent');
assert.equal(stateMachineSource.includes('await runModuleForgePhase({'), true, 'state machine should delegate Forge phase execution through the extracted helper');
assert.equal(stateMachineSource.includes('await finalizeForgeOnlyPass({'), true, 'state machine should delegate forge-only pass promotion through the extracted helper');
assert.equal(stateMachineSource.includes('await prepareModuleForBuster({'), true, 'state machine should delegate pre-Buster preparation through the extracted helper');
assert.equal(stateMachineSource.includes('await runModuleBusterPhase({'), true, 'state machine should delegate Buster phase execution through the extracted helper');
assert.equal(forgeSource.includes('await runModulePreflight({'), true, 'Forge phase should delegate preflight validation through the extracted helper');
assert.equal(forgeSource.includes('{ softFail: true }'), false, 'Forge-only PASS must not use soft-fail Git publication');
assert.equal(forgeSource.includes('Forge-only module cannot PASS without durable Git persistence'), true, 'Forge-only thrown Git publication failures must stop PASS');
assert.equal(forgeSource.includes('Forge-only module cannot PASS without a durable Git commit'), true, 'Forge-only non-committed Git results must stop PASS');
assert.equal(forgeSource.includes("|| 'forge'"), false, 'Forge ACP dispatch must not fall back to a literal forge agent id');
assert.equal(forgeSource.includes('requires explicit agents.forge.acp_agent_id or model harness mapping'), true, 'Forge ACP dispatch must fail closed when no agent id authority exists');
assert.equal(orchestrationSource.includes('opts.attempt || 1') || orchestrationSource.includes('opts.dispatch_id || `buster-'), false, 'Buster Redis payload construction must not default attempt or synthesize dispatch identity');
assert.equal(busterDispatchSource.includes('Buster dispatch requires a typed nonempty test_suites list'), true, 'Buster dispatch must fail when requested suites are missing');
assert.equal(busterDispatchSource.includes("requestedSuites.join(', ')"), true, 'Buster queued notification should render the validated typed suite list');
assert.equal(busterDispatchSource.includes("|| 'none'"), false, 'Buster queued notification must not render missing suites as none');
assert.equal(busterDispatchSource.includes("value: 'none'"), false, 'Buster queued notification must not use a none fallback for suites');
assert.equal(busterPhaseSource.includes('?? 2'), false, 'Buster crash retry policy must not use an anonymous literal fallback');
assert.equal(forgeSource.includes('forgeWorkerMetadata.poll_result || {'), false, 'Forge worker routing must not reconstruct poll-result-like objects from typed metadata');
assert.equal(busterPhaseSource.includes('busterWorkerMetadata.poll_result || {'), false, 'Buster worker routing must not reconstruct poll-result-like objects from typed metadata');
assert.equal(busterPhaseSource.includes('ok: busterWorkerControlResult?.nextAction ==='), false, 'Buster worker routing must use typed final status or real poll evidence, not synthetic ok/status objects');
assert.equal(busterPollFailureSource.includes("if (reasonCode === 'git_error')"), true, 'Buster polling Git failures must have an explicit fail-closed branch');
assert.equal(busterPollFailureSource.includes('exit: EXIT_ERROR'), true, 'Buster polling Git failures must return terminal EXIT_ERROR');
assert.equal(busterPollFailureSource.includes('polling_git:'), true, 'Buster polling Git failures must expose operator-visible Git evidence');
assert.equal(busterTerminalFailureSource.includes('redisEntry?.verdict'), false, 'Terminal Buster failure mapping must not classify from Redis verdict presence');
assert.equal(busterTerminalFailureSource.includes('source regex'), false, 'Terminal Buster failure mapping must not use source regex classification');
assert.equal(busterTerminalFailureSource.includes('Buster terminal failure lacks explicit typed failure_class'), true, 'Terminal Buster failures must require explicit typed failure_class');
assert.equal(moduleRunnerSource.includes('runDeliveryLintValidation'), false, 'module-runner must not carry direct delivery-lint validator deps');
assert.equal(moduleRunnerSource.includes('runPreCheck'), false, 'module-runner must not carry direct pre-check validator deps');
assert.equal(prebusterSource.includes("requireStageHandler(config, 'validator.run'"), true, 'pre-Buster validators should resolve through startup registry authority');
assert.equal(prebusterSource.includes('buildModuleValidatorRunInput('), true, 'pre-Buster validators should use canonical validator run input');
assert.equal(sharedSource.includes('function buildModuleWorkerRunInputBase('), true, 'shared module-runner helper should collapse duplicated worker run-input scaffolding');
assert.equal(sharedSource.includes('function buildModuleWorkerDeadline('), true, 'shared module-runner helper should collapse duplicated worker deadline construction');
assert.equal(prebusterSource.includes('normalizeTypedValidatorControlResult('), true, 'pre-Buster validators should normalize typed validator controls');
assert.equal(prebusterSource.includes('getContractInvalidDiagnostic('), true, 'pre-Buster validators should preserve contract-invalid diagnostics');
assert.equal(prebusterSource.includes('contract_diagnostic'), true, 'pre-Buster validators should return rich contract diagnostics on malformed plugin output');
assert.equal(prebusterSource.includes('deps.runDeliveryLintValidation'), false, 'pre-Buster helper must not bypass registry for delivery lint');
assert.equal(prebusterSource.includes('deps.runPreCheck'), false, 'pre-Buster helper must not bypass registry for pre-check');
assert.equal(contextSource.includes('workerBackend'), false, 'PluginContext must not keep legacy workerBackend surface alias');
assert.equal(registryRuntimeSource.includes('workerBackend'), false, 'built-in worker registry must not call legacy workerBackend surface');
assert.equal(constantsSource.includes('dispatch.worker_backend'), false, 'capability registry must not keep legacy dispatch.worker_backend alias');
assert.equal(sharedSource.includes('workerBackend'), false, 'module runner effects must not provide legacy workerBackend alias');
assert.equal(registrySource.includes('export function resolveGateTypeOwner('), false, 'registry must not keep unused optional gate-owner decision lookup');
assert.equal(registrySource.includes('export function resolveStageHandler('), false, 'registry must not keep optional stage-handler decision lookup');
assert.equal(registrySource.includes('Absence means no observer/sink is\n// registered'), true, 'registry must document optional hook listener absence semantics');
assert.equal(fs.existsSync(pluginContextRuntimePath), false, 'PluginContext must not keep the hidden WeakMap runtime binding helper');
assert.equal(contextSource.includes('bindPluginContextRuntime'), false, 'PluginContext must not bind runtime through hidden compatibility helpers');
assert.equal(registryRuntimeSource.includes('getRuntimeConfigFromPluginContext'), false, 'built-in registry must use explicit coreRuntime instead of hidden context getters');
assert.equal(registryRuntimeSource.includes('ctx.coreRuntime.readConfig()'), true, 'built-in registry should read runtime config through explicit coreRuntime');
assert.equal(contextSource.includes("Object.defineProperty(pluginContext, 'coreRuntime'"), true, 'PluginContext should expose explicit non-enumerable coreRuntime only for built-ins');
assert.equal(contextSource.includes("workerRuntime: effects.workerRuntime || {}"), true, 'PluginContext should resolve the core worker runtime adapter effects');
assert.equal(contextSource.includes("hasCapability(capabilities, 'dispatch.worker_runtime')"), true, 'PluginContext should gate worker runtime dispatch by the renamed capability');
assert.equal(contextSource.includes('pluginContext.workerRuntime'), true, 'PluginContext should expose the renamed trusted worker runtime surface');
assert.equal(registryRuntimeSource.includes('ctx.workerRuntime.dispatch('), true, 'built-in worker stage owners should call the trusted worker runtime adapter');
assert.equal(constantsSource.includes('dispatch.worker_runtime'), true, 'capability registry should use dispatch.worker_runtime');
assert.equal(moduleRunnerSource.includes('function buildModuleForgeRunInput('), false, 'module-runner must not keep a local Forge run-input builder');
assert.equal(moduleRunnerSource.includes('function buildModuleBusterRunInput('), false, 'module-runner must not keep a local Buster run-input builder');
assert.equal(moduleRunnerSource.includes('function normalizeModuleForgeWorkerResult('), false, 'module-runner must not keep a local Forge worker-result normalizer');
assert.equal(moduleRunnerSource.includes('function normalizeModuleBusterWorkerResult('), false, 'module-runner must not keep a local Buster worker-result normalizer');

const sharedMod = await import(pathToFileURL(sharedPath).href);
const forgeMod = await import(pathToFileURL(forgePath).href);
const prebusterMod = await import(pathToFileURL(prebusterPath).href);
const attemptMod = await import(pathToFileURL(attemptPath).href);
const stateMachineMod = await import(pathToFileURL(stateMachinePath).href);
const preflightMod = await import(pathToFileURL(preflightPath).href);
const busterPhaseMod = await import(pathToFileURL(busterPhasePath).href);
const busterDispatchMod = await import(pathToFileURL(busterDispatchPath).href);
const terminalResultsMod = await import(pathToFileURL(terminalResultsPath).href);
const registryMod = await import(pathToFileURL(registryPath).href);
assert.equal(typeof sharedMod.currentAttemptNumber, 'function', 'shared module-runner helper should expose currentAttemptNumber');
assert.equal(typeof sharedMod.buildModuleForgeRunInput, 'function', 'shared module-runner helper should expose buildModuleForgeRunInput');
assert.equal(typeof sharedMod.buildModuleValidatorRunInput, 'function', 'shared module-runner helper should expose buildModuleValidatorRunInput');
assert.equal(typeof sharedMod.buildModuleBusterRunInput, 'function', 'shared module-runner helper should expose buildModuleBusterRunInput');
assert.equal(typeof sharedMod.buildModuleWorkerPluginInvocation, 'function', 'shared module-runner helper should expose buildModuleWorkerPluginInvocation');
assert.equal(typeof sharedMod.buildModuleValidatorPluginInvocation, 'function', 'shared module-runner helper should expose buildModuleValidatorPluginInvocation');
assert.equal(typeof sharedMod.normalizeModuleBusterWorkerResult, 'function', 'shared module-runner helper should expose normalizeModuleBusterWorkerResult');
assert.equal(typeof forgeMod.runModuleForgePhase, 'function', 'forge helper should expose runModuleForgePhase');
assert.equal(typeof forgeMod.finalizeForgeOnlyPass, 'function', 'forge helper should expose finalizeForgeOnlyPass');
assert.equal(typeof prebusterMod.prepareModuleForBuster, 'function', 'pre-Buster helper should expose prepareModuleForBuster');
assert.equal(typeof attemptMod.executeModuleAttempt, 'function', 'attempt helper should expose executeModuleAttempt');
assert.equal(typeof stateMachineMod.runModuleAttemptStateMachine, 'function', 'state machine should expose runModuleAttemptStateMachine');
assert.equal(typeof stateMachineMod.planModuleAttemptPhase, 'function', 'state machine should expose phase planner');
assert.equal(typeof preflightMod.runModulePreflight, 'function', 'preflight helper should expose runModulePreflight');
assert.equal(typeof busterPhaseMod.runModuleBusterPhase, 'function', 'Buster phase helper should expose runModuleBusterPhase');
assert.equal(typeof busterDispatchMod.executeBusterAttemptDispatch, 'function', 'Buster phase dispatch helper should expose executeBusterAttemptDispatch');
assert.equal(typeof terminalResultsMod.buildModulePassTerminalResult, 'function', 'terminal result helper should expose typed module PASS builder');
assert.equal(stateMachineMod.planLoadedModuleStatus({ status: 'PASS' }), stateMachineMod.MODULE_ATTEMPT_ACTIONS.TERMINAL_PASS, 'state machine should route existing PASS to terminal pass');
assert.equal(stateMachineMod.planLoadedModuleStatus({ status: 'BLOCKED' }), stateMachineMod.MODULE_ATTEMPT_ACTIONS.TERMINAL_BLOCKED, 'state machine should route existing BLOCKED to terminal blocked');
assert.equal(stateMachineMod.planLoadedModuleStatus(null), stateMachineMod.MODULE_ATTEMPT_ACTIONS.RELEASE_BLUEPRINT, 'state machine should route missing status to blueprint release/init');
assert.equal(stateMachineMod.planModuleAttemptPhase({ status: 'PENDING' }, ['forge', 'buster']), stateMachineMod.MODULE_ATTEMPT_ACTIONS.RUN_FORGE, 'state machine should route pending full modules to Forge');
assert.equal(stateMachineMod.planModuleAttemptPhase({ status: 'READY_FOR_TESTING' }, ['forge']), stateMachineMod.MODULE_ATTEMPT_ACTIONS.FINALIZE_FORGE_ONLY, 'state machine should route forge-only ready modules to PASS finalization');
assert.equal(stateMachineMod.planModuleAttemptPhase({ status: 'READY_FOR_TESTING' }, ['forge', 'buster']), stateMachineMod.MODULE_ATTEMPT_ACTIONS.PREPARE_BUSTER, 'state machine should route ready full modules through pre-Buster preparation');

const emptySuiteDispatch = await busterDispatchMod.executeBusterAttemptDispatch({
  config: { _runId: 'run-empty-suite-dispatch', run_id: 'run-empty-suite-dispatch' },
  progress: {},
  moduleId: '01',
  mod: { title: 'Scaffold', test_suites: [] },
  dir: '01-scaffold',
  status: { status: 'READY_FOR_TESTING', fail_count: 0 },
  timeout: 1,
  maxFails: 3,
  deps: { nowMs: () => 1000 },
  busterModel: 'buster-model',
  maxBusterCrashRetries: 0,
  busterAttempt: 1,
});
assert.equal(emptySuiteDispatch.terminal?.retry, false, 'empty Buster suite dispatch should be terminal');
assert.equal(emptySuiteDispatch.terminal?.result?.reason, 'Buster dispatch requires a typed nonempty test_suites list', 'empty Buster suite dispatch should fail validation');
assert.equal(emptySuiteDispatch.terminal?.result?.diagnostics?.code, 'buster_test_suites_empty', 'empty Buster suite dispatch should expose typed diagnostics');

const forgeOnlyGitFailure = await forgeMod.finalizeForgeOnlyPass({
  config: { _runId: 'run-forge-only-git-failure' },
  moduleId: '01',
  mod: { title: 'Scaffold' },
  dir: '01-scaffold',
  status: { status: 'READY_FOR_TESTING', fail_count: 0, cost: {} },
  stages: ['forge'],
  deps: {
    gitCommitAndPush: async () => ({ committed: false, error: 'push rejected' }),
  },
});
assert.equal(forgeOnlyGitFailure.terminal?.result?.exit, 1, 'Forge-only Git publication failure must return EXIT_ERROR');
assert.equal(
  forgeOnlyGitFailure.terminal?.result?.reason,
  'Forge-only module cannot PASS without a durable Git commit: push rejected',
  'Forge-only Git publication failure must not soft-pass unpublished work',
);

async function assertMalformedPreBusterValidatorPreservesDiagnostic({ stageId, producerType, validation }) {
  const { registry, errors } = registryMod.buildPluginRegistry({ enabled: true, allowCustomModules: false, extraModulePaths: [], modules: {}, stageOwners: {}, restrictedCapabilityAllowlist: {} }, { throwOnError: false });
  assert.equal(errors.length, 0, `${stageId}: builtin registry should load`);
  const testRegistry = {
    ...registry,
    stageOwners: {
      ...registry.stageOwners,
      'validator.run': {
        ...registry.stageOwners['validator.run'],
        [stageId]: {
          ...registry.stageOwners['validator.run'][stageId],
          implementation: {
            run: async () => ({
              schemaVersion: 'v1',
              producerKind: 'validator',
              producerType,
              nextAction: 'pass',
            }),
          },
        },
      },
    },
  };
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), `contract-pre-buster-${producerType}-`));
  const modulesRoot = path.join(repoRoot, 'modules');
  const logRoot = path.join(repoRoot, '.swarm', 'logs');
  fs.mkdirSync(path.join(modulesRoot, '01-scaffold'), { recursive: true });
  const config = {
    project: `contract-pre-buster-${producerType}`,
    repo_root: repoRoot,
    paths: { modules_dir: modulesRoot, swarm_dir: path.join(repoRoot, '.swarm') },
    telemetry: { enabled: false },
    _runId: `run-contract-pre-buster-${producerType}`,
    run_id: `run-contract-pre-buster-${producerType}`,
    pluginRegistry: testRegistry,
  };
  const status = {
    module_id: '01',
    title: 'Scaffold',
    status: 'READY_FOR_TESTING',
    current_phase: null,
    fail_count: 0,
    validation: { ...validation },
    started_at: '2026-04-10T00:00:00.000Z',
    attempt_started_at: '2026-04-10T00:00:00.000Z',
    history: [],
  };
  const progress = {
    execution_order: ['01'],
    modules: { '01': { title: 'Scaffold', dir: '01-scaffold', stages: ['forge', 'buster'] } },
  };
  const prepared = await prebusterMod.prepareModuleForBuster({
    config,
    progress,
    moduleId: '01',
    mod: progress.modules['01'],
    dir: '01-scaffold',
    status,
    maxFails: 3,
    timeout: 30,
    stages: ['forge', 'buster'],
    deps: {
      handleFail: async () => { throw new Error('handleFail should not run for malformed validator contract'); },
      saveStatus: () => {},
      gitSyncBeforeBuster: async () => { throw new Error('git sync should not run after malformed validator contract'); },
      discord: async () => {},
    },
  });
  const terminalResult = prepared.terminal.result;
  assert.equal(terminalResult.exit, 1, `${stageId}: malformed validator should fail closed`);
  assert.equal(terminalResult.validator, stageId, `${stageId}: terminal result should identify validator`);
  assert.equal(terminalResult.validator_result, null, `${stageId}: malformed validator has no normalized result`);
  assert.equal(terminalResult.diagnostics.contract_invalid, true, `${stageId}: contract invalid flag`);
  assert.equal(terminalResult.diagnostics.contract_diagnostic.diagnosticType, 'plugin_contract_invalid', `${stageId}: diagnostic type`);
  assert.equal(terminalResult.diagnostics.contract_diagnostic.stageId, stageId, `${stageId}: diagnostic stage id`);
  assert.equal(terminalResult.diagnostics.contract_diagnostic.hookFamily, 'validator.run', `${stageId}: diagnostic hook family`);
  assert.equal(terminalResult.diagnostics.contract_diagnostic.moduleId, '01', `${stageId}: diagnostic module`);
  assert.equal(terminalResult.diagnostics.contract_diagnostic.producerType, producerType, `${stageId}: diagnostic producer`);
  assert.equal(terminalResult.diagnostics.contract_diagnostic.validationErrors.includes('diagnostics must be an object'), true, `${stageId}: validation error detail`);
  assert.equal(terminalResult.diagnostics.contract_diagnostic.rawResultPreview, undefined, `${stageId}: raw preview must be deleted`);
  assert.equal(terminalResult.diagnostics.contract_diagnostic.coercedResultPreview, undefined, `${stageId}: coerced preview must be deleted`);
  assert.equal(terminalResult.diagnostics.contract_diagnostic.rawResultSummary.redacted, true, `${stageId}: raw result summary is redacted`);
  assert.equal(terminalResult.diagnostics.contract_diagnostic.coercedResultSummary.redacted, true, `${stageId}: coerced result summary is redacted`);
}

await assertMalformedPreBusterValidatorPreservesDiagnostic({
  stageId: 'validator:delivery_lint',
  producerType: 'delivery_lint',
  validation: { attempt: 1, delivery_lint_passed: false, pre_check_passed: false },
});
await assertMalformedPreBusterValidatorPreservesDiagnostic({
  stageId: 'validator:pre_check',
  producerType: 'pre_check',
  validation: { attempt: 1, delivery_lint_passed: true, pre_check_passed: false },
});

quietConsole.restore();
console.log(JSON.stringify({ ok: true, checked: 112 }));
