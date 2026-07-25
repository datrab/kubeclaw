import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
import { selectPresentValue } from '../value-boundary.ts';
// runners/buster-gate-completion.js — Buster gate completion evidence wait adapter.
// Active runner path waits on Redis/local evidence events.
// The caller still owns agent lifecycle, session cleanup, and retry/fix policy.

import { log } from '../core/logger.ts';
import { STATUS } from '../core/constants.ts';
import { completionStreamKey, gateOutputPath } from '../core/paths.ts';
import { appendDurableOperatorAlert } from '../services/telemetry.ts';
import { projectGateCompletionState } from '../services/status-store.ts';
import { waitForResilientRedisCompletion } from '../services/redis-wait.ts';
import {
  createDedicatedRedisCompletionClient,
  createLocalEvidenceEventAdapter,
  createRedisCompletionEventAdapter,
} from '../services/completion-event-adapters.ts';
import {
  resolveBusterCompletionEvent,
  waitForBusterCompletion,
} from '../services/buster-completion-controller.ts';
import { logRedisOperation, logRedisReceived } from '../services/redis-log.ts';
import { scanLatestCompletionFromTail } from '../services/redis-completion.ts';
import { resolveRedisCompletionPolicy } from '../services/redis-completion-policy.ts';
import {
  buildGateSessionRateLimitStatus,
  buildGateTerminalOwnedRedisRateLimitExitResult,
} from '../services/rate-limit.ts';
import { buildBusterGateActiveCompletionIdentity } from './buster-gate-task.ts';

const BUSTER_GATE_TYPE = 'buster';
const COMPLETION_EVENT_CONTROLLER_SOURCE = 'event_controller';
const COMPLETION_SYSTEM_SOURCE = 'system';
const MISSING_COMPLETION_SOURCE = 'missing_completion_source';
const TIMEOUT_REASON = 'timeout';

function busterRuntimePolicyNumber(config: any, field: any) {
  const value = config?.buster?.runtime?.[field];
  if (selectTruthyValue(() => (typeof value !== 'number'), () => (!Number.isFinite(value)))) {
    throw new Error(`config.buster.runtime.${field}: required number in swarm.config.json`);
  }
  return value;
}

function hasOwn(value: any, key: any) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function requireWaitFactory(value: any, name: any) {
  if (typeof value === 'function') return value;
  throw new TypeError(`waitBusterGateCompletionEvidence requires ${name}`);
}

function completionWaitFactories(deps: any = {}) {
  const explicit = selectTruthyValue(() => (deps?._explicitDeps), () => ({}));
  const adapterOverrides = selectTruthyValue(() => (explicit.completionEventAdapters), () => ({}));
  const hasAdapterFactoryOverride = selectTruthyValue(() => (hasOwn(adapterOverrides, 'createRedisCompletionEventAdapter')), () => (hasOwn(adapterOverrides, 'createLocalEvidenceEventAdapter')));
  const hasTailFactoryOverride = selectTruthyValue(() => (hasOwn(explicit, 'createDedicatedRedisCompletionClient')), () => (hasOwn(explicit, 'scanLatestCompletionFromTail')));
  if (
    hasAdapterFactoryOverride
    && (
      selectTruthyValue(() => (!hasOwn(adapterOverrides, 'createRedisCompletionEventAdapter')), () => (!hasOwn(adapterOverrides, 'createLocalEvidenceEventAdapter')))
    )
  ) {
    throw new TypeError('waitBusterGateCompletionEvidence requires complete completion event adapter overrides');
  }
  if (
    hasTailFactoryOverride
    && (
      selectTruthyValue(() => (!hasOwn(explicit, 'createDedicatedRedisCompletionClient')), () => (!hasOwn(explicit, 'scanLatestCompletionFromTail')))
    )
  ) {
    throw new TypeError('waitBusterGateCompletionEvidence requires complete Redis tail recovery overrides');
  }
  return {
    RedisCtor: hasOwn(adapterOverrides, 'RedisCtor') ? adapterOverrides.RedisCtor : null,
    redisOptions: hasOwn(adapterOverrides, 'redisOptions') ? adapterOverrides.redisOptions : null,
    createRedisCompletionEventAdapter: hasAdapterFactoryOverride
      ? requireWaitFactory(adapterOverrides.createRedisCompletionEventAdapter, 'createRedisCompletionEventAdapter')
      : createRedisCompletionEventAdapter,
    createLocalEvidenceEventAdapter: hasAdapterFactoryOverride
      ? requireWaitFactory(adapterOverrides.createLocalEvidenceEventAdapter, 'createLocalEvidenceEventAdapter')
      : createLocalEvidenceEventAdapter,
    createRedisClient: hasTailFactoryOverride
      ? requireWaitFactory(explicit.createDedicatedRedisCompletionClient, 'createDedicatedRedisCompletionClient')
      : createDedicatedRedisCompletionClient,
    scanLatestCompletionFromTail: hasTailFactoryOverride
      ? requireWaitFactory(explicit.scanLatestCompletionFromTail, 'scanLatestCompletionFromTail')
      : scanLatestCompletionFromTail,
  };
}

function buildPollIdentityFields(completionIdentity: any) {
  return {
    run_id: completionIdentity.runId,
    attempt: completionIdentity.attempt,
    dispatch_id: completionIdentity.dispatchId,
  };
}

function buildExpectedRedisIdentity(completionIdentity: any) {
  return {
    ...buildPollIdentityFields(completionIdentity),
    gateway_label: completionIdentity.gateway_label,
  };
}

function completionGatewayLabel(redisEntry: any, completionIdentity: any) {
  return selectDefinedValue(() => (redisEntry.gateway_label), () => (completionIdentity.gateway_label));
}

function gateCompletionStreamKeyAuthority(config: any, deps: any = null) {
  return selectDefinedValue(() => (deps?._explicitDeps?.streamKey), () => (completionStreamKey(config)));
}

function buildGateWatchPaths(config: any, gateId: any, gate: any) {
  const outPath = gateOutputPath(config, gate);
  return [outPath].filter((value): value is string => typeof value === 'string' && value.length > 0);
}

function parseRedisVerdict(redisEntry: any = {}) {
  if (!redisEntry.verdict) return null;
  try { return JSON.parse(redisEntry.verdict); } catch (_error: any) { /* INTENTIONAL_NONCRITICAL(optional_probe_failed): this optional probe converts unreadable or absent input to explicit absence. */ return null; }
}

function controllerSource(controllerResult: any, fallbackSource: any) {
  return selectDefinedValue(() => (controllerResult?.source), () => (fallbackSource));
}

function redisCompletionSource(redisEntry: any) {
  return selectDefinedValue(() => (redisEntry?.source), () => (MISSING_COMPLETION_SOURCE));
}

function mapRedisControllerCompletion({ deps, gateId, gate, completionIdentity, gateRateLimitStatusOptions, redisEntry, completion }: any) {
  if (selectTruthyValue(() => (!redisEntry?.status), () => (!completion))) return null;

  const mappedStatus = completion.status;
  log('OK', `Gate '${gateId}' Redis completion: status=${redisEntry.status} mapped=${mappedStatus} outcome=${completion.outcome} source=${redisCompletionSource(redisEntry)} run=${selectTruthyValue(() => (redisEntry.run_id), () => ('—'))} attempt=${selectTruthyValue(() => (redisEntry.attempt), () => ('—'))} dispatch=${selectTruthyValue(() => (redisEntry.dispatch_id), () => ('—'))}`);

  if (completion.completion_conflict) {
    return { done: true, result: buildRedisConflictResult(deps, gateId, mappedStatus, redisEntry, completionIdentity, completion) };
  }

  if (completion.terminalOwnedRateLimited) {
    return { done: true, result: buildGateTerminalOwnedRedisRateLimitExitResult(redisEntry, {
      expectedIdentity: buildExpectedRedisIdentity(completionIdentity),
      gateId,
      gateType: gate.type,
      statusOptions: gateRateLimitStatusOptions,
      resultOverrides: { outcome_class: 'rate_limited' },
    }) };
  }

  if (completion.rateLimited && !completion.targetReached) {
    return { rate_limited: true, status: buildGateSessionRateLimitStatus(redisEntry, gateRateLimitStatusOptions) };
  }

  if (completion.timeout) {
    return { done: true, result: buildRedisTimeoutResult(deps, gateId, redisEntry, completionIdentity) };
  }

  if (mappedStatus === STATUS.PASS) {
    return { done: true, result: buildRedisVerdictResult(deps, true, gateId, mappedStatus, redisEntry, completionIdentity) };
  }

  if (mappedStatus === STATUS.FAIL) {
    return { done: true, result: buildRedisVerdictResult(deps, false, gateId, mappedStatus, redisEntry, completionIdentity) };
  }

  return null;
}

function buildRedisConflictResult(deps: any, gateId: any, status: any, entry: any, identity: any, completion: any) {
  return deps.pollResult(false, 'completion_conflict', { gate: gateId, status, local_status: null, redis_status: entry.status || null, summary: entry.summary || null, ...buildPollIdentityFields(identity), gateway_label: identity.gateway_label, session_key: identity.sessionKey || null, _source: 'redis', _redis_entry: entry, authority_policy: completion.authority_policy, drift: completion.drift });
}

function buildRedisTimeoutResult(deps: any, gateId: any, entry: any, identity: any) {
  return deps.pollResult(false, 'timeout', { gate: gateId, status: STATUS.FAIL, reason: selectPresentValue(entry.reason, entry.summary, TIMEOUT_REASON), source: redisCompletionSource(entry), ...buildPollIdentityFields(identity), gateway_label: completionGatewayLabel(entry, identity), session_key: entry.session_key || null, _source: 'redis' });
}

function buildRedisVerdictResult(deps: any, passed: boolean, gateId: any, status: any, entry: any, identity: any) {
  const common = { gate: gateId, status, ...buildPollIdentityFields(identity), gateway_label: completionGatewayLabel(entry, identity), session_key: entry.session_key || null, _source: 'redis', _redis_entry: entry };
  if (passed) return deps.pollResult(true, 'target_reached', { ...common, summary: entry.summary || null });
  return deps.pollResult(false, 'verdict_fail', { ...common, reason: selectPresentValue(entry.reason, entry.summary, 'missing_completion_reason'), source: redisCompletionSource(entry), verdict: parseRedisVerdict(entry) });
}

function appendDurableGateCompletionAlert(config: any, gateId: any, gate: any, completionIdentity: any = {}, reason: any, extra: any = {}) {
  appendDurableOperatorAlert(config, 'gate.operator_alert', {
    gate_id: gateId,
    gate_type: selectDefinedValue(() => (selectDefinedValue(() => (gate?.type), () => (gate?.gate_type))), () => (BUSTER_GATE_TYPE)),
    attempt: selectDefinedValue(() => (completionIdentity.attempt), () => (null)),
    dispatch_id: selectTruthyValue(() => (completionIdentity.dispatchId), () => (null)),
    gateway_label: selectTruthyValue(() => (completionIdentity.gateway_label), () => (null)),
    session_key: selectTruthyValue(() => (completionIdentity.sessionKey), () => (null)),
    reason,
    ...extra,
  }, {
    severity: 'CRITICAL',
    source: 'completion_event_adapter',
    emitter: 'nova/pipeline/runners/buster-gate-completion',
  });
}

function mapBusterGateControllerResult({
  deps,
  config,
  gateId,
  gate,
  completionIdentity,
  gateRateLimitStatusOptions,
  controllerResult,
}: any) {
  if (controllerResult?.reason === 'fatal_error') {
    appendDurableGateCompletionAlert(config, gateId, gate, completionIdentity, 'completion_event_adapter_failed', {
      status: STATUS.FAIL,
      error: selectDefinedValue(() => (selectDefinedValue(() => (controllerResult.error?.error), () => (controllerResult.error?.reason))), () => ('completion_event_adapter_failed')),
      source: controllerSource(controllerResult, COMPLETION_SYSTEM_SOURCE),
      event: selectTruthyValue(() => (controllerResult.event), () => (null)),
    });
    return deps.pollResult(false, 'completion_event_adapter_failed', {
      gate: gateId,
      status: STATUS.FAIL,
      reason: selectDefinedValue(() => (selectDefinedValue(() => (controllerResult.error?.error), () => (controllerResult.error?.reason))), () => ('completion_event_adapter_failed')),
      source: controllerSource(controllerResult, COMPLETION_SYSTEM_SOURCE),
      ...buildPollIdentityFields(completionIdentity),
      gateway_label: completionIdentity.gateway_label,
      session_key: selectTruthyValue(() => (completionIdentity.sessionKey), () => (null)),
      _source: controllerSource(controllerResult, COMPLETION_SYSTEM_SOURCE),
      event: selectTruthyValue(() => (controllerResult.event), () => (null)),
    });
  }

  if (controllerResult?.source === 'redis') {
    const redisResult = mapRedisControllerCompletion({
      deps,
      gateId,
      gate,
      completionIdentity,
      gateRateLimitStatusOptions,
      redisEntry: controllerResult.redis_entry,
      completion: controllerResult.completion,
    });
    if (redisResult?.done) return redisResult.result;
    if (redisResult?.rate_limited) return deps.pollResult(false, 'rate_limited', redisResult.status);
  }

  return deps.pollResult(false, 'completion_event_unresolved', {
    gate: gateId,
    status: STATUS.FAIL,
    reason: selectDefinedValue(() => (controllerResult?.reason), () => ('missing_controller_reason')),
    source: controllerSource(controllerResult, COMPLETION_EVENT_CONTROLLER_SOURCE),
    ...buildPollIdentityFields(completionIdentity),
    gateway_label: completionIdentity.gateway_label,
    session_key: selectTruthyValue(() => (completionIdentity.sessionKey), () => (null)),
  });
}

export async function waitBusterGateCompletionEvidence({
  deps,
  config,
  gateId,
  gate,
  completionIdentity,
  gateRateLimitStatusOptions,
  timeoutMinutes,
}: any) {
  const activeCompletionIdentity = buildBusterGateActiveCompletionIdentity(completionIdentity);
  const timeoutMs = timeoutMinutes * 60 * 1000;

  try {
    const redisCompletionPolicy = resolveRedisCompletionPolicy(config);
    const waitFactories = completionWaitFactories(deps);
    const controllerResult = await waitForResilientRedisCompletion(buildBusterGateWaitOptions({ config, deps, gateId, gate, activeCompletionIdentity, timeoutMs, redisCompletionPolicy, waitFactories }));
    return mapBusterGateControllerResult({
      deps,
      config,
      gateId,
      gate,
      completionIdentity,
      gateRateLimitStatusOptions,
      controllerResult,
    });
  } catch (error: any) {
    if (error?.code === 'PIPELINE_EVENT_WAIT_TIMEOUT') {
      appendDurableGateCompletionAlert(config, gateId, gate, completionIdentity, 'timeout', {
        status: STATUS.FAIL,
        timeout_ms: timeoutMs,
      });
      return deps.pollResult(false, 'timeout', {
        gate: gateId,
        status: STATUS.FAIL,
        reason: `Timed out waiting for Buster completion event for gate '${gateId}'`,
        ...buildPollIdentityFields(completionIdentity),
        gateway_label: completionIdentity.gateway_label,
        session_key: selectTruthyValue(() => (completionIdentity.sessionKey), () => (null)),
      });
    }
    throw error;
  }
}

function buildBusterGateWaitOptions(input: any) {
  const { config, deps, gateId, gate, activeCompletionIdentity, timeoutMs, redisCompletionPolicy, waitFactories } = input;
  return {
    config, streamKey: gateCompletionStreamKeyAuthority(config, deps), targetKind: 'gate' as const, targetId: gateId,
    expectedStatuses: [STATUS.PASS, STATUS.FAIL], expectedIdentity: activeCompletionIdentity, timeoutMs,
    watchPaths: buildGateWatchPaths(config, gateId, gate), getLocalStatus: () => projectGateCompletionState(config, gateId, gate), statusSource: 'output_file',
    RedisCtor: waitFactories.RedisCtor, redisOptions: waitFactories.redisOptions,
    redisBlockMs: busterRuntimePolicyNumber(config, 'completion_event_block_ms'), recoveryScanIntervalMs: busterRuntimePolicyNumber(config, 'completion_recovery_scan_interval_ms'),
    tailScanBatchSize: redisCompletionPolicy.tailScanBatchSize, tailScanLimit: redisCompletionPolicy.tailScanLimit,
    createRedisCompletionEventAdapter: waitFactories.createRedisCompletionEventAdapter, createLocalEvidenceEventAdapter: waitFactories.createLocalEvidenceEventAdapter,
    createRedisClient: waitFactories.createRedisClient, scanLatestCompletionFromTail: waitFactories.scanLatestCompletionFromTail,
    waitForCompletion: waitForBusterCompletion, resolveCompletionEvent: resolveBusterCompletionEvent, log, logRedisOperation, logRedisReceived,
  };
}
