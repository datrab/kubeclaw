// runners/buster-gate-completion.js — Buster gate completion evidence wait adapter.
// Active runner path waits on Redis/local evidence events.
// The caller still owns agent lifecycle, session cleanup, and retry/fix policy.

import { log } from '../core/logger.ts';
import { STATUS } from '../core/constants.ts';
import { completionStreamKey, gateOutputPath } from '../core/paths.ts';
import { appendDurableOperatorAlert } from '../services/telemetry.ts';
import { projectGateCompletionState } from '../services/status-store.ts';
import { waitForResilientRedisCompletion } from '../../../common/pipeline/services/redis-wait.ts';
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
      _redis_entry: redisEntry,
    }) };
  }

  if (mappedStatus === STATUS.FAIL) {
    return { done: true, result: deps.pollResult(false, 'verdict_fail', {
      gate: gateId,
      status: mappedStatus,
      reason: redisEntry.reason || redisEntry.summary || 'unknown',
      source: redisEntry.source || 'unknown',
      verdict: parseRedisVerdict(redisEntry),
      ...buildPollIdentityFields(completionIdentity),
      gateway_label: redisEntry.gateway_label || completionIdentity.gateway_label,
      session_key: redisEntry.session_key || null,
      _source: 'redis',
      _redis_entry: redisEntry,
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
  const activeCompletionIdentity = buildBusterGateActiveCompletionIdentity(completionIdentity);
  const timeoutMs = timeoutMinutes * 60 * 1000;

  try {
    const controllerResult = await waitForResilientRedisCompletion({
      config,
      streamKey: deps?._explicitDeps?.streamKey || completionStreamKey(config),
      targetKind: 'gate',
      targetId: gateId,
      expectedStatuses: [STATUS.PASS, STATUS.FAIL],
      expectedIdentity: activeCompletionIdentity,
      timeoutMs,
      watchPaths: buildGateWatchPaths(config, gateId, gate),
      getLocalStatus: () => projectGateCompletionState(config, gateId, gate, { activeDispatch: activeCompletionIdentity }),
      statusSource: 'output_file',
      deps: deps?._explicitDeps,
      redisBlockMs: config?.buster?.runtime?.completion_event_block_ms,
      recoveryScanIntervalMs: config?.buster?.runtime?.completion_recovery_scan_interval_ms,
      tailScanBatchSize: config?.redis_completion?.tail_scan_batch_size,
      tailScanLimit: config?.redis_completion?.tail_scan_limit,
      createRedisCompletionEventAdapter,
      createLocalEvidenceEventAdapter,
      createRedisClient: createDedicatedRedisCompletionClient,
      scanLatestCompletionFromTail,
      waitForCompletion: waitForBusterCompletion,
      resolveCompletionEvent: resolveBusterCompletionEvent,
      log,
      logRedisOperation,
      logRedisReceived,
    });
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
  }
}
