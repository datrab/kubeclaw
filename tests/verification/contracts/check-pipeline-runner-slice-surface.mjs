import { installQuietRuntimeConsole } from '../lib/verification-console.mjs';
const quietConsole = installQuietRuntimeConsole({ label: 'contracts/check-pipeline-runner-slice-surface' });
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
const mainPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/pipeline-runner.ts');
const sharedPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/pipeline-runner-shared.ts');
const schedulingPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/pipeline-runner-scheduling.ts');
const validatorCompletionsPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/pipeline-runner-scheduling/validator-completions.ts');
const recoveryPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/pipeline-runner-recovery.ts');
const lockPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/pipeline-runner-lock.ts');
const depsPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/pipeline-runner-deps.ts');
const startPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/pipeline-runner-start.ts');
const loopPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/pipeline-runner-loop.ts');
const stateMachinePath = path.join(sourceRoot, 'skills/nova/pipeline/runners/pipeline-runner-state-machine.ts');
const terminalPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/pipeline-runner-terminal.ts');
const openClawPluginRuntimePath = path.join(sourceRoot, 'skills/nova/pipeline/services/openclaw-plugin-runtime.ts');
const agentObservabilityRuntimePath = path.join(sourceRoot, 'skills/nova/pipeline/services/agent-observability-runtime.ts');

const mainSource = fs.readFileSync(mainPath, 'utf8');
const sharedSource = fs.readFileSync(sharedPath, 'utf8');
const schedulingSource = fs.readFileSync(schedulingPath, 'utf8');
const validatorCompletionsSource = fs.readFileSync(validatorCompletionsPath, 'utf8');
const recoverySource = fs.readFileSync(recoveryPath, 'utf8');
const lockSource = fs.readFileSync(lockPath, 'utf8');
const depsSource = fs.readFileSync(depsPath, 'utf8');
const startSource = fs.readFileSync(startPath, 'utf8');
const loopSource = fs.readFileSync(loopPath, 'utf8');
const stateMachineSource = fs.readFileSync(stateMachinePath, 'utf8');
const terminalSource = fs.readFileSync(terminalPath, 'utf8');
const openClawPluginRuntimeSource = fs.readFileSync(openClawPluginRuntimePath, 'utf8');
const agentObservabilityRuntimeSource = fs.readFileSync(agentObservabilityRuntimePath, 'utf8');

for (const marker of [
  "from './pipeline-runner-shared.ts'",
  "from './pipeline-runner-recovery.ts'",
  "from './pipeline-runner-deps.ts'",
  "from './pipeline-runner-start.ts'",
  "from './pipeline-runner-loop.ts'",
  "from '../services/openclaw-plugin-runtime.ts'",
  'await openClawAgentObserverPlugin.start();',
  'await startPipelineRun(config, progress, runOpts);',
  'return await runPipelineLoop(config, progress, runOpts);',
  'await openClawAgentObserverPlugin.stop();',
]) {
  assert.equal(mainSource.includes(marker), true, `pipeline-runner should include ${marker}`);
}

for (const marker of [
  "from '../services/contracts/pipeline-step-result.ts'",
  'function normalizeStepResultForPipeline(',
  'async function finalizeTerminalHalt(',
  'pipelineStepDiagnosticSummary(stepResult)',
  'pipelineStepRateLimitDetails(stepResult)',
  'rate_limit_authority: typedRateLimit.source',
  'scheduleProjectSummaryOnBlocked',
  'invalid_step_result_rejected',
  'const operatorReason = typedOperatorReason;',
]) {
  assert.equal(terminalSource.includes(marker), true, `pipeline-runner terminal helper should include ${marker}`);
}

for (const marker of [
  'compatibility_authority_rejected',
  'compatibilityStatus',
]) {
  assert.equal(`${terminalSource}\n${sharedSource}`.includes(marker), false, `pipeline runner should not retain stale compatibility naming: ${marker}`);
}

for (const marker of [
  'export async function startPipelineRun(',
  'export async function runSingleModulePipeline(',
  'export async function preparePipelineStart(',
]) {
  assert.equal(startSource.includes(marker), true, `pipeline-runner start helper should include ${marker}`);
}

for (const marker of [
  'export async function runValidatorStep(',
  'export async function runPipelineLoop(',
  "from './pipeline-runner-state-machine.ts'",
  'return runPipelineStateMachine({',
]) {
  assert.equal(loopSource.includes(marker), true, `pipeline-runner loop helper should include ${marker}`);
}

for (const marker of [
  'export const PIPELINE_RUNNER_ACTIONS',
  'export function planPipelineStep(',
  'export async function runPipelineStateMachine(',
  'normalizeStepResultForPipeline(result,',
  'resumeDurableCooldownForStep(config, progress, next,',
]) {
  assert.equal(stateMachineSource.includes(marker), true, `pipeline-runner state machine should include ${marker}`);
}

for (const marker of [
  'export const DEFAULT_PIPELINE_RUNNER_DEPS',
  'export function getPipelineRunnerDeps(',
]) {
  assert.equal(depsSource.includes(marker), true, `pipeline-runner deps helper should include ${marker}`);
}

assert.equal(mainSource.includes('if (result.exit !== EXIT_OK) return haltPipeline'), false, 'pipeline-runner full scheduler must not decide from compatibility result.exit after step-result cutover');
assert.equal(mainSource.includes('result.exit'), false, 'pipeline-runner must not branch or project single-module lifecycle from raw result.exit');
assert.equal(mainSource.includes('result?.exit'), false, 'pipeline-runner must not accept optional raw result?.exit scheduler authority');
assert.equal(startSource.includes('result.exit'), false, 'pipeline-runner start helper must not branch or project from raw result.exit');
assert.equal(startSource.includes('result?.exit'), false, 'pipeline-runner start helper must not accept optional raw result?.exit scheduler authority');
assert.equal(terminalSource.includes('Number.isInteger(result?.exit)'), false, 'pipeline-runner terminal halt must not derive process projection from raw result.exit');
assert.equal(terminalSource.includes('shouldInjectNeedsNovaForExit'), false, 'pipeline-runner terminal halt must inject handoff from typed terminal status, not exit code');
assert.equal(terminalSource.includes('shouldEmitEscalationForExit'), false, 'pipeline-runner terminal halt must escalate from typed terminal status, not exit code');
assert.equal(sharedSource.includes('result?.exit !== EXIT_BLOCKED'), false, 'pipeline-runner correlation exposure must not branch on numeric blocked exit');
assert.equal(terminalSource.includes('correlatedResult?.rate_limit_exhausted'), false, 'pipeline-runner terminal halt must not read legacy rate-limit exhausted authority from compatibility projection');
assert.equal(terminalSource.includes('correlatedResult?.rate_limit_status?.rate_limit_exhausted'), false, 'pipeline-runner terminal halt must not read nested legacy rate-limit authority from compatibility projection');

for (const marker of [
  'export function buildEscalationPayload(',
  'export function buildPipelineHaltPayload(',
  'export function loadAuthoritativeModuleState(',
  'export function buildBlockedModuleResult(',
  'export function buildResultWithStepCorrelation(',
  'export function projectPipelineGateState(',
]) {
  assert.equal(sharedSource.includes(marker), true, `pipeline-runner shared helper must export ${marker}`);
}

for (const marker of [
  'export function validateGeneratorExecutionResult(',
  'export async function runScheduledValidator(',
  'export async function runScheduledGenerator(',
  'export function findNextStep(',
  'export async function preparePipeline(',
]) {
  assert.equal(schedulingSource.includes(marker), true, `pipeline-runner scheduling helper must export ${marker}`);
}

assert.equal(sharedSource.includes('buildPipelineDiscordFields'), false, 'pipeline-runner shared must not keep a local Discord identity wrapper');
assert.equal(`${startSource}\n${recoverySource}\n${terminalSource}`.includes('buildDiscordIdentitySurfaceFields'), true, 'pipeline Discord callers should use canonical identity surface fields directly');
assert.equal(`${startSource}\n${recoverySource}\n${terminalSource}`.includes('DISCORD_IDENTITY_SURFACES.PIPELINE'), true, 'pipeline Discord callers should use the canonical pipeline identity surface');
assert.equal(sharedSource.includes('projectGateSchedulerState('), true, 'pipeline shared gate projection should delegate to the generic gate scheduler state projection');
assert.equal(sharedSource.includes('projectModuleSchedulerState('), true, 'pipeline shared module state should delegate to the generic module scheduler state projection');
assert.equal(schedulingSource.includes('gate?.type'), false, 'pipeline scheduling should not branch on concrete gate types when skipping consumed gates');
assert.equal(schedulingSource.includes('gate.type'), false, 'pipeline scheduling should not branch on concrete gate types when skipping consumed gates');

for (const marker of [
  "export { PIPELINE_RUN_CONCURRENCY_LIMIT, acquirePipelineRunLock, releasePipelineRunLock } from './pipeline-runner-lock.ts';",
  'export async function reconcileStaleModuleState(',
  'export async function reconcileStaleGateSessions(',
]) {
  assert.equal(recoverySource.includes(marker), true, `pipeline-runner recovery helper must export ${marker}`);
}

for (const marker of [
  'export const PIPELINE_RUN_CONCURRENCY_LIMIT = 1;',
  'export function acquirePipelineRunLock(',
  'export function releasePipelineRunLock(',
]) {
  assert.equal(lockSource.includes(marker), true, `pipeline-runner lock helper must export ${marker}`);
}

assert.equal(recoverySource.includes('getModuleAttempt('), false, 'stale recovery must not invent attempts from module fail_count');
assert.equal(recoverySource.includes('active.gateway_label || active.label'), false, 'stale recovery must not treat diagnostic labels as gateway labels');
assert.equal(recoverySource.includes('diagnostic_label'), true, 'stale recovery should preserve non-gateway labels as diagnostic evidence only');

for (const disallowed of [
  'function buildGeneratorArtifactRefs(',
  'function buildGeneratorStateSnapshot(',
  'async function runScheduledValidator(',
  'function pipelineRunLockPath(',
  'async function reconcileStaleModuleState(',
  'async function reconcileStaleGateSessions(',
]) {
  assert.equal(mainSource.includes(disallowed), false, `pipeline-runner main surface must not keep extracted helper ${disallowed}`);
}

const mainMod = await import(pathToFileURL(mainPath).href);
const sharedMod = await import(pathToFileURL(sharedPath).href);
const schedulingMod = await import(pathToFileURL(schedulingPath).href);
const validatorCompletionsMod = await import(pathToFileURL(validatorCompletionsPath).href);
const recoveryMod = await import(pathToFileURL(recoveryPath).href);
const lockMod = await import(pathToFileURL(lockPath).href);
const depsMod = await import(pathToFileURL(depsPath).href);
const startMod = await import(pathToFileURL(startPath).href);
const loopMod = await import(pathToFileURL(loopPath).href);
const terminalMod = await import(pathToFileURL(terminalPath).href);
const stateMachineMod = await import(pathToFileURL(stateMachinePath).href);
const openClawPluginRuntimeMod = await import(pathToFileURL(openClawPluginRuntimePath).href);
const agentObservabilityRuntimeMod = await import(pathToFileURL(agentObservabilityRuntimePath).href);

for (const [mod, name] of [
  [mainMod, 'runPipeline'],
  [mainMod, 'printStatus'],
  [mainMod, 'dryRun'],
  [sharedMod, 'buildBlockedModuleResult'],
  [sharedMod, 'buildResultWithStepCorrelation'],
  [sharedMod, 'projectPipelineGateState'],
  [schedulingMod, 'runScheduledValidator'],
  [schedulingMod, 'runScheduledGenerator'],
  [schedulingMod, 'findNextStep'],
  [schedulingMod, 'preparePipeline'],
  [validatorCompletionsMod, 'scheduledValidatorCompletionPath'],
  [validatorCompletionsMod, 'markScheduledValidatorComplete'],
  [validatorCompletionsMod, 'isScheduledValidatorComplete'],
  [recoveryMod, 'acquirePipelineRunLock'],
  [recoveryMod, 'releasePipelineRunLock'],
  [lockMod, 'acquirePipelineRunLock'],
  [lockMod, 'releasePipelineRunLock'],
  [recoveryMod, 'reconcileStaleModuleState'],
  [recoveryMod, 'reconcileStaleGateSessions'],
  [depsMod, 'getPipelineRunnerDeps'],
  [startMod, 'startPipelineRun'],
  [startMod, 'runSingleModulePipeline'],
  [startMod, 'preparePipelineStart'],
  [loopMod, 'runValidatorStep'],
  [loopMod, 'runPipelineLoop'],
  [stateMachineMod, 'planPipelineStep'],
  [stateMachineMod, 'runPipelineStateMachine'],
  [terminalMod, 'normalizeStepResultForPipeline'],
  [terminalMod, 'finalizeTerminalHalt'],
  [terminalMod, 'completePipeline'],
  [terminalMod, 'haltPipeline'],
  [openClawPluginRuntimeMod, 'createOpenClawAgentObserverPluginController'],
  [agentObservabilityRuntimeMod, 'startAgentObservabilityIngester'],
]) {
  assert.equal(typeof mod[name], 'function', `${name} should be exported`);
}

for (const name of [
  'runScheduledGenerator',
  'findNextStep',
  'validateGeneratorExecutionResult',
  'acquirePipelineRunLock',
  'releasePipelineRunLock',
  'PIPELINE_RUN_CONCURRENCY_LIMIT',
]) {
  assert.equal(Object.hasOwn(mainMod, name), false, `pipeline-runner main module must not re-export helper ${name}`);
}
assert.equal(recoveryMod.PIPELINE_RUN_CONCURRENCY_LIMIT, 1, 'pipeline-runner recovery helper should own the run concurrency limit export');
assert.equal(stateMachineMod.planPipelineStep({ type: 'done' }).action, stateMachineMod.PIPELINE_RUNNER_ACTIONS.COMPLETE, 'pipeline state machine should plan done as complete');
assert.equal(stateMachineMod.planPipelineStep({ type: 'blocked', id: '01' }).action, stateMachineMod.PIPELINE_RUNNER_ACTIONS.HALT_BLOCKED, 'pipeline state machine should plan blocked as halt');
assert.equal(stateMachineMod.planPipelineStep({ type: 'validator', id: 'validator:architecture' }).action, stateMachineMod.PIPELINE_RUNNER_ACTIONS.RUN_VALIDATOR, 'pipeline state machine should plan validators explicitly');
assert.equal(stateMachineMod.planPipelineStep({ type: 'gate', id: 'review' }).action, stateMachineMod.PIPELINE_RUNNER_ACTIONS.RUN_GATE, 'pipeline state machine should plan gates explicitly');
assert.equal(stateMachineMod.planPipelineStep({ type: 'module', id: '01' }).action, stateMachineMod.PIPELINE_RUNNER_ACTIONS.RUN_MODULE, 'pipeline state machine should plan modules explicitly');
assert.throws(
  () => stateMachineMod.planPipelineStep({ type: 'legacy-module', id: '01' }),
  /Unknown typed pipeline step/,
  'pipeline state machine must fail unknown next-step types instead of defaulting to module',
);
assert.throws(
  () => stateMachineMod.planPipelineStep({ id: '01' }),
  /Unknown typed pipeline step/,
  'pipeline state machine must require explicit typed next-step kinds',
);

for (const marker of [
  "throw new Error(`Unknown typed pipeline step:",
  "next?.type === 'module' && next?.id",
]) {
  assert.equal(stateMachineSource.includes(marker), true, `pipeline state machine should include ${marker}`);
}
assert.equal(stateMachineSource.includes("return { action: PIPELINE_RUNNER_ACTIONS.RUN_MODULE, next };"), true, 'pipeline state machine should only run modules through the explicit module branch');
assert.equal(stateMachineSource.includes("if (next?.type === 'module' && next?.id)"), true, 'pipeline state machine module planning must require explicit module type and id');

assert.equal(schedulingSource.includes("Invalid execution_order step '${String(stepId)}': no typed module/gate/validator target exists"), true, 'pipeline scheduling must reject unknown execution_order targets');
assert.throws(
  () => schedulingMod.findNextStep({}, { execution_order: ['missing-module'], modules: {}, gates: {} }),
  /no typed module\/gate\/validator target exists/,
  'pipeline scheduling must fail unknown execution_order targets instead of treating them as module ids',
);

assert.equal(validatorCompletionsSource.includes('Scheduled validator completion state is unreadable and requires repair'), true, 'scheduled validator completions must fail closed on unreadable durable state');
assert.equal(validatorCompletionsSource.includes('warn'), false, 'scheduled validator completions must not warn-and-continue over unreadable durable state');
const corruptCompletionDir = fs.mkdtempSync(path.join(os.tmpdir(), 'contract-validator-completions-'));
const corruptCompletionConfig = { paths: { swarm_dir: corruptCompletionDir }, _runId: 'contract-corrupt-completions' };
const corruptCompletionRunDir = path.join(corruptCompletionDir, 'logs', 'pipeline', 'runs', 'contract-corrupt-completions');
fs.mkdirSync(corruptCompletionRunDir, { recursive: true });
fs.writeFileSync(path.join(corruptCompletionRunDir, 'scheduled-validator-completions.json'), '{not-json');
assert.throws(
  () => validatorCompletionsMod.isScheduledValidatorComplete(corruptCompletionConfig, 'lint-after-01'),
  /requires repair/,
  'corrupt scheduled validator completion state must require repair instead of being treated as empty',
);
fs.rmSync(corruptCompletionDir, { recursive: true, force: true });

assert.equal(recoverySource.includes("reason: 'stale_module_recovery_requires_session_evidence'"), true, 'stale no-session recovery must emit durable typed operator evidence');
assert.equal(recoverySource.includes("status_reset_to: 'unchanged'"), true, 'stale no-session recovery must leave module status unchanged');
assert.equal(recoverySource.includes('refusing age-only reset'), true, 'stale no-session recovery must refuse age-only reset');
assert.equal(recoverySource.includes('const recoveryTargetStatus = getRetryStatusForPhase(previousPhase);'), true, 'stale recovery retry status should only be reached after typed session evidence sets shouldReset');

assert.equal(schedulingSource.includes("code: 'blueprint_gate_release_failed'"), true, 'gate release failures must emit typed startup degraded evidence');
assert.equal(schedulingSource.includes("code: 'blueprint_control_sync_failed'"), true, 'control sync failures must emit typed startup degraded evidence');
const degradedConfig = {};
await schedulingMod.preparePipeline(degradedConfig, {}, {
  releaseGateFiles: async () => { throw new Error('gate release boom'); },
  syncControlFiles: async () => { throw new Error('control sync boom'); },
});
assert.deepEqual(
  degradedConfig._startupDegradedEvidence?.map((entry) => entry.code),
  ['blueprint_gate_release_failed', 'blueprint_control_sync_failed'],
  'control-file preparation failures must be retained as typed degraded startup evidence',
);

for (const marker of [
  "spawnSync(command, args,",
  "['plugins', action, pluginId]",
  "runPluginCommand('enable'",
  "runPluginCommand('disable'",
]) {
  assert.equal(openClawPluginRuntimeSource.includes(marker), true, `OpenClaw plugin runtime controller should include ${marker}`);
}

for (const marker of [
  'recordObservabilityDegraded',
  "reason: 'agent_observability_ingester_loop_failed'",
  'createAgentObservabilityIngester({',
]) {
  assert.equal(agentObservabilityRuntimeSource.includes(marker), true, `agent observability runtime should include ${marker}`);
}

const pluginCommands = [];
const pluginController = openClawPluginRuntimeMod.createOpenClawAgentObserverPluginController({
  agent_observability: {
    plugin_control: {
      enabled: true,
      pluginId: 'kubeclaw-agent-observer',
      command: 'openclaw',
      timeoutMs: 1234,
      disableOnStop: true,
    },
  },
}, {
  commandRunner: (command, args, options) => {
    pluginCommands.push({ command, args, options });
    return { status: 0, stdout: 'ok', stderr: '' };
  },
});
await pluginController.start();
await pluginController.stop();
assert.deepEqual(pluginCommands.map((entry) => entry.args), [
  ['plugins', 'enable', 'kubeclaw-agent-observer'],
  ['plugins', 'disable', 'kubeclaw-agent-observer'],
]);
assert.equal(pluginCommands[0].command, 'openclaw');
assert.equal(pluginCommands[0].options.timeoutMs, 1234);

const disabledPluginController = openClawPluginRuntimeMod.createOpenClawAgentObserverPluginController({}, {
  commandRunner: () => {
    throw new Error('should not run');
  },
});
assert.deepEqual(await disabledPluginController.start(), { skipped: true });
assert.deepEqual(await disabledPluginController.stop(), { skipped: true });

const disabledIngesterRuntime = agentObservabilityRuntimeMod.startAgentObservabilityIngester({}, {}, {
  ingester: { processNext: async () => { throw new Error('should not run'); } },
});
assert.equal(disabledIngesterRuntime.started, false, 'disabled ingester runtime must not start');
assert.equal(disabledIngesterRuntime.stats(), null, 'disabled ingester runtime stats are intentionally absent');
await disabledIngesterRuntime.stop();

const degradedEvidence = [];
const failingIngesterRuntime = agentObservabilityRuntimeMod.startAgentObservabilityIngester({
  agent_observability: { ingester: { enabled: true, loopDelayMs: 1, healthCheckEvery: 1 } },
}, { project: 'contract-runtime-degraded' }, {
  ingester: {
    processNext: async () => { throw new Error('boom'); },
    getStats: () => ({ processed: 0 }),
    stop: async () => {},
  },
  recordObservabilityDegraded: async (_ctx, data) => degradedEvidence.push(data),
});
await new Promise((resolve) => setTimeout(resolve, 5));
await failingIngesterRuntime.stop();
assert.equal(failingIngesterRuntime.started, true, 'enabled ingester runtime should start');
assert.deepEqual(failingIngesterRuntime.stats(), { processed: 0 });
assert.equal(degradedEvidence[0]?.reason, 'agent_observability_ingester_loop_failed', 'loop failures must emit typed degraded evidence');
assert.equal(degradedEvidence[0]?.source, 'agent_observability_ingester_runtime');

const rawNestedStatusCorrelation = sharedMod.buildResultWithStepCorrelation({
  project: 'contract-correlation-boundary',
  paths: { modules_dir: '/tmp/contract-correlation-boundary/modules' },
}, {
  modules: { '01': { dir: '01-scaffold' } },
  gates: {},
}, 'module', '01', {
  reason: 'terminal halt',
  status: {
    attempt: 99,
    dispatch_id: 'raw-status-dispatch',
    gateway_label: 'raw-status-gateway',
    session_key: 'raw-status-session',
  },
  module_status: {
    attempt: 88,
    dispatch_id: 'raw-module-status-dispatch',
    gateway_label: 'raw-module-status-gateway',
    session_key: 'raw-module-status-session',
  },
}, { loadStatus: () => null });
assert.equal(rawNestedStatusCorrelation.attempt, null, 'pipeline halt correlation must not read raw nested status attempts');
assert.equal(rawNestedStatusCorrelation.dispatch_id, null, 'pipeline halt correlation must not read raw nested status dispatch ids');
assert.equal(rawNestedStatusCorrelation.gateway_label, null, 'pipeline halt correlation must not read raw nested status gateway labels');
assert.equal(rawNestedStatusCorrelation.session_key, null, 'pipeline halt correlation must not read raw nested status session keys');

quietConsole.restore();
console.log(JSON.stringify({ ok: true, checked: 118 }));
