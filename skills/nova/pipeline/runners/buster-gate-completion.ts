// runners/buster-gate-completion.js — Buster gate completion evidence wait adapter.
// Active runner path waits on Redis/local evidence events.
// The caller still owns agent lifecycle, session cleanup, and retry/fix policy.

import { selectDeps } from '../core/deps.ts';
import { log } from '../core/logger.ts';
import { STATUS } from '../core/constants.ts';
import { gateOutputPath } from '../core/paths.ts';
import { appendDurableOperatorAlert } from '../services/telemetry.ts';
import { projectGateCompletionState } from '../services/status-store.ts';
import { createPipelineEventBus } from '../services/pipeline-event-contract.ts';
import {
  createRedisCompletionEventAdapter as defaultCreateRedisCompletionEventAdapter,
  createLocalEvidenceEventAdapter as defaultCreateLocalEvidenceEventAdapter,
} from '../services/completion-event-adapters.ts';
import { waitForBusterCompletion } from '../services/buster-completion-controller.ts';
import {
  buildGateSessionRateLimitStatus,
  buildGateTerminalOwnedRedisRateLimitExitResult,
} from '../services/rate-limit.ts';
import { buildBusterGateActiveCompletionIdentity } from './buster-gate-task.ts';

function buildPollIdentityFields(completionIdentity) {
  return {
    run_id: completionIdentity.runId,
    attempt: completionIdentity.attempt,
    dispatch_id: completionIdentity.dispatchId,
  };
}

function buildExpectedRedisIdentity(completionIdentity) {
  return {
    ...buildPollIdentityFields(completionIdentity),
    gateway_label: completionIdentity.gateway_label,
  };
}

function buildGateEventIdentity(gateId, completionIdentity) {
  return {
    gate_id: gateId,
    run_id: completionIdentity.runId,
    attempt: completionIdentity.attempt,
    dispatch_id: completionIdentity.dispatchId,
    ...(completionIdentity.sessionKey ? { session_key: completionIdentity.sessionKey } : {}),
  };
}

function buildGateWatchPaths(config, gateId, gate) {
  const outPath = gateOutputPath(config, gate);
  return [outPath].filter(Boolean);
}

function parseRedisVerdict(redisEntry = {}) {
  if (!redisEntry.verdict) return null;
  try { return JSON.parse(redisEntry.verdict); } catch (_error) { return null; }
}

function mapRedisControllerCompletion({ deps, gateId, gate, completionIdentity, gateRateLimitStatusOptions, redisEntry, completion }) {
  if (!redisEntry?.status || !completion) return null;

  const mappedStatus = completion.status;
  log('OK', `Gate '${gateId}' Redis completion: status=${redisEntry.status} mapped=${mappedStatus} outcome=${completion.outcome} source=${redisEntry.source || 'unknown'} run=${redisEntry.run_id || '—'} attempt=${redisEntry.attempt || '—'} dispatch=${redisEntry.dispatch_id || '—'}`);

  if (completion.completion_conflict) {
    return { done: true, result: deps.pollResult(false, 'completion_conflict', {
      gate: gateId,
      status: mappedStatus,
      local_status: null,
      redis_status: redisEntry.status || null,
      summary: redisEntry.summary || null,
      ...buildPollIdentityFields(completionIdentity),
      gateway_label: completionIdentity.gateway_label,
      session_key: completionIdentity.sessionKey || null,
      _source: 'redis',
      _redis_entry: redisEntry,
      authority_policy: completion.authority_policy,
      drift: completion.drift,
    }) };
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
    return { done: true, result: deps.pollResult(false, 'timeout', {
      gate: gateId,
      status: STATUS.FAIL,
      reason: redisEntry.reason || redisEntry.summary || 'timeout',
      source: redisEntry.source || 'unknown',
      ...buildPollIdentityFields(completionIdentity),
      gateway_label: redisEntry.gateway_label || completionIdentity.gateway_label,
      session_key: redisEntry.session_key || null,
      _source: 'redis',
    }) };
  }

  if (mappedStatus === STATUS.PASS) {
    return { done: true, result: deps.pollResult(true, 'target_reached', {
      gate: gateId,
      status: mappedStatus,
      summary: redisEntry.summary || null,
      ...buildPollIdentityFields(completionIdentity),
      gateway_label: redisEntry.gateway_label || completionIdentity.gateway_label,
      session_key: redisEntry.session_key || null,
      _source: 'redis',
    }) };
  }

  if (mappedStatus === STATUS.FAIL) {
    return { done: true, result: deps.pollResult(false, 'gate_fail', {
      gate: gateId,
      status: mappedStatus,
      reason: redisEntry.reason || redisEntry.summary || 'unknown',
      source: redisEntry.source || 'unknown',
      verdict: parseRedisVerdict(redisEntry),
      ...buildPollIdentityFields(completionIdentity),
      gateway_label: redisEntry.gateway_label || completionIdentity.gateway_label,
      session_key: redisEntry.session_key || null,
      _source: 'redis',
    }) };
  }

  return null;
}

function appendDurableGateCompletionAlert(config, gateId, gate, completionIdentity = {}, reason, extra = {}) {
  appendDurableOperatorAlert(config, 'gate.operator_alert', {
    gate_id: gateId,
    gate_type: gate?.type || gate?.gate_type || 'buster',
    attempt: completionIdentity.attempt ?? null,
    dispatch_id: completionIdentity.dispatchId || null,
    gateway_label: completionIdentity.gateway_label || null,
    session_key: completionIdentity.sessionKey || null,
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
}) {
  if (controllerResult?.reason === 'fatal_error') {
    appendDurableGateCompletionAlert(config, gateId, gate, completionIdentity, 'completion_event_adapter_failed', {
      status: STATUS.FAIL,
      error: controllerResult.error?.error || controllerResult.error?.reason || 'completion event adapter failed',
      source: controllerResult.source || 'system',
      event: controllerResult.event || null,
    });
    return deps.pollResult(false, 'completion_event_adapter_failed', {
      gate: gateId,
      status: STATUS.FAIL,
      reason: controllerResult.error?.error || controllerResult.error?.reason || 'completion event adapter failed',
      source: controllerResult.source || 'system',
      ...buildPollIdentityFields(completionIdentity),
      gateway_label: completionIdentity.gateway_label,
      session_key: completionIdentity.sessionKey || null,
      _source: controllerResult.source || 'system',
      event: controllerResult.event || null,
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
    reason: controllerResult?.reason || 'unknown',
    source: controllerResult?.source || 'event_controller',
    ...buildPollIdentityFields(completionIdentity),
    gateway_label: completionIdentity.gateway_label,
    session_key: completionIdentity.sessionKey || null,
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
}) {
  const eventBus = createPipelineEventBus();
  const controller = new AbortController();
  const activeCompletionIdentity = buildBusterGateActiveCompletionIdentity(completionIdentity);
  const identity = buildGateEventIdentity(gateId, completionIdentity);
  const timeoutMs = timeoutMinutes * 60 * 1000;
  const adapterDeps = selectDeps(deps?._explicitDeps, 'completionEventAdapters');
  const RedisCtor = adapterDeps?.RedisCtor;
  const createRedisCompletionEventAdapter = adapterDeps?.createRedisCompletionEventAdapter || defaultCreateRedisCompletionEventAdapter;
  const createLocalEvidenceEventAdapter = adapterDeps?.createLocalEvidenceEventAdapter || defaultCreateLocalEvidenceEventAdapter;
  const redisAdapter = createRedisCompletionEventAdapter(config, {
    eventBus,
    identity,
    startId: '0-0',
    ...(RedisCtor ? { RedisCtor } : {}),
  });
  const localAdapter = createLocalEvidenceEventAdapter(config, {
    eventBus,
    identity,
    paths: buildGateWatchPaths(config, gateId, gate),
    emitExisting: true,
  });
  const completionWait = waitForBusterCompletion({
    eventBus,
    identity,
    targetKind: 'gate',
    targetId: gateId,
    expectedStatuses: [STATUS.PASS, STATUS.FAIL],
    expectedIdentity: activeCompletionIdentity,
    signal: controller.signal,
    timeoutMs,
    getLocalStatus: () => projectGateCompletionState(config, gateId, gate, { activeDispatch: activeCompletionIdentity }),
    statusSource: 'output_file',
  });
  completionWait.catch?.(() => {});
  let redisDone = null;

  try {
    redisDone = redisAdapter.start();
    redisDone?.catch?.(() => {});
    localAdapter.start();

    const controllerResult = await completionWait;
    return mapBusterGateControllerResult({
      deps,
      config,
      gateId,
      gate,
      completionIdentity,
      gateRateLimitStatusOptions,
      controllerResult,
    });
  } catch (error) {
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
        session_key: completionIdentity.sessionKey || null,
      });
    }
    throw error;
  } finally {
    controller.abort('gate_completion_finished');
    localAdapter?.stop?.('gate_completion_finished');
    redisAdapter?.stop('gate_completion_finished');
    await redisDone?.catch?.(() => {});
  }
}
