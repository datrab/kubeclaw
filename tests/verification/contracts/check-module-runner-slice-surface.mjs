import { parseSourceRootArgs } from '../lib/contract-check-helpers.mjs';
import { installQuietRuntimeConsole } from '../lib/verification-console.mjs';
const quietConsole = installQuietRuntimeConsole({ label: 'contracts/check-module-runner-slice-surface' });
import fs from 'fs';
import os from 'os';
import path from 'path';
import assert from 'assert';
import { pathToFileURL } from 'url';

function contractRunConfig(runId, prefix) {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
  return {
    project: prefix,
    _runId: runId,
    run_id: runId,
    repo_root: repoRoot,
    paths: {
      swarm_dir: path.join(repoRoot, '.swarm'),
      modules_dir: path.join(repoRoot, 'modules'),
    },
  };
}


const { sourceRoot } = parseSourceRootArgs();
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
const moduleRunnerCompletionsPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/module-runner/completions.ts');
const terminalResultsPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/module-runner/terminal-results.ts');
const contextPath = path.join(sourceRoot, 'skills/nova/pipeline/core/context.ts');
const registryPath = path.join(sourceRoot, 'skills/nova/pipeline/core/registry.ts');
const registryAccessPath = path.join(sourceRoot, 'skills/nova/pipeline/core/registry-access.ts');
const registryBuiltinsPath = path.join(sourceRoot, 'skills/nova/pipeline/core/registry/builtins.ts');
const constantsPath = path.join(sourceRoot, 'skills/nova/pipeline/core/constants.ts');
const pluginContextRuntimePath = path.join(sourceRoot, 'skills/nova/pipeline/core/plugin-context-runtime.ts');

const moduleRunnerSource = fs.readFileSync(moduleRunnerPath, 'utf8');
const sharedSource = fs.readFileSync(sharedPath, 'utf8');
const helperSurfaceSource = [
  sharedSource,
  fs.readFileSync(path.join(sourceRoot, 'skills/nova/pipeline/runners/module-runner-runtime.ts'), 'utf8'),
  fs.readFileSync(path.join(sourceRoot, 'skills/nova/pipeline/runners/module-runner-buster-input.ts'), 'utf8'),
  fs.readFileSync(path.join(sourceRoot, 'skills/nova/pipeline/runners/module-runner-plugin-contracts.ts'), 'utf8'),
].join('\n');
const forgeSource = [
  fs.readFileSync(forgePath, 'utf8'),
  fs.readFileSync(path.join(sourceRoot, 'skills/nova/pipeline/runners/module-runner-forge-setup.ts'), 'utf8'),
  fs.readFileSync(path.join(sourceRoot, 'skills/nova/pipeline/runners/module-runner-forge-worker.ts'), 'utf8'),
  fs.readFileSync(path.join(sourceRoot, 'skills/nova/pipeline/runners/module-runner-forge-success.ts'), 'utf8'),
  fs.readFileSync(path.join(sourceRoot, 'skills/nova/pipeline/runners/module-runner-forge-failures.ts'), 'utf8'),
].join('\n');
const prebusterSource = fs.readFileSync(prebusterPath, 'utf8');
const attemptSource = fs.readFileSync(attemptPath, 'utf8');
const stateMachineSource = fs.readFileSync(stateMachinePath, 'utf8');
const preflightSource = fs.readFileSync(preflightPath, 'utf8');
const orchestrationSource = fs.readFileSync(path.join(sourceRoot, 'skills/nova/pipeline/agents/orchestration.ts'), 'utf8');
const busterPhaseSource = fs.readFileSync(busterPhasePath, 'utf8');
const busterDispatchSource = fs.readFileSync(busterDispatchPath, 'utf8');
const busterPollFailureSource = [
  fs.readFileSync(busterPollFailurePath, 'utf8'),
  fs.readFileSync(path.join(sourceRoot, 'skills/nova/pipeline/runners/module-runner/buster-phase/poll-failure-crash.ts'), 'utf8'),
  fs.readFileSync(path.join(sourceRoot, 'skills/nova/pipeline/runners/module-runner/buster-phase/poll-failure-special.ts'), 'utf8'),
].join('\n');
const busterTerminalFailureSource = [
  fs.readFileSync(busterTerminalFailurePath, 'utf8'),
  fs.readFileSync(path.join(sourceRoot, 'skills/nova/pipeline/runners/module-runner/buster-phase/terminal-failure-infrastructure.ts'), 'utf8'),
  fs.readFileSync(path.join(sourceRoot, 'skills/nova/pipeline/runners/module-runner/buster-phase/terminal-failure-pretest.ts'), 'utf8'),
].join('\n');
const moduleRunnerCompletionsSource = fs.readFileSync(moduleRunnerCompletionsPath, 'utf8');
const terminalResultsSource = fs.readFileSync(terminalResultsPath, 'utf8');
const contextSource = [
  fs.readFileSync(contextPath, 'utf8'),
  fs.readFileSync(path.join(sourceRoot, 'skills/nova/pipeline/core/plugin-context-surfaces.ts'), 'utf8'),
].join('\n');
const registrySource = fs.readFileSync(registryPath, 'utf8');
const registryAccessSource = fs.readFileSync(registryAccessPath, 'utf8');
const registryBuiltinsSource = fs.readFileSync(registryBuiltinsPath, 'utf8');
const registryRuntimeSource = [
  registrySource,
  registryBuiltinsSource,
  fs.readFileSync(path.join(sourceRoot, 'skills/nova/pipeline/core/registry/builtin-bridge.ts'), 'utf8'),
  fs.readFileSync(path.join(sourceRoot, 'skills/nova/pipeline/core/registry/builtin-workers.ts'), 'utf8'),
].join('\n');
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
  assert.equal(helperSurfaceSource.includes(marker), true, `module-runner helper surface must export ${marker}`);
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
assert.equal(attemptSource.includes('assertTypedModuleAttemptTerminal('), true, 'module-runner attempt should assert typed terminal outcomes before returning to facade');
assert.equal(attemptSource.includes('buildModuleStepResult'), false, 'module-runner attempt must not call deleted module step compatibility reconstruction');
assert.equal(attemptSource.includes('function buildTypedModuleAttemptResult('), false, 'module-runner attempt must not keep module terminal fallback projection');
assert.equal(attemptSource.includes('moduleTerminalOutcomeForResult('), false, 'module-runner attempt must not infer terminal outcomes from legacy result fields');
assert.equal(attemptSource.includes('assertPipelineStepResult(terminal.result)'), true, 'module-runner attempt boundary must fail closed on non-typed terminal results');
assert.equal(sharedSource.includes('export function buildModuleStepResult('), false, 'shared module-runner helper must delete buildModuleStepResult compatibility reconstruction');
assert.equal(attemptSource.includes('resolveResultAttempt(rawResult)'), false, 'module terminal fallback projection must be deleted');
assert.equal(stateMachineSource.includes('return runModuleForgePhase(input);'), true, 'state machine should delegate Forge phase execution through the extracted helper');
assert.equal(stateMachineSource.includes('await finalizeForgeOnlyPass(input)'), true, 'state machine should delegate forge-only pass promotion through the extracted helper');
assert.equal(stateMachineSource.includes('await prepareModuleForBuster({'), true, 'state machine should delegate pre-Buster preparation through the extracted helper');
assert.equal(stateMachineSource.includes('await runModuleBusterPhase({'), true, 'state machine should delegate Buster phase execution through the extracted helper');
assert.equal(forgeSource.includes('await runModulePreflight(context)'), true, 'Forge phase should delegate preflight validation through the extracted helper');
assert.equal(forgeSource.includes('{ softFail: true }'), false, 'Forge-only PASS must not use soft-fail Git publication');
assert.equal(forgeSource.includes('Forge-only module cannot PASS without durable Git persistence'), true, 'Forge-only thrown Git publication failures must stop PASS');
assert.equal(forgeSource.includes('Forge-only module cannot PASS without a durable Git commit'), true, 'Forge-only non-committed Git results must stop PASS');
assert.equal(forgeSource.includes("|| 'forge'"), false, 'Forge ACP dispatch must not fall back to a literal forge agent id');
assert.equal(forgeSource.includes('requires explicit agents.forge.acp_agent_id'), true, 'Forge ACP dispatch must fail closed when no agent id authority exists');
assert.equal(orchestrationSource.includes('opts.attempt || 1') || orchestrationSource.includes('opts.dispatch_id || `buster-'), false, 'Buster Redis payload construction must not default attempt or synthesize dispatch identity');
assert.equal(busterDispatchSource.includes('Buster dispatch requires a typed nonempty test_suites list'), true, 'Buster dispatch must fail when requested suites are missing');
assert.equal(busterDispatchSource.includes("requestedSuites.join(', ')"), true, 'Buster queued notification should render the validated typed suite list');
assert.equal(busterDispatchSource.includes("|| 'none'"), false, 'Buster queued notification must not render missing suites as none');
assert.equal(busterDispatchSource.includes("value: 'none'"), false, 'Buster queued notification must not use a none fallback for suites');
assert.equal(busterPhaseSource.includes('?? 2'), false, 'Buster crash retry policy must not use an anonymous literal fallback');
assert.equal(busterPhaseSource.includes('mod.max_buster_crash_retries'), false, 'Buster crash retry policy must use platform config, not module override policy');
assert.equal(busterPhaseSource.includes('getBusterRuntimeConfig(config)'), true, 'Buster crash retry policy must be read from required runtime policy config');
assert.equal(forgeSource.includes('poll_result'), false, 'Forge worker routing must not read poll_result compatibility metadata');
assert.equal(busterPhaseSource.includes('poll_result'), false, 'Buster worker routing must not read poll_result compatibility metadata');
assert.equal(busterPollFailureSource.includes('poll_result'), false, 'Buster poll-failure routing must not read poll_result compatibility metadata');
assert.equal(busterPhaseSource.includes('ok: busterWorkerControlResult?.nextAction ==='), false, 'Buster worker routing must use typed final status or real poll evidence, not synthetic ok/status objects');
assert.equal(busterPollFailureSource.includes("if (reasonCode === 'git_error')"), true, 'Buster polling Git failures must have an explicit fail-closed branch');
assert.equal(busterPollFailureSource.includes('buildModuleErrorTerminalResult(config, moduleId'), true, 'Buster polling Git failures must return typed terminal error outcome');
assert.equal(busterPollFailureSource.includes('polling_git:'), true, 'Buster polling Git failures must expose operator-visible Git evidence');
assert.equal(busterPollFailureSource.includes('buildModuleRateLimitedTerminalResult(config, moduleId'), true, 'Buster polling rate-limit exhaustion must return typed rate-limited module result');
assert.equal(busterTerminalFailureSource.includes('buildModuleNeedsNovaTerminalResult(config, moduleId'), true, 'Terminal Buster needs-Nova outcomes must be typed module results');
assert.equal(busterTerminalFailureSource.includes('buildModuleBlockedTerminalResult(config, moduleId'), true, 'Terminal Buster blocked outcomes must be typed module results');
assert.equal(busterTerminalFailureSource.includes("'repeated pre-test result gateway label'"), false, 'Repeated Buster pre-test terminal failures must not require gateway-label metadata as completion authority');
assert.equal(busterTerminalFailureSource.includes("reasonCode: 'test_failure'"), true, 'Repeated Buster pre-test terminal failures must preserve module test_failure authority');
assert.equal(busterTerminalFailureSource.includes("requireNonEmptyString(completionIdentity?.runId, 'completionIdentity.runId')"), true, 'Terminal Buster invalid failure-class results must require typed completion run authority');
assert.equal(busterTerminalFailureSource.includes("requirePositiveAttempt(currentAttemptNumber(status), 'current status attempt')"), true, 'Terminal Buster pre-test results must require typed status attempt authority');
assert.equal(fs.existsSync(path.join(sourceRoot, 'skills/nova/pipeline/runners/module-runner/buster-phase/terminal-pass.ts')), false, 'Buster PASS must not keep stale terminal-pass wrapper');
assert.equal(busterPhaseSource.includes('function finalizeBusterPassCompletion('), true, 'Buster PASS must finalize at the phase boundary');
assert.equal(busterPhaseSource.includes('attempt: completionIdentity.attempt'), true, 'Buster PASS results must use completion attempt authority');
assert.equal(moduleRunnerCompletionsSource.includes('applyModuleRunnerCompletion requires completion authority'), true, 'module runner completions must require explicit authority');
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
assert.equal(prebusterSource.includes('assertPipelineStepResult(failResult)'), true, 'pre-Buster non-retry validator failures must assert canonical typed handleFail results');
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
assert.equal(registryAccessSource.includes('Absence means no observer/sink is\n// registered'), true, 'registry access must document optional hook listener absence semantics');
assert.equal(fs.existsSync(pluginContextRuntimePath), false, 'PluginContext must not keep the hidden WeakMap runtime binding helper');
assert.equal(contextSource.includes('bindPluginContextRuntime'), false, 'PluginContext must not bind runtime through hidden compatibility helpers');
assert.equal(registryRuntimeSource.includes('getRuntimeConfigFromPluginContext'), false, 'built-in registry must use explicit coreRuntime instead of hidden context getters');
assert.equal(registryRuntimeSource.includes('ctx.coreRuntime.readConfig()'), true, 'built-in registry should read runtime config through explicit coreRuntime');
assert.equal(contextSource.includes("Object.defineProperty(pluginContext, 'coreRuntime'"), true, 'PluginContext should expose explicit non-enumerable coreRuntime only for built-ins');
assert.equal(contextSource.includes('workerRuntime: objectRecord(value.workerRuntime) ?? {}'), true, 'PluginContext should resolve the core worker runtime adapter effects through typed record normalization');
assert.equal(contextSource.includes("['dispatch.worker_runtime', 'workerRuntime', 'dispatch'"), true, 'PluginContext should declare worker runtime dispatch under the renamed capability');
assert.equal(contextSource.includes('pluginContext[namespace]'), true, 'PluginContext should expose capability-gated trusted runtime surfaces');
assert.equal(registryRuntimeSource.includes('ctx.workerRuntime.dispatch('), true, 'built-in worker stage owners should call the trusted worker runtime adapter');
assert.equal(constantsSource.includes('dispatch.worker_runtime'), true, 'capability registry should use dispatch.worker_runtime');
assert.equal(moduleRunnerSource.includes('function buildModuleForgeRunInput('), false, 'module-runner must not keep a local Forge run-input builder');
assert.equal(moduleRunnerSource.includes('function buildModuleBusterRunInput('), false, 'module-runner must not keep a local Buster run-input builder');
assert.equal(moduleRunnerSource.includes('function normalizeModuleForgeWorkerResult('), false, 'module-runner must not keep a local Forge worker-result normalizer');
assert.equal(moduleRunnerSource.includes('function normalizeModuleBusterWorkerResult('), false, 'module-runner must not keep a local Buster worker-result normalizer');

const sharedMod = await import(pathToFileURL(sharedPath).href);
const busterInputMod = await import(pathToFileURL(path.join(sourceRoot, 'skills/nova/pipeline/runners/module-runner-buster-input.ts')).href);
const pluginContractsMod = await import(pathToFileURL(path.join(sourceRoot, 'skills/nova/pipeline/runners/module-runner-plugin-contracts.ts')).href);
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
assert.equal(typeof busterInputMod.buildModuleBusterRunInput, 'function', 'Buster input owner should expose buildModuleBusterRunInput');
assert.equal(typeof pluginContractsMod.buildModuleWorkerPluginInvocation, 'function', 'plugin contract owner should expose buildModuleWorkerPluginInvocation');
assert.equal(typeof pluginContractsMod.buildModuleValidatorPluginInvocation, 'function', 'plugin contract owner should expose buildModuleValidatorPluginInvocation');
assert.equal(typeof busterInputMod.normalizeModuleBusterWorkerResult, 'function', 'Buster input owner should expose normalizeModuleBusterWorkerResult');
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
assert.equal(typeof terminalResultsMod.buildModuleErrorTerminalResult, 'function', 'terminal result helper should expose typed module ERROR builder');
const explicitRunTerminal = terminalResultsMod.buildModuleErrorTerminalResult(
  { _runId: 'config-run' },
  '01',
  { reason: 'explicit completion run', runId: 'completion-run' },
);
assert.equal(explicitRunTerminal.result.correlation.run_id, 'completion-run', 'module terminal helper must preserve authoritative completion run id');
const persistedBlockedTerminal = terminalResultsMod.buildBlockedTerminalResult(
  { _runId: 'config-run' },
  { status: 'BLOCKED', run_id: 'persisted-terminal-run', fail_count: 2 },
  '01',
);
assert.equal(persistedBlockedTerminal.result.correlation.run_id, 'persisted-terminal-run', 'blocked terminal helper must preserve persisted status run id');
const typedRateLimitTerminal = terminalResultsMod.buildModuleRateLimitedTerminalResult(
  { _runId: 'config-run' },
  '01',
  {
    reason: 'rate limited',
    runId: 'rate-limit-run',
    attempt: 3,
    rateLimitResult: {
      max_rate_limit_pauses: 4,
      rate_limit_status: { max_rate_limit_pauses: 4, session_key: 'agent:rate-limit' },
    },
  },
);
assert.equal(typedRateLimitTerminal.result.outcome, 'rate_limited', 'rate-limit terminal helper must emit typed rate-limited outcome');
assert.equal(typedRateLimitTerminal.result.rateLimit.max_rate_limit_pauses, 4, 'rate-limit terminal helper must preserve typed rate-limit evidence');
assert.equal(typedRateLimitTerminal.result.rateLimit.rate_limit_status.session_key, 'agent:rate-limit', 'rate-limit terminal helper must preserve rate-limit status evidence');
assert.equal(Object.prototype.hasOwnProperty.call(typedRateLimitTerminal.result.diagnostics.metadata, 'rate_limit_status'), false, 'rate-limit terminal helper must not duplicate rate-limit status into diagnostic metadata');
assert.equal(Object.prototype.hasOwnProperty.call(typedRateLimitTerminal.result.diagnostics.metadata, 'max_rate_limit_pauses'), false, 'rate-limit terminal helper must not duplicate max pauses into diagnostic metadata');
assert.equal(stateMachineMod.planLoadedModuleStatus({ status: 'PASS' }), stateMachineMod.MODULE_ATTEMPT_ACTIONS.TERMINAL_PASS, 'state machine should route existing PASS to terminal pass');
assert.equal(stateMachineMod.planLoadedModuleStatus({ status: 'BLOCKED' }), stateMachineMod.MODULE_ATTEMPT_ACTIONS.TERMINAL_BLOCKED, 'state machine should route existing BLOCKED to terminal blocked');
assert.equal(stateMachineMod.planLoadedModuleStatus(null), stateMachineMod.MODULE_ATTEMPT_ACTIONS.RELEASE_BLUEPRINT, 'state machine should route missing status to blueprint release/init');
assert.equal(stateMachineMod.planModuleAttemptPhase({ status: 'PENDING' }, ['forge', 'buster']), stateMachineMod.MODULE_ATTEMPT_ACTIONS.RUN_FORGE, 'state machine should route pending full modules to Forge');
assert.equal(stateMachineMod.planModuleAttemptPhase({ status: 'READY_FOR_TESTING' }, ['forge']), stateMachineMod.MODULE_ATTEMPT_ACTIONS.FINALIZE_FORGE_ONLY, 'state machine should route forge-only ready modules to PASS finalization');
assert.equal(stateMachineMod.planModuleAttemptPhase({ status: 'READY_FOR_TESTING' }, ['forge', 'buster']), stateMachineMod.MODULE_ATTEMPT_ACTIONS.PREPARE_BUSTER, 'state machine should route ready full modules through pre-Buster preparation');

const emptySuiteDispatch = await busterDispatchMod.executeBusterAttemptDispatch({
  config: contractRunConfig('run-empty-suite-dispatch', 'contract-empty-suite-dispatch'),
  progress: {},
  moduleId: '01',
  mod: { title: 'Scaffold', test_suites: [] },
  dir: '01-scaffold',
  status: {
    status: 'READY_FOR_TESTING',
    fail_count: 0,
    dispatch_id: 'dispatch-empty-suite',
    gateway_label: 'buster-empty-suite',
    session_key: 'session-empty-suite',
  },
  timeout: 1,
  maxFails: 3,
  deps: { nowMs: () => 1000 },
  busterModel: 'buster-model',
  maxBusterCrashRetries: 0,
  busterAttempt: 1,
});
assert.equal(emptySuiteDispatch.terminal?.retry, false, 'empty Buster suite dispatch should be terminal');
assert.equal(emptySuiteDispatch.terminal?.result?.diagnostics?.summary, 'Buster dispatch requires a typed nonempty test_suites list', 'empty Buster suite dispatch should fail validation');
assert.equal(emptySuiteDispatch.terminal?.result?.diagnostics?.metadata?.code, 'buster_test_suites_empty', 'empty Buster suite dispatch should expose typed diagnostics');

const forgeOnlyGitFailure = await forgeMod.finalizeForgeOnlyPass({
  config: contractRunConfig('run-forge-only-git-failure', 'contract-forge-only-git-failure'),
  moduleId: '01',
  mod: { title: 'Scaffold' },
  dir: '01-scaffold',
  status: { status: 'READY_FOR_TESTING', fail_count: 0, cost: {} },
  stages: ['forge'],
  deps: {
    gitCommitAndPush: async () => ({ committed: false, error: 'push rejected' }),
  },
});
assert.equal(forgeOnlyGitFailure.terminal?.result?.outcome, 'error', 'Forge-only Git publication failure must return typed terminal error outcome');
assert.equal(
  forgeOnlyGitFailure.terminal?.result?.diagnostics?.summary,
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
    dispatch_id: `dispatch-contract-pre-buster-${producerType}`,
    gateway_label: `gateway-contract-pre-buster-${producerType}`,
    session_key: `session-contract-pre-buster-${producerType}`,
    validation: { ...validation },
    started_at: '2026-04-10T00:00:00.000Z',
    attempt_started_at: '2026-04-10T00:00:00.000Z',
    history: [],
  };
  const progress = {
    execution_order: ['01'],
    modules: { '01': { title: 'Scaffold', dir: '01-scaffold', stages: ['forge', 'buster'] } },
  };
  const savedStatuses = [];
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
      applyModuleCompletion: (_config, _dir, savedStatus, completion) => {
        savedStatus.status = completion.status === 'BLOCKED' ? 'BLOCKED' : 'FAIL';
        savedStatus.current_phase = null;
        savedStatus.blockedPhase = completion.phase;
        savedStatus.blockedReason = completion.summary;
        const lifecycleMutation = { eventType: 'module_attempt.blocked', completion };
        savedStatuses.push({ status: { ...savedStatus }, lifecycleTransition: { lifecycleMutation } });
        return { status: savedStatus, lifecycleMutation };
      },
      saveStatus: (_config, _dir, savedStatus, lifecycleTransition) => {
        savedStatuses.push({ status: { ...savedStatus }, lifecycleTransition });
      },
      gitSyncBeforeBuster: async () => { throw new Error('git sync should not run after malformed validator contract'); },
      discord: async () => {},
    },
  });
  const terminalResult = prepared.terminal.result;
  assert.equal(terminalResult.outcome, 'error', `${stageId}: malformed validator should fail closed with typed terminal error`);
  assert.equal(terminalResult.diagnostics.metadata.validator, stageId, `${stageId}: terminal result should identify validator`);
  assert.equal(terminalResult.diagnostics.metadata.validator_result, null, `${stageId}: malformed validator has no normalized result`);
  assert.equal(terminalResult.diagnostics.contract_invalid, true, `${stageId}: contract invalid flag`);
  assert.equal(terminalResult.diagnostics.contract_diagnostic.diagnosticType, 'plugin_contract_invalid', `${stageId}: diagnostic type`);
  assert.equal(terminalResult.diagnostics.contract_diagnostic.stageId, stageId, `${stageId}: diagnostic stage id`);
  assert.equal(terminalResult.diagnostics.contract_diagnostic.hookFamily, 'validator.run', `${stageId}: diagnostic hook family`);
  assert.equal(terminalResult.diagnostics.contract_diagnostic.moduleId, '01', `${stageId}: diagnostic module`);
  assert.equal(terminalResult.diagnostics.contract_diagnostic.producerType, producerType, `${stageId}: diagnostic producer`);
  assert.equal(terminalResult.diagnostics.contract_diagnostic.validationErrors.includes('diagnostics must be an object'), true, `${stageId}: validation error detail`);
  assert.equal(terminalResult.diagnostics.contract_diagnostic.rawResultPreview, undefined, `${stageId}: raw preview must be deleted`);
  assert.equal(terminalResult.diagnostics.contract_diagnostic.coercedResultPreview, undefined, `${stageId}: coerced preview must be deleted`);
  assert.equal(terminalResult.diagnostics.contract_diagnostic.rawResultSummary.label, 'rawResult', `${stageId}: raw result summary label`);
  assert.equal(terminalResult.diagnostics.contract_diagnostic.coercedResultSummary.label, 'coercedResult', `${stageId}: coerced result summary label`);
  assert.equal(Number.isInteger(terminalResult.diagnostics.contract_diagnostic.rawResultSummary.json_bytes), true, `${stageId}: raw result summary is bounded`);
  assert.equal(Number.isInteger(terminalResult.diagnostics.contract_diagnostic.coercedResultSummary.json_bytes), true, `${stageId}: coerced result summary is bounded`);
  assert.equal(savedStatuses.at(-1)?.status.status, 'BLOCKED', `${stageId}: validator block should persist module BLOCKED status`);
  assert.equal(savedStatuses.at(-1)?.status.blockedPhase, producerType, `${stageId}: validator block should persist canonical blockedPhase`);
  assert.equal(savedStatuses.at(-1)?.lifecycleTransition?.lifecycleMutation?.eventType, 'module_attempt.blocked', `${stageId}: validator block should emit lifecycle blocked event`);
}

await assertMalformedPreBusterValidatorPreservesDiagnostic({
  stageId: 'validator:pre_check',
  producerType: 'pre_check',
  validation: { attempt: 1, delivery_lint_passed: true, pre_check_passed: false },
});

quietConsole.restore();
console.log(JSON.stringify({ ok: true, checked: 111 }));
