import { log } from '../../../core/logger.ts';
import { transitionModuleStatus } from '../../../lifecycle-state.ts';
import { resolveResultDispatchId, resolveResultGatewayLabel, resolveResultSessionKey } from '../../../services/correlation.ts';
import { emitTerminalModuleFailTelemetry } from '../../module-runner-shared.ts';
import { applyModuleRunnerCompletion } from '../completions.ts';
import { buildModuleBlockedTerminalResult, buildModuleNeedsNovaTerminalResult } from '../terminal-results.ts';
import { emitPipelineCheckpoint } from '../../../services/pipeline-checkpoint.ts';
import { buildDiscordIdentitySurfaceFields, DISCORD_IDENTITY_SURFACES } from '../../../services/discord-fields.ts';

type AnyRecord = Record<string, any>;

function required(value: unknown, field: string): string {
  if (typeof value === 'string' && value.trim()) return value.trim();
  throw new Error(`Buster terminal failure requires ${field}`);
}

function optional(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function preTestEvidence(context: AnyRecord) {
  const { deps, redisEntry } = context;
  return {
    failedSuites: deps.getFailedSuiteNames(redisEntry),
    passedSuites: deps.getPassedSuiteNames(redisEntry),
    reason: deps.extractPreTestFailReason(redisEntry),
    classification: deps.classifyPreTestFailure(redisEntry),
    fields: deps.buildPreTestDiscordFields(redisEntry),
  };
}

function preTestResultIdentity(context: AnyRecord, prefix: string) {
  const { resultRedisEntry, completionGatewayLabel, terminalSessionKey } = context;
  return {
    dispatchId: required(resolveResultDispatchId(resultRedisEntry), `${prefix} dispatch id`),
    gatewayLabel: optional(resolveResultGatewayLabel(resultRedisEntry)) ?? completionGatewayLabel,
    sessionKey: optional(resolveResultSessionKey(resultRedisEntry)) ?? terminalSessionKey,
  };
}

async function handlePreTestEnvironmentFailure(context: AnyRecord, evidence: AnyRecord) {
  const { config, moduleId, mod, dir, status, deps, runId, attempt, busterModel, statusName } = context;
  const classification = evidence.classification;
  const transition = transitionModuleStatus(status, 'READY_FOR_TESTING', {
    note: `Buster pre-test ${classification.kind} issue: ${classification.summary}`,
  });
  deps.saveStatus(config, dir, status, transition);
  const identity = preTestResultIdentity(context, 'pre-test result');
  const correlation = { run_id: runId, module_id: moduleId, attempt, dispatch_id: identity.dispatchId, gateway_label: identity.gatewayLabel, session_key: identity.sessionKey };
  await deps.discord(config, classification.kind === 'infra' ? 'CRITICAL' : 'WARN',
    `Module ${moduleId} — ${classification.kind === 'infra' ? 'Buster Infra Issue' : 'Buster Config Issue'}`,
    `${classification.summary}. Forge output preserved; fix the ${classification.kind === 'infra' ? 'test environment' : 'test config'} and resume Buster.`, [
      ...buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.MODULE_SESSION, correlation),
      { name: 'Classification', value: classification.summary, inline: false },
      ...evidence.fields,
      { name: 'Action', value: classification.kind === 'infra' ? 'Fix Buster / registry / sandbox infra, then --resume' : 'Fix progress.json test_config / test_suites / serve, then --resume', inline: false },
      { name: 'Reason', value: evidence.reason.slice(0, 1024), inline: false },
    ], { correlation });
  emitTerminalModuleFailTelemetry({ config, moduleId, status, mod, phase: 'buster', model: busterModel, oldStatus: statusName,
    reason: `Buster ${classification.kind} issue (${classification.code}) — Forge output preserved: ${classification.detail}`,
    correlation: { dispatchId: identity.dispatchId, gatewayLabel: identity.gatewayLabel, sessionKey: identity.sessionKey } });
  return { terminal: buildModuleNeedsNovaTerminalResult(config, moduleId, {
    reason: `Buster ${classification.kind} issue (${classification.code}) — Forge output preserved: ${classification.detail}`,
    runId, moduleDir: dir, attempt, phase: 'buster', dispatchId: identity.dispatchId,
    gatewayLabel: identity.gatewayLabel, sessionKey: identity.sessionKey,
    metadata: { failed_suites: evidence.failedSuites, passed_suites: evidence.passedSuites, forge_preserved: true, pretest_classification: classification },
  }) };
}

function hasRepeatedPreTestFailure(status: AnyRecord, failedSuites: string[]): boolean {
  if (failedSuites.length === 0) return false;
  const previous = (status.fail_summaries ?? [])
    .filter((summary: AnyRecord) => typeof summary === 'object' && typeof summary.summary === 'string' && summary.summary.startsWith('[buster/pre-test]'));
  return previous.some((entry: AnyRecord) => failedSuites.some((suite) => entry.summary.includes(suite)));
}

function persistRepeatedPreTestFailure(context: AnyRecord, evidence: AnyRecord, identity: AnyRecord) {
  const { config, moduleId, dir, status, deps, attempt } = context;
  const metadata = { failed_suites: evidence.failedSuites, passed_suites: evidence.passedSuites, failure_class: 'test_failure', pretest_classification: evidence.classification };
  const shared = {
    deps, config, dir, status, moduleId, phase: 'buster', attempt,
    authority: { kind: 'redis', dispatch_id: identity.dispatchId }, reasonCode: 'test_failure',
    dispatchId: identity.dispatchId, gatewayLabel: identity.gatewayLabel, sessionKey: identity.sessionKey, metadata,
  };
  applyModuleRunnerCompletion({ ...shared, completionStatus: 'FAIL', summary: evidence.reason });
  applyModuleRunnerCompletion({ ...shared, completionStatus: 'BLOCKED', summary: `Repeated pre-test failure (${evidence.failedSuites.join(',')}) — stopping before another Forge cycle` });
  return metadata;
}

async function handleRepeatedPreTestFailure(context: AnyRecord, evidence: AnyRecord) {
  const { config, moduleId, mod, dir, status, deps, runId, attempt, busterModel, statusName } = context;
  const identity = preTestResultIdentity(context, 'repeated pre-test result');
  log('ERROR', `Module ${moduleId}: repeated pre-test failure in ${evidence.failedSuites.join(',')} — escalating without another Forge cycle`);
  const correlation = { run_id: runId, module_id: moduleId, attempt, dispatch_id: identity.dispatchId, gateway_label: identity.gatewayLabel, session_key: identity.sessionKey };
  await deps.discord(config, 'CRITICAL', `Module ${moduleId} — Repeated Pre-Test Failure`,
    'The same pre-test suite(s) failed again after a Forge retry. Stopping before another code cycle.', [
      ...buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.MODULE_SESSION, correlation),
      ...evidence.fields,
      { name: 'Reason', value: evidence.reason.slice(0, 1024), inline: false },
      { name: 'Action', value: 'Investigate deterministic test failure before resuming Forge', inline: false },
    ], { correlation });
  if (identity.gatewayLabel && identity.sessionKey) {
    emitTerminalModuleFailTelemetry({ config, moduleId, status, mod, phase: 'buster', model: busterModel, oldStatus: statusName,
      reason: `Repeated pre-test failure (${evidence.failedSuites.join(',')}) — needs operator review before another Forge cycle`,
      correlation: { dispatchId: identity.dispatchId, gatewayLabel: identity.gatewayLabel, sessionKey: identity.sessionKey } });
  }
  const metadata = persistRepeatedPreTestFailure(context, evidence, identity);
  return { terminal: buildModuleBlockedTerminalResult(config, moduleId, {
    reason: `Repeated pre-test failure (${evidence.failedSuites.join(',')}) — stopping before another Forge cycle`,
    runId, moduleDir: dir, attempt, phase: 'buster', dispatchId: identity.dispatchId,
    gatewayLabel: identity.gatewayLabel, sessionKey: identity.sessionKey, metadata,
  }) };
}

async function handleCodePreTestFailure(context: AnyRecord, evidence: AnyRecord) {
  const { config, moduleId, status, completionIdentity, completionGatewayLabel, terminalSessionKey, handleModuleFail, buildRetryResult, recalledMemoryIds, attempt } = context;
  log('INFO', 'Code-side pre-test failure — routing to Forge via handleFail');
  const failResult = await handleModuleFail(status, 'buster', evidence.reason, {
    recalledMemoryIds, dispatch_id: completionIdentity.dispatchId,
    gateway_label: completionGatewayLabel, session_key: terminalSessionKey,
    discordFields: [...evidence.fields, { name: 'Stage', value: 'Pre-test suites', inline: true }, { name: 'Subagent Spawned?', value: 'No', inline: true }],
  });
  if (!failResult._retry) return { terminal: { retry: false, result: failResult } };
  emitPipelineCheckpoint(config, 'after_failed_gate_before_retry', {
    step_type: 'module', step_id: moduleId, module_id: moduleId, attempt, dispatch_id: completionIdentity.dispatchId,
  });
  return { terminal: buildRetryResult(failResult, status) };
}

export async function handlePreTestTerminalFailure(context: AnyRecord) {
  const evidence = preTestEvidence(context);
  const display = evidence.failedSuites.length > 0 ? evidence.failedSuites.join(',') : 'missing_suite_names';
  log('WARN', `Pre-test failure [${evidence.classification.kind}/${evidence.classification.code}]: ${evidence.reason} (suites: ${display})`);
  if (['infra', 'config'].includes(evidence.classification.kind)) return handlePreTestEnvironmentFailure(context, evidence);
  if (hasRepeatedPreTestFailure(context.status, evidence.failedSuites)) return handleRepeatedPreTestFailure(context, evidence);
  return handleCodePreTestFailure(context, evidence);
}
