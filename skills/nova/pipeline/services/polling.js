// services/polling.js — Polling engine and dual-channel Redis+Git polling

import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { log } from '../core/logger.js';
import { getRunId } from '../core/runtime.js';
import { statusPath, completionStreamKey, validateSafePath } from '../core/paths.js';
import { loadStatus, saveStatus } from './status-store.js';
import { getAcpMonitorState, getAcpMonitorConfig, publishTranscriptDelta } from '../../../common/pipeline/agents/acp-monitor.js';
import {
  emitTranscriptLine,
  emitAgentProgress,
  updateGatewayObservability,
  updateTranscriptObservability,
  updateRedisCompletionObservability,
} from './telemetry.js';
import { getTrackedAgent } from '../../../common/pipeline/agents/lifecycle.js';
import { gatewayInvoke } from '../../../common/pipeline/integrations/gateway.js';
import {
  withRateLimitRecovery,
  processSessionRateLimit,
  buildModuleTerminalOwnedRedisRateLimitExitResult,
  buildGateSessionRateLimitStatus,
  buildModuleSessionRateLimitStatus,
} from './rate-limit.js';
import {
  resolveStatusSessionKey,
  resolveStatusDispatchId,
  resolveStatusGatewayLabel,
  resolveResultSessionKey,
  resolveResultDispatchId,
  resolveResultGatewayLabel,
} from './correlation.js';
import { gitPullForPolling, headHash, invalidateHeadHash, gitExec } from '../integrations/git.js';
import { copyRedactedTranscriptArtifact } from '../../../common/pipeline/redaction.js';
import { transitionModuleStatus } from '../../../common/pipeline/lifecycle-state.js';
import { logRedisOperation } from './redis-log.js';
import redisTool from '../tools/redis.js';

const STATUS = {
  PENDING:           'PENDING',
  IN_PROGRESS:       'IN_PROGRESS',
  READY_FOR_TESTING: 'READY_FOR_TESTING',
  TESTING:           'TESTING',
  PASS:              'PASS',
  FAIL:              'FAIL',
  BLOCKED:           'BLOCKED',
  RATE_LIMITED:      'RATE_LIMITED',
};

const CANONICAL_REDIS_MODULE_PATHS = new Set([
  path.resolve('/app/skills/pipeline/tools/redis.js'),
  path.resolve('/app/skills/redis.js'),
  path.resolve(fileURLToPath(new URL('../tools/redis.js', import.meta.url))),
]);

function isCanonicalRedisModulePath(filePath) {
  return CANONICAL_REDIS_MODULE_PATHS.has(path.resolve(filePath));
}

// ─── Primitives ───────────────────────────────────────────────────────────────

export function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function resolveFilePollIdentity(label, tracked = null) {
  return {
    label: tracked?.gatewayLabel || label,
    gateway_label: tracked?.gatewayLabel || label || null,
    module_id: tracked?.telemetry_module_id ?? null,
    gate_id: tracked?.telemetry_gate_id ?? null,
    gate_type: tracked?.telemetry_gate_id ? (tracked?.telemetry_gate_type ?? null) : undefined,
    attempt: tracked?.telemetry_attempt ?? null,
    dispatch_id: tracked?.telemetry_dispatch_id ?? null,
    session_key: tracked?.sessionKey || null,
    agent_type: tracked?.telemetry_agent_type
      ?? (tracked?.telemetry_gate_id
        ? (tracked?.telemetry_gate_type ?? 'review')
        : (sessionLabelAgentType(label) || null)),
  };
}

function resolveSessionPollIdentity({ tracked = null, explicitModuleId = null, gateId = null, gateType = null, sessionKey = null, logLabel = null, sessionLabel = null } = {}) {
  const telemetryGateId = tracked?.telemetry_gate_id ?? gateId ?? null;
  return {
    label: tracked?.gatewayLabel || logLabel || sessionLabel || null,
    gateway_label: tracked?.gatewayLabel || logLabel || sessionLabel || null,
    module_id: telemetryGateId
      ? (tracked?.telemetry_module_id ?? null)
      : (tracked?.telemetry_module_id ?? explicitModuleId ?? tracked?.moduleId ?? logLabel ?? sessionLabel ?? null),
    gate_id: telemetryGateId,
    gate_type: telemetryGateId ? (gateType ?? null) : undefined,
    attempt: tracked?.telemetry_attempt ?? null,
    dispatch_id: tracked?.telemetry_dispatch_id ?? null,
    session_key: sessionKey || tracked?.sessionKey || null,
  };
}

function resolveStatusPollIdentity(moduleDir, status = null, tracked = null, sessionLabel = null) {
  const fallbackLabel = tracked?.gatewayLabel || sessionLabel || status?.module_id || moduleDir;
  const gatewayLabel = resolveStatusGatewayLabel(status, fallbackLabel);
  const gateId = status?.gate_id || tracked?.telemetry_gate_id || null;
  const gateType = gateId ? (status?.gate_type ?? tracked?.telemetry_gate_type ?? null) : undefined;
  return {
    label: gatewayLabel || fallbackLabel,
    gateway_label: gatewayLabel,
    module_id: status?.module_id || tracked?.moduleId || moduleDir,
    gate_id: gateId,
    gate_type: gateType,
    attempt: status?.attempt ?? tracked?.telemetry_attempt ?? null,
    dispatch_id: resolveStatusDispatchId(status, tracked?.telemetry_dispatch_id),
    session_key: resolveStatusSessionKey(status, tracked?.sessionKey),
    agent_type: status?.current_phase
      || (gateId ? (gateType ?? 'review') : null)
      || sessionLabelAgentType(gatewayLabel || fallbackLabel || '')
      || null,
  };
}

function sessionLabelAgentType(label = '') {
  if (label === 'Pipeline Review') return 'review';
  if (label === 'Case Study') return 'case_study';
  return null;
}

function buildAcpPollLogKey(acpState = {}) {
  const transcriptState = acpState?.transcript?.lastActivityPoll === 0
    ? 'active'
    : (acpState?.transcript?.eventCount > 0 ? 'stale' : 'empty');
  return [
    `session=${acpState?.sessionState || 'unknown'}`,
    `reason=${acpState?.reason || 'pending'}`,
    `gateway=${acpState?.gatewayUnreachable ? 'unreachable' : 'ok'}`,
    `transcript=${transcriptState}`,
  ].join(' ');
}

function buildSessionProgressStateKey(sessionEndDetected = false) {
  return sessionEndDetected ? 'session_active_waiting_for_push' : 'session_active';
}

/**
 * Consistent poll result wrapper — all callers get the same shape.
 *
 * IMPORTANT: ok=true means "a terminal status was reached", NOT "module passed".
 * FAIL is a valid terminal status — the caller inspects status.status to decide
 * whether it's a PASS or FAIL and handles each case separately.
 *
 * @typedef {Object} PollResult
 * @property {boolean} ok - Whether a terminal status was reached (PASS, FAIL, etc.)
 * @property {string} reason - 'target_reached' | 'gate_fail' | 'timeout' | 'blocked' | 'rate_limited' | 'rate_limit_exhausted' | 'parse_corrupted' | 'spawn_failed'
 * @property {object|null} status - The status.json content or Redis completion data
 * @property {object|null} transcript - Optional ACP transcript state when polling owns it
 */
export function pollResult(ok, reason, status = null, extra = {}) {
  return { ok, reason, status, ...extra };
}

function syncRepoForPolling(config, label = 'poll') {
  if (!config?.repo_root) return { ok: true, skipped: true, reason: 'no_repo_root' };
  try {
    const result = gitPullForPolling(config) || { ok: true };
    if (result.skipped) {
      log('DEBUG', `[${label}] Git pull skipped (${result.reason || 'skipped'})`);
    } else if (result.ok === false) {
      const error = {
        code: 'POLLING_GIT_PULL_FAILED',
        message: result.reason || result.details || 'git pull failed during polling',
        details: result,
      };
      log('WARN', `[${label}] Polling git pull failed: ${error.message}`);
      return { ok: false, error };
    }
    return { ok: true, result };
  } catch (e) {
    const error = {
      code: e.code || 'POLLING_GIT_FAILED',
      message: e.message?.split('\n')[0] || 'git pull failed during polling',
      details: e.pollingGit || null,
    };
    log('ERROR', `[${label}] ${error.message}`);
    return { ok: false, error };
  }
}

// ─── Generic Polling Engine ───────────────────────────────────────────────────

/**
 * Generic polling loop with rate-limit handling, parse-corruption tracking,
 * and deadline management. All polling in the pipeline shares this scaffolding.
 *
 * @param {object} config - Pipeline config
 * @param {function} checkFn - Called each cycle. Returns:
 *   { done: true, result: PollResult }              → terminal, return immediately
 *   { done: false, logMsg?: string, logKey?: string } → keep polling (optional status message)
 *   { rate_limited: true, status: object }          → rate limit detected
 *   { parse_error: true }                           → increment corruption counter
 * @param {number} timeoutMinutes - Max polling duration
 * @param {string} label - For log messages (e.g. "Gate 'review-01'" or "module-06")
 * @returns {PollResult}
 */
export async function pollGeneric(config, checkFn, timeoutMinutes, label = 'poll') {
  const interval = config.poll_interval_seconds * 1000;
  const progressLogIntervalMs = config.poll_progress_log_interval_ms ?? 30000;
  let deadline = Date.now() + timeoutMinutes * 60 * 1000;
  const startTime = Date.now();
  let consecutiveParseFailures = 0;
  const maxParseFailures = 10;
  let firstCycle = true;
  let lastProgressLogAt = 0;
  let lastProgressLogKey = null;
  log('INFO', `[${label}] Polling every ${config.poll_interval_seconds}s | timeout: ${timeoutMinutes}min`);

  while (Date.now() < deadline) {
    if (!firstCycle) {
      await sleep(interval);
      const gitSync = syncRepoForPolling(config, label);
      if (!gitSync.ok) return pollResult(false, 'git_error', gitSync.error);
    } else {
      firstCycle = false;
    }

    const check = await checkFn();

    // ── Terminal result ──
    if (check.done) {
      return check.result;
    }

    // ── Parse corruption tracking ──
    if (check.parse_error) {
      consecutiveParseFailures++;
      if (consecutiveParseFailures >= maxParseFailures) {
        log('ERROR', `[${label}] Parse corruption limit reached (${consecutiveParseFailures})`);
        return pollResult(false, 'parse_corrupted', null);
      }
      log('WARN', `[${label}] Parse failure ${consecutiveParseFailures}/${maxParseFailures}`);
      continue;
    }
    consecutiveParseFailures = 0;

    // ── Rate limit ──
    // Return to caller so the owning wrapper can route cooldown handling
    // through the correct shared rate-limit owner.
    if (check.rate_limited) {
      log('WARN', `[${label}] Rate limit detected — returning to caller`);
      return pollResult(false, 'rate_limited', check.status);
    }

    // ── Progress log ──
    const progressMsg = check.logMsg || 'pending';
    const progressKey = check.logKey || progressMsg;
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const remaining = Math.round((deadline - Date.now()) / 1000);
    const shouldLogProgress = !lastProgressLogKey
      || progressKey !== lastProgressLogKey
      || (Date.now() - lastProgressLogAt) >= progressLogIntervalMs;
    if (shouldLogProgress) {
      log('INFO', `[${label}] ${progressMsg} | ${elapsed}s elapsed, ${remaining}s remaining`);
      lastProgressLogAt = Date.now();
      lastProgressLogKey = progressKey;
    }
  }

  log('ERROR', `[${label}] Timeout after ${timeoutMinutes} minutes`);
  return pollResult(false, 'timeout', null);
}

// ─── File Poller ──────────────────────────────────────────────────────────────

/**
 * Simple file-existence poller built on pollGeneric.
 * Used by gates where the only completion signal is a file appearing on disk.
 *
 * @returns {PollResult} - ok=true if file found, ok=false on timeout
 */
export async function pollForFile(config, filePath, timeoutMinutes, label = 'file-poll', sessionLabel = null) {
  let acpState = {};
  const observabilityState = {
    gateway: { active: false, degradedAt: null },
    transcript: { active: false, degradedAt: null },
  };
  const ctx = { config };
  const startTime = Date.now();
  let lastProgressEmit = startTime;
  const PROGRESS_INTERVAL_MS = config.session_progress_emit_interval_ms ?? 30000;

  return pollGeneric(config, async () => {
    // Signal A: Output file exists → success (always wins)
    if (fs.existsSync(filePath)) {
      return { done: true, result: pollResult(true, 'target_reached', { file: filePath }) };
    }

    // Signal B: ACP transcript / session terminal state without file → fail fast
    if (sessionLabel) {
      acpState = await getAcpMonitorState(config, sessionLabel, acpState);
      const tracked = getTrackedAgent(sessionLabel);
      const pollIdentity = resolveFilePollIdentity(label, tracked);
      const observabilityData = {
        session_state: acpState.sessionState,
        detail: acpState.detail,
        gateway_unreachable: acpState.gatewayUnreachable === true,
        gateway_detail: acpState.gatewayDetail || null,
        transcript_detail: acpState.transcript?.lastDetail || null,
        gateway_label: pollIdentity.gateway_label || pollIdentity.label || null,
        module_id: pollIdentity.module_id,
        gate_id: pollIdentity.gate_id,
        attempt: pollIdentity.attempt,
        dispatch_id: pollIdentity.dispatch_id,
        session_key: pollIdentity.session_key,
        agent_type: pollIdentity.agent_type || sessionLabel.split('-')[0] || null,
      };
      updateGatewayObservability(ctx, observabilityState.gateway, observabilityData);
      updateTranscriptObservability(ctx, observabilityState.transcript, observabilityData);

      const newTranscriptLines = acpState.transcript?.newLines || [];
      const liveAgentType = pollIdentity.agent_type || sessionLabelAgentType(sessionLabel || label) || 'review';
      if (newTranscriptLines.length > 0) {
        Promise.resolve().then(() => {
          try {
            publishTranscriptDelta(ctx, {
              label: pollIdentity.label,
              agent_type: liveAgentType,
              module_id: pollIdentity.module_id,
              gate_id: pollIdentity.gate_id,
              gate_type: pollIdentity.gate_type,
              session_key: pollIdentity.session_key,
              dispatch_id: pollIdentity.dispatch_id,
            }, newTranscriptLines, emitTranscriptLine);
          } catch { /* non-critical */ }
        }).catch(() => {});
      }

      if (Date.now() - lastProgressEmit >= PROGRESS_INTERVAL_MS) {
        emitAgentProgress(ctx, {
          agent_type: liveAgentType,
          label: pollIdentity.label,
          module_id: pollIdentity.module_id,
          gate_id: pollIdentity.gate_id,
          gate_type: pollIdentity.gate_type,
          session_key: pollIdentity.session_key,
          dispatch_id: pollIdentity.dispatch_id,
          elapsed_seconds: Math.round((Date.now() - startTime) / 1000),
          transcript_events: acpState.transcript?.eventCount ?? null,
          last_activity: acpState.transcript?.lastDetail || null,
          status: 'active',
        });
        lastProgressEmit = Date.now();
      }

      if (acpState.rateLimited) {
        log('WARN', `[${label}] ACP monitor detected rate limit: ${acpState.detail}`);
        return {
          rate_limited: true,
          status: {
            ...(getRunId(config) == null ? {} : { run_id: getRunId(config) }),
            module_id: pollIdentity.module_id,
            gate_id: pollIdentity.gate_id,
            ...(pollIdentity.gate_id == null ? {} : { gate_type: pollIdentity.gate_type ?? null }),
            session_key: pollIdentity.session_key,
            attempt: pollIdentity.attempt,
            dispatch_id: pollIdentity.dispatch_id,
            gateway_label: pollIdentity.gateway_label || pollIdentity.label || null,
            current_phase: pollIdentity.agent_type || 'review',
            agent_type: pollIdentity.agent_type || 'review',
            reason: acpState.detail,
            detail: acpState.detail,
          },
        };
      }

      if (acpState.terminal) {
        log('WARN', `[${label}] ACP monitor terminal (${acpState.reason}): ${acpState.detail}`);
        return {
          done: true,
          result: pollResult(false, 'session_ended_no_output', {
            state: acpState.sessionState,
            reason: acpState.reason,
            detail: acpState.detail,
            module_id: pollIdentity.module_id,
            gate_id: pollIdentity.gate_id,
            session_key: pollIdentity.session_key,
          }, {
            transcript: acpState.transcript || null,
          }),
        };
      }

      return {
        done: false,
        logMsg: `session=${acpState.sessionState} unknown=${acpState.unknownPolls}/${getAcpMonitorConfig(config).unknown_poll_limit} transcript_stale=${acpState.transcriptStalePolls}/${getAcpMonitorConfig(config).stale_poll_limit}`,
        logKey: buildAcpPollLogKey(acpState),
      };
    }

    return { done: false };
  }, timeoutMinutes, label);
}

// ─── Status Poller ────────────────────────────────────────────────────────────

/**
 * Status poller — reads status.json until a target status is reached.
 * Built on pollGeneric. Returns immediately on RATE_LIMITED (caller decides).
 *
 * opts.sessionLabel — if set, also checks ACP session state each cycle.
 *   When the session ends and HEAD moved → auto-advances to READY_FOR_TESTING.
 *   This catches Forge agents that commit but forget to update status.json.
 * opts.headBefore — HEAD hash captured before Forge spawn (required with sessionLabel).
 * opts.moduleDir — module dir for status.json update on auto-advance.
 */
export async function pollStatus(config, moduleDir, expectedStatuses, timeoutMinutes, opts = {}) {
  const { sessionLabel, headBefore } = opts;
  let acpState = {};
  const observabilityState = {
    gateway: { active: false, degradedAt: null },
    transcript: { active: false, degradedAt: null },
  };
  const ctx = { config };
  const startTime = Date.now();
  let lastProgressEmit = startTime;
  const PROGRESS_INTERVAL_MS = config.session_progress_emit_interval_ms ?? 30000;

  return pollGeneric(config, async () => {
    // ── Channel 1: status.json (primary signal) ──
    const status = loadStatus(config, moduleDir);

    if (!status) {
      const filePath = statusPath(config, moduleDir);
      if (fs.existsSync(filePath)) return { parse_error: true };
      // Fall through to session check if available
    } else {
      if (expectedStatuses.includes(status.status)) {
        return { done: true, result: pollResult(true, 'target_reached', status) };
      }
      if (status.status === STATUS.BLOCKED) {
        return { done: true, result: pollResult(false, 'blocked', status) };
      }
      if (status.status === STATUS.RATE_LIMITED) {
        const tracked = sessionLabel ? getTrackedAgent(sessionLabel) : null;
        const pollIdentity = resolveStatusPollIdentity(moduleDir, status, tracked, sessionLabel);
        return {
          rate_limited: true,
          status: buildModuleSessionRateLimitStatus(status, {
            moduleId: pollIdentity.module_id || moduleDir,
            phaseFallback: pollIdentity.agent_type || status.current_phase || null,
            agentTypeFallback: pollIdentity.agent_type || status.current_phase || null,
            runIdFallback: getRunId(config) || null,
            attemptFallback: pollIdentity.attempt ?? null,
            dispatchIdFallback: pollIdentity.dispatch_id ?? null,
            gatewayLabelFallback: pollIdentity.gateway_label || pollIdentity.label || null,
            sessionKeyFallback: pollIdentity.session_key ?? null,
          }),
        };
      }
    }

    // ── Channel 2: ACP transcript/session terminal state (fail-fast on crash) ──
    if (sessionLabel) {
      acpState = await getAcpMonitorState(config, sessionLabel, acpState);
      const tracked = getTrackedAgent(sessionLabel);
      const currentStatus = status || loadStatus(config, moduleDir) || { module_id: moduleDir, current_phase: 'forge' };
      const pollIdentity = resolveStatusPollIdentity(moduleDir, currentStatus, tracked, sessionLabel);
      const liveAgentType = pollIdentity.agent_type || 'forge';
      const observabilityData = {
        session_state: acpState.sessionState,
        detail: acpState.detail,
        gateway_unreachable: acpState.gatewayUnreachable === true,
        gateway_detail: acpState.gatewayDetail || null,
        transcript_detail: acpState.transcript?.lastDetail || null,
        gateway_label: pollIdentity.gateway_label || pollIdentity.label || null,
        module_id: pollIdentity.module_id,
        gate_id: pollIdentity.gate_id,
        attempt: pollIdentity.attempt,
        dispatch_id: pollIdentity.dispatch_id,
        session_key: pollIdentity.session_key,
        agent_type: liveAgentType,
      };
      updateGatewayObservability(ctx, observabilityState.gateway, observabilityData);
      updateTranscriptObservability(ctx, observabilityState.transcript, observabilityData);

      const newTranscriptLines = acpState.transcript?.newLines || [];
      if (newTranscriptLines.length > 0) {
        Promise.resolve().then(() => {
          try {
            publishTranscriptDelta(ctx, {
              label: pollIdentity.label,
              agent_type: liveAgentType,
              module_id: pollIdentity.module_id,
              gate_id: pollIdentity.gate_id,
              gate_type: pollIdentity.gate_type,
              session_key: pollIdentity.session_key,
              dispatch_id: pollIdentity.dispatch_id,
            }, newTranscriptLines, emitTranscriptLine);
          } catch { /* non-critical */ }
        }).catch(() => {});
      }

      if (Date.now() - lastProgressEmit >= PROGRESS_INTERVAL_MS) {
        emitAgentProgress(ctx, {
          agent_type: liveAgentType,
          label: pollIdentity.label,
          module_id: pollIdentity.module_id,
          gate_id: pollIdentity.gate_id,
          gate_type: pollIdentity.gate_type,
          session_key: pollIdentity.session_key,
          dispatch_id: pollIdentity.dispatch_id,
          elapsed_seconds: Math.round((Date.now() - startTime) / 1000),
          transcript_events: acpState.transcript?.eventCount ?? null,
          last_activity: acpState.transcript?.lastDetail || null,
          status: 'active',
        });
        lastProgressEmit = Date.now();
      }

      if (acpState.rateLimited) {
        const rateLimitedStatus = {
          ...currentStatus,
          ...(currentStatus.run_id == null && getRunId(config) != null ? { run_id: getRunId(config) } : {}),
          module_id: currentStatus.module_id || pollIdentity.module_id,
          ...(currentStatus.gate_id == null && pollIdentity.gate_id == null
            ? {}
            : { gate_id: currentStatus.gate_id || pollIdentity.gate_id, gate_type: currentStatus.gate_type ?? pollIdentity.gate_type ?? null }),
          ...(currentStatus.attempt == null && pollIdentity.attempt != null ? { attempt: pollIdentity.attempt } : {}),
          ...(resolveStatusDispatchId(currentStatus) == null && pollIdentity.dispatch_id != null ? { dispatch_id: pollIdentity.dispatch_id } : {}),
          ...(resolveStatusGatewayLabel(currentStatus) == null && (pollIdentity.gateway_label || pollIdentity.label) ? { gateway_label: pollIdentity.gateway_label || pollIdentity.label } : {}),
          ...(resolveStatusSessionKey(currentStatus) == null && pollIdentity.session_key != null ? { session_key: pollIdentity.session_key } : {}),
          current_phase: currentStatus.current_phase || liveAgentType,
          agent_type: currentStatus.agent_type || liveAgentType,
          rate_limit_reason: acpState.detail,
          detail: currentStatus.detail || acpState.detail,
        };
        const normalizedRateLimitedStatus = buildModuleSessionRateLimitStatus(rateLimitedStatus, {
          moduleId: currentStatus.module_id || pollIdentity.module_id || moduleDir,
          phaseFallback: liveAgentType,
          agentTypeFallback: liveAgentType,
          runIdFallback: getRunId(config) || null,
          attemptFallback: pollIdentity.attempt ?? null,
          dispatchIdFallback: pollIdentity.dispatch_id ?? null,
          gatewayLabelFallback: pollIdentity.gateway_label || pollIdentity.label || null,
          sessionKeyFallback: pollIdentity.session_key ?? null,
        });
        transitionModuleStatus(normalizedRateLimitedStatus, STATUS.RATE_LIMITED, {
          note: 'ACP session rate limited',
          phase: normalizedRateLimitedStatus.current_phase,
        });
        return { rate_limited: true, status: normalizedRateLimitedStatus };
      }

      if (acpState.terminal) {
        // Session died — check if HEAD moved (agent pushed before crashing)
        const gitSync = syncRepoForPolling(config, moduleDir);
        if (!gitSync.ok) {
          return { done: true, result: pollResult(false, 'git_error', gitSync.error) };
        }
        invalidateHeadHash();
        const headNow = headHash();
        if (headBefore && headNow !== headBefore) {
          log('INFO', `Session ${acpState.sessionState} but HEAD moved (${headBefore} → ${headNow}) — auto-advancing to READY_FOR_TESTING`);
          const currentStatus = loadStatus(config, moduleDir);
          if (currentStatus && currentStatus.status !== STATUS.READY_FOR_TESTING) {
            transitionModuleStatus(currentStatus, STATUS.READY_FOR_TESTING, {
              note: `Session ${acpState.sessionState}, HEAD moved — auto-advanced`,
            });
            saveStatus(config, moduleDir, currentStatus);
          }
          return { done: true, result: pollResult(true, 'target_reached', currentStatus || status) };
        }
        log('WARN', `Session ${acpState.sessionState} without HEAD movement — agent crashed or made no changes (${acpState.reason})`);
        return {
          done: true,
          result: pollResult(false, 'session_ended_no_changes', {
            ...(status && typeof status === 'object' ? status : {}),
            module_id: pollIdentity.module_id,
            gate_id: pollIdentity.gate_id,
            session_key: pollIdentity.session_key,
            current_phase: liveAgentType,
            state: acpState.sessionState,
            reason: acpState.reason,
            detail: acpState.detail,
          }, {
            transcript: acpState.transcript || null,
          }),
        };
      }
    }

    const logStatus = status?.status || 'no-status-file';
    const logPhase = status?.current_phase || '';
    return { done: false, logMsg: `status=${logStatus} phase=${logPhase}` };
  }, timeoutMinutes, moduleDir);
}

// ─── Session End Poller ───────────────────────────────────────────────────────

/**
 * @param {object} config
 * @param {string} sessionLabel - ACP session label (used to look up childSessionKey)
 * @param {number} timeoutMinutes - Max wait time
 * @param {string} logLabel - For progress messages (e.g. "gatefix-final-test-1")
 * @returns {{ completed: boolean, hasChanges: boolean, reason: string, transcript: object|null }}
 */
export async function pollForSessionEnd(config, sessionLabel, timeoutMinutes, logLabel = 'session-poll', opts = {}) {
  let acpState = {};
  const {
    moduleId: explicitModuleId = null,
    gateId = null,
    gateType = null,
    attempt = null,
    agentType = null,
    provider = 'anthropic',
  } = opts;
  const observabilityState = {
    gateway: { active: false, degradedAt: null },
    transcript: { active: false, degradedAt: null },
  };
  const interval = config.poll_interval_seconds * 1000;
  let deadline = Date.now() + timeoutMinutes * 60 * 1000;
  const startTime = Date.now();
  const nudgeThreshold = config.session_nudge_threshold ?? 0.75;
  const sessionEndGraceMs = config.session_end_grace_ms ?? 15000;
  const sessionProgressLogIntervalMs = config.session_progress_log_interval_ms ?? 30000;
  let nudgeSent = false;
  let firstCycle = true;
  const _monCfg = getAcpMonitorConfig(config);
  let _transcriptExtensions = 0;
  const _maxTranscriptExtensions = _monCfg.max_transcript_extensions;
  const _transcriptGraceMs = _monCfg.transcript_grace_ms;

  // Resolve sessionKey from label
  const _trackedEntry = getTrackedAgent(sessionLabel);
  const sessionKey = _trackedEntry?.sessionKey;
  if (!sessionKey) {
    log('ERROR', `[${logLabel}] No sessionKey for label '${sessionLabel}' — cannot poll`);
    return { completed: false, hasChanges: false, reason: 'no_session_key' };
  }

  // Telemetry context and transcript streaming setup
  const _streamLogPath = _trackedEntry?.streamLogPath || null;
  const _moduleId = explicitModuleId || _trackedEntry?.moduleId || logLabel || sessionLabel;
  const _telemetryIdentity = resolveSessionPollIdentity({
    tracked: _trackedEntry,
    explicitModuleId,
    gateId,
    gateType,
    sessionKey,
    logLabel,
    sessionLabel,
  });
  const _isSubagent = _trackedEntry?.runtime === 'subagent';
  const _ctx = { config };
  const _rateLimitPhase = agentType || sessionLabel.split('-')[0] || null;
  const _rateLimitIdentity = {
    run_id: getRunId(config),
    module_id: gateId ? null : _moduleId,
    gate_id: gateId || null,
    gate_type: gateId ? (gateType ?? null) : undefined,
    phase: _rateLimitPhase,
    attempt,
    dispatch_id: _trackedEntry?.telemetry_dispatch_id ?? null,
    gateway_label: _trackedEntry?.gatewayLabel || sessionLabel || null,
    session_key: sessionKey,
  };
  let _rateLimitPauses = 0;
  const _maxRateLimitPauses = config.rate_limit?.max_pauses_per_module ?? 5;
  let _lastProgressEmit = startTime;
  let _lastSessionProgressLogAt = 0;
  let _lastSessionProgressStateKey = null;
  const PROGRESS_INTERVAL_MS = config.session_progress_emit_interval_ms ?? 30000;

  // Mirror subagent transcript to .swarm/logs after session completes (non-critical).
  // For ACP sessions _streamLogPath is an ephemeral .acp-stream.jsonl; for subagents
  // it's the full session transcript — worth preserving alongside other pipeline logs.
  function _mirrorSubagentTranscript() {
    if (!_isSubagent || !_streamLogPath || !config._logDir) return;
    try {
      if (!fs.existsSync(_streamLogPath)) return;
      const destDir = path.join(config._logDir, 'modules', _moduleId);
      fs.mkdirSync(destDir, { recursive: true });
      const dest = path.join(destDir, 'subagent-transcript.jsonl');
      copyRedactedTranscriptArtifact(_streamLogPath, dest);
      log('OK', `[${logLabel}] Subagent transcript metadata mirrored → ${dest}`);
    } catch (e) {
      log('DEBUG', `[${logLabel}] Transcript mirror failed (non-critical): ${e.message?.split('\n')[0]}`);
    }
  }

  // Capture HEAD before Forge starts — used for change detection
  const headBefore = headHash();

  // Two completion signals (first one wins):
  //   1. HEAD movement + grace period — agent pushed commits, wait for more, then done
  //   2. Session closed/error — agent finished (with or without pushing)
  //
  // 'idle' is intentionally NOT treated as a completion signal — it's ambiguous
  // with oneshot sessions (can mean initializing, between tool calls, or finished).
  // Only 'closed' and 'error' are unambiguous end states.

  const POST_CHANGE_GRACE_MS = 60000; // 60s of no new changes after HEAD moves = done
  let lastHeadChangeTime = 0;
  let lastKnownHead = headBefore;       // Track the last HEAD we've seen (for multi-commit detection)
  let sessionEndDetected = false;        // Set when session_status reports closed/error
  let sessionEndGraceStart = 0;          // When we first detected session end

  // After session closes, allow a short grace for the final git push to arrive.
  // ACP sessions sometimes close before the push completes on the remote.
  log('INFO', `[${logLabel}] Waiting for session '${sessionLabel}' (${sessionKey}) to complete | timeout: ${timeoutMinutes}min`);

  _transcriptExtensionLoop: while (true) { // outer loop handles transcript-based deadline extensions
  while (Date.now() < deadline) {
    if (!firstCycle) {
      await sleep(interval);
      const gitSync = syncRepoForPolling(config, logLabel);
      if (!gitSync.ok) {
        return { completed: false, hasChanges: false, reason: 'git_error', error: gitSync.error };
      }
    } else {
      firstCycle = false;
    }

    // Check if HEAD moved (agent pushed commits)
    invalidateHeadHash();
    const headNow = headHash();

    if (headNow !== lastKnownHead) {
      lastHeadChangeTime = Date.now();
      lastKnownHead = headNow;
      log('INFO', `[${logLabel}] HEAD moved (${headNow}) — agent pushed changes. Waiting ${POST_CHANGE_GRACE_MS / 1000}s grace for more...`);
    }

    // ── Signal 1: HEAD moved and grace period expired ──
    if (lastHeadChangeTime > 0 && (Date.now() - lastHeadChangeTime) >= POST_CHANGE_GRACE_MS) {
      log('INFO', `[${logLabel}] No new changes for ${POST_CHANGE_GRACE_MS / 1000}s after HEAD movement — session complete`);

      // Commit any remaining uncommitted changes
      let hasChanges = true;
      try {
        gitExec(config.repo_root, ['add', '-A'], { stdio: 'ignore' });
        const porcelain = gitExec(config.repo_root, ['status', '--porcelain']);
        if (porcelain) {
          gitExec(config.repo_root, ['commit', '-m', `[pipeline] ${logLabel}: agent output`], { stdio: 'ignore' });
          invalidateHeadHash();
          log('OK', `[${logLabel}] Committed remaining uncommitted files`);
        }
      } catch (e) {
        log('DEBUG', `[${logLabel}] Post-session commit: ${e.message?.split('\n')[0]}`);
      }

      _mirrorSubagentTranscript();
      return { completed: true, hasChanges, reason: 'session_ended', transcript: acpState.transcript || null };
    }

    // ── Signal 2: Session closed/error (ACP session no longer running) ──
    // Check session_status every cycle. 'closed' or 'error' = session is done.
    // If HEAD also moved, return hasChanges=true. If not, the agent completed
    // without pushing (crash, or no changes made).
    if (!sessionEndDetected) {
      acpState = await getAcpMonitorState(config, sessionLabel, acpState);
      const observabilityData = {
        session_state: acpState.sessionState,
        detail: acpState.detail,
        gateway_unreachable: acpState.gatewayUnreachable === true,
        gateway_detail: acpState.gatewayDetail || null,
        transcript_detail: acpState.transcript?.lastDetail || null,
        gateway_label: _telemetryIdentity.gateway_label || _telemetryIdentity.label || sessionLabel,
        module_id: _telemetryIdentity.module_id,
        gate_id: _telemetryIdentity.gate_id,
        attempt: _telemetryIdentity.attempt,
        dispatch_id: _telemetryIdentity.dispatch_id,
        session_key: _telemetryIdentity.session_key,
        agent_type: sessionLabel.split('-')[0] || null,
      };
      updateGatewayObservability(_ctx, observabilityState.gateway, observabilityData);
      updateTranscriptObservability(_ctx, observabilityState.transcript, observabilityData);

      // Transcript streaming: publish new lines (fire-and-forget)
      const newTranscriptLines = acpState.transcript?.newLines || [];
      if (newTranscriptLines.length > 0) {
        Promise.resolve().then(() => {
          try {
            publishTranscriptDelta(_ctx, {
              label: _telemetryIdentity.label || sessionLabel,
              agent_type: sessionLabel.split('-')[0] || 'forge',
              module_id: _telemetryIdentity.module_id,
              gate_id: _telemetryIdentity.gate_id,
              gate_type: _telemetryIdentity.gate_type,
              session_key: _telemetryIdentity.session_key,
              dispatch_id: _telemetryIdentity.dispatch_id,
            }, newTranscriptLines, emitTranscriptLine);
          } catch { /* non-critical */ }
        }).catch(() => {});
      }

      // Agent progress every 30s
      if (Date.now() - _lastProgressEmit >= PROGRESS_INTERVAL_MS) {
        const _agentType = sessionLabel.split('-')[0] || 'forge';
        emitAgentProgress(_ctx, {
          agent_type: _agentType,
          label: _telemetryIdentity.label || sessionLabel,
          module_id: _telemetryIdentity.module_id,
          gate_id: _telemetryIdentity.gate_id,
          gate_type: _telemetryIdentity.gate_type,
          session_key: _telemetryIdentity.session_key,
          dispatch_id: _telemetryIdentity.dispatch_id,
          elapsed_seconds: Math.round((Date.now() - startTime) / 1000),
          transcript_events: acpState.transcript?.eventCount ?? null,
          last_activity: acpState.transcript?.lastDetail || null,
          status: 'active',
        });
        _lastProgressEmit = Date.now();
      }

      if (acpState.rateLimited) {
        _rateLimitPauses++;
        const rateLimitStep = await processSessionRateLimit(config, {
          ..._rateLimitIdentity,
          agent_type: _rateLimitPhase,
          provider,
          detail: acpState.detail || null,
          transcript: acpState.transcript || null,
        }, {
          pauseCount: _rateLimitPauses,
          maxPauses: _maxRateLimitPauses,
          normalizeStatus: (status) => {
            const normalizedStatus = {
              ...(status || {}),
              detail: status?.detail || acpState.detail || null,
              transcript: status?.transcript || acpState.transcript || null,
            };
            if (_rateLimitIdentity.gate_id) {
              return buildGateSessionRateLimitStatus(normalizedStatus, {
                gateId: _rateLimitIdentity.gate_id,
                gateType: _rateLimitIdentity.gate_type ?? null,
                agentTypeFallback: _rateLimitPhase,
                runIdFallback: _rateLimitIdentity.run_id || null,
                attemptFallback: _rateLimitIdentity.attempt ?? null,
                dispatchIdFallback: _rateLimitIdentity.dispatch_id ?? null,
                gatewayLabelFallback: _rateLimitIdentity.gateway_label || null,
                sessionKeyFallback: _rateLimitIdentity.session_key || null,
              });
            }
            return buildModuleSessionRateLimitStatus(normalizedStatus, {
              moduleId: _rateLimitIdentity.module_id || _moduleId,
              phaseFallback: _rateLimitPhase,
              agentTypeFallback: _rateLimitPhase,
              runIdFallback: _rateLimitIdentity.run_id || null,
              attemptFallback: _rateLimitIdentity.attempt ?? null,
              dispatchIdFallback: _rateLimitIdentity.dispatch_id ?? null,
              gatewayLabelFallback: _rateLimitIdentity.gateway_label || null,
              sessionKeyFallback: _rateLimitIdentity.session_key || null,
            });
          },
          pauseLogMessage: ({ pauseCount, maxPauses, cooldownHours, resumeAt }) => `[${logLabel}] ACP session rate limited (pause ${pauseCount}/${maxPauses}) — sleeping ${cooldownHours}h (resume at ${resumeAt.toISOString()})`,
          resumeLogMessage: () => `[${logLabel}] ACP session rate limit cooldown complete — resuming monitor`,
          exhaustedLogMessage: ({ pauseCount, maxPauses }) => `[${logLabel}] ACP session rate limit pauses exhausted (${pauseCount}/${maxPauses})`,
        });
        if (rateLimitStep.exhausted) {
          return rateLimitStep.result;
        }

        deadline += rateLimitStep.cooldownMs;

        acpState = {
          ...acpState,
          rateLimited: false,
          transcript: acpState.transcript
            ? { ...acpState.transcript, rateLimited: false }
            : acpState.transcript,
        };
        continue;
      }

      if (acpState.terminal) {
        sessionEndDetected = true;
        sessionEndGraceStart = Date.now();
        log('INFO', `[${logLabel}] Session ${acpState.sessionState} (${acpState.reason}) — waiting ${sessionEndGraceMs / 1000}s for final push to arrive`);
      }
    }

    // Session ended + grace expired → done (even without HEAD movement)
    if (sessionEndDetected && (Date.now() - sessionEndGraceStart) >= sessionEndGraceMs) {
      // One final git pull to catch any last-second push
      const finalGitSync = syncRepoForPolling(config, logLabel);
      if (!finalGitSync.ok) {
        return { completed: false, hasChanges: false, reason: 'git_error', error: finalGitSync.error };
      }
      invalidateHeadHash();
      const finalHead = headHash();
      const hasChanges = finalHead !== headBefore;

      if (hasChanges) {
        log('OK', `[${logLabel}] Session closed with changes (HEAD: ${headBefore} → ${finalHead})`);
      } else {
        log('WARN', `[${logLabel}] Session closed without pushing changes — agent may have crashed or made no edits`);
      }

      // Commit any uncommitted local changes (defensive)
      try {
        gitExec(config.repo_root, ['add', '-A'], { stdio: 'ignore' });
        const porcelain = gitExec(config.repo_root, ['status', '--porcelain']);
        if (porcelain) {
          gitExec(config.repo_root, ['commit', '-m', `[pipeline] ${logLabel}: agent output (session closed)`], { stdio: 'ignore' });
          invalidateHeadHash();
        }
      } catch { /* ok */ }

      _mirrorSubagentTranscript();
      return { completed: true, hasChanges, reason: hasChanges ? 'session_ended' : 'session_closed_no_changes', transcript: acpState.transcript || null };
    }

    // ── Timeout nudge ──
    // When the session is past the configured threshold (default 75%) of its
    // timeout, send a one-time reminder. This rescues agents that are working
    // but lost in detail — they can prioritize and wrap up.
    const percentElapsed = (Date.now() - startTime) / (timeoutMinutes * 60 * 1000);
    if (!sessionEndDetected && !nudgeSent && percentElapsed >= nudgeThreshold) {
      log('WARN', `[${logLabel}] Session at ${Math.round(percentElapsed * 100)}% of timeout — sending completion nudge`);
      nudgeSent = true;
      try {
        const remainingMin = Math.round((deadline - Date.now()) / 60000);
        await gatewayInvoke('sessions_send', {
          sessionKey,
          message: `TIMEOUT WARNING: You have ~${remainingMin} minutes remaining. Complete your current task and write your output files now. Unfinished work will be lost.`,
        }, 10000);
      } catch { /* best effort — session may have just ended */ }
    }

    // Progress logging
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const remaining = Math.round((deadline - Date.now()) / 1000);
    const sessionProgressStateKey = buildSessionProgressStateKey(sessionEndDetected);
    const sessionProgressMsg = `Session active | ${elapsed}s elapsed, ${remaining}s remaining${sessionEndDetected ? ' (session closed, waiting for push)' : ''}`;
    const shouldLogSessionProgress = !_lastSessionProgressStateKey
      || sessionProgressStateKey !== _lastSessionProgressStateKey
      || (Date.now() - _lastSessionProgressLogAt) >= sessionProgressLogIntervalMs;
    if (shouldLogSessionProgress) {
      log('INFO', `[${logLabel}] ${sessionProgressMsg}`);
      _lastSessionProgressLogAt = Date.now();
      _lastSessionProgressStateKey = sessionProgressStateKey;
    }
  }

  // Inner while loop exited (deadline reached) — check transcript before giving up
  if (!sessionEndDetected && _transcriptExtensions < _maxTranscriptExtensions) {
    const _timeoutMonitorState = await getAcpMonitorState(config, sessionLabel, acpState);
    const _tsState = _timeoutMonitorState?.transcript || null;
    acpState = _timeoutMonitorState || acpState;
    if (_tsState?.lastActivityPoll === 0 && _tsState?.eventCount > 0) {
      _transcriptExtensions++;
      deadline = Date.now() + _transcriptGraceMs;
      log('WARN', `[${logLabel}] Transcript active (${_tsState.eventCount} events) — extending deadline by ${_transcriptGraceMs / 1000}s (extension ${_transcriptExtensions}/${_maxTranscriptExtensions})`);
      continue _transcriptExtensionLoop;
    }
  }
  break _transcriptExtensionLoop;
  } // end _transcriptExtensionLoop

  const _finalTranscript = acpState.transcript || null;
  const _transcriptDesc = _finalTranscript
    ? (_finalTranscript.lastActivityPoll === 0
        ? `active (${_finalTranscript.eventCount} events)`
        : `stale (no activity for ${_finalTranscript.lastActivityPoll} polls)`)
    : 'unknown';
  log('WARN', `[${logLabel}] Timeout — session still running after ${timeoutMinutes}min | Transcript: ${_transcriptDesc}`);
  return { completed: false, hasChanges: false, reason: 'timeout', transcript: _finalTranscript };
}

// ─── Redis Completion Reader ──────────────────────────────────────────────────
// Reads the Buster completion stream via direct import of redis.js.
// Single connection reused across all poll cycles — no temp files, no subprocess spawns.
//
// Archive pattern:
//   Active stream:  swarm:pipeline:<project>:completions     (current entries)
//   Archive stream: swarm:pipeline:<project>:completions:log (processed entries)
//
// Before Buster dispatch: archiveModuleCompletions() moves old entries for this
// module from active → archive, so pollDual never reads stale completions.
// After pipeline reads a completion: the entry stays in the active stream until
// the next archiveModuleCompletions() call clears it.

const COMPLETION_ARCHIVE_MAX_LEN = 1000;

let _redisModule = null;
let _redisImportAttempted = false;
let _redisImportError = null;

async function getRedisModule(config) {
  if (_redisImportAttempted) return _redisModule;
  _redisImportAttempted = true;

  const agentConf = Object.values(config.agents || {}).find(
    a => typeof a === 'object' && a?.dispatch === 'redis' && a?.redis_js_path
  );
  const redisPath = agentConf?.redis_js_path || '/app/skills/pipeline/tools/redis.js';

  try {
    const validated = validateSafePath(redisPath, 'redis.js (completion reader)');
    if (isCanonicalRedisModulePath(validated)) {
      _redisModule = redisTool?.default ?? redisTool;
    } else {
      // Justified override-only dynamic import: the hot/default completion reader stays static,
      // while validated alternate adapters remain injectable for tests and explicit deployments.
      const mod = await import(pathToFileURL(validated).href);
      _redisModule = mod?.default ?? mod;
    }
    _redisImportError = null;
    log('INFO', `Redis module loaded via ${isCanonicalRedisModulePath(validated) ? 'static canonical import' : 'validated override import'}`);

    // Set log callback for Redis operation tracing → redis/redis-ops.jsonl
    if (_redisModule?.setLogCallback && config._logDir) {
      _redisModule.setLogCallback((event) => {
        logRedisOperation(config, event);
      });
    }
  } catch (e) {
    _redisImportError = `Redis module import failed: ${e.message}`;
    log('ERROR', `${_redisImportError} — completion polling will fall back to Git only`);
    _redisModule = null;
  }
  return _redisModule;
}

/**
 * Archive old completion entries for a module before dispatching a new Buster attempt.
 * Moves entries from the active stream to the archive stream, preventing pollDual
 * from reading stale FAIL/PASS entries from a previous attempt.
 *
 * Called once before each Buster dispatch (not on every poll cycle).
 */
export async function archiveModuleCompletions(config, moduleId) {
  const stream = completionStreamKey(config);
  const archiveStream = `${stream}:log`;

  try {
    const redisMod = await getRedisModule(config);
    if (!redisMod) return { archived: 0 };
    const result = await redisMod.archiveCompletions(stream, archiveStream, moduleId, COMPLETION_ARCHIVE_MAX_LEN);
    if (result.archived > 0) {
      log('INFO', `Archived ${result.archived} old completion(s) for ${moduleId} → ${archiveStream}`);
    }
    return result;
  } catch (e) {
    log('DEBUG', `Completion archive failed (non-critical): ${e.message}`);
    return { archived: 0 };
  }
}

export async function readCompletionFromRedis(config, moduleId, expectedIdentity = {}, opts = {}) {
  const stream = completionStreamKey(config);
  const ctx = { config };
  const observabilityState = opts.observabilityState || null;
  const observabilityIdentity = {
    module_id: opts.module_id ?? moduleId ?? null,
    gate_id: opts.gate_id ?? null,
    gate_type: opts.gate_type ?? null,
    session_key: opts.session_key ?? expectedIdentity.session_key ?? null,
    agent_type: opts.agent_type || 'buster',
    stream_key: stream,
  };

  try {
    const redisMod = await getRedisModule(config);
    if (!redisMod?.readCompletion) {
      if (observabilityState) {
        updateRedisCompletionObservability(ctx, observabilityState, {
          ...observabilityIdentity,
          redis_unavailable: true,
          detail: _redisImportError || 'redis completion reader unavailable',
        });
      }
      return null;
    }

    const result = await redisMod.readCompletion(stream, moduleId, expectedIdentity);
    if (observabilityState) {
      updateRedisCompletionObservability(ctx, observabilityState, {
        ...observabilityIdentity,
        session_key: resolveResultSessionKey(result, observabilityIdentity.session_key),
      });
    }
    return result;
  } catch (e) {
    if (observabilityState) {
      updateRedisCompletionObservability(ctx, observabilityState, {
        ...observabilityIdentity,
        completion_read_failed: true,
        detail: `Redis completion read failed: ${e.message}`,
      });
    }
    log('DEBUG', `Redis completion read failed for ${moduleId}: ${e.message}`);
    return null;
  }
}

// ─── Dual-Channel Polling (Redis + Git) ──────────────────────────────────────
// Checks BOTH the Redis completion stream (fast path, seconds) and
// Git-polled status.json (fallback, 30s intervals). First signal wins.
//
// This replaces pollStatus for the Buster phase only. Forge phase
// continues to use pure Git polling (Forge is ACP, no Redis signal).
// Built on pollGeneric — gitPullForPolling is handled by the scaffolding.

export function mapRedisStatus(redisStatus) {
  const map = {
    'PASS': STATUS.PASS,
    'FAIL': STATUS.FAIL,
    'ISSUES_FOUND': STATUS.FAIL,
    'BLOCKED': STATUS.BLOCKED,
    'RATE_LIMITED': STATUS.RATE_LIMITED,
  };
  return map[(redisStatus || '').toUpperCase()] || STATUS.FAIL;
}

export function isRedisTimeoutOutcome(redisEntry = {}) {
  return String(redisEntry?.outcome || '').toUpperCase() === 'TIMEOUT';
}

export function isRedisRateLimitedOutcome(redisEntry = {}) {
  return String(redisEntry?.outcome || '').toUpperCase() === 'RATE_LIMITED';
}

export function isBusterPipelineOwnedSource(source = '') {
  return /(?:^|-)(?:orchestrator|buster-pipeline)/i.test(String(source || ''));
}

export function isTerminalOwnedRateLimitedOutcome(redisEntry = {}) {
  if (!isRedisRateLimitedOutcome(redisEntry)) return false;
  return isBusterPipelineOwnedSource(redisEntry?.source || '');
}

export async function pollDual(config, moduleDir, moduleId, expectedStatuses, timeoutMinutes, expectedIdentity = {}) {
  const redisObservabilityState = { active: false, degradedAt: null };
  const moduleRateLimitStatusOptions = {
    moduleId,
    phaseFallback: 'buster',
    agentTypeFallback: 'buster',
    runIdFallback: expectedIdentity.run_id ?? getRunId(config) ?? null,
    attemptFallback: expectedIdentity.attempt ?? null,
    dispatchIdFallback: expectedIdentity.dispatch_id ?? null,
    gatewayLabelFallback: expectedIdentity.gateway_label ?? expectedIdentity.dispatch_id ?? null,
    sessionKeyFallback: expectedIdentity.session_key ?? null,
  };

  return pollGeneric(config, async () => {
    // ── Channel 1: Redis Completion Stream (fast path) ──
    const redisEntry = await readCompletionFromRedis(config, moduleId, expectedIdentity, {
      observabilityState: redisObservabilityState,
      module_id: moduleId,
      session_key: expectedIdentity.session_key || null,
      agent_type: 'buster',
    });
    if (redisEntry && redisEntry.status) {
      const mappedStatus = mapRedisStatus(redisEntry.status);
      log('OK', `Redis completion: status=${redisEntry.status} mapped=${mappedStatus} source=${redisEntry.source || 'unknown'} run=${redisEntry.run_id || '—'} attempt=${redisEntry.attempt || '—'} dispatch=${redisEntry.dispatch_id || '—'}`);

      if (isTerminalOwnedRateLimitedOutcome(redisEntry)) {
        return {
          done: true,
          result: buildModuleTerminalOwnedRedisRateLimitExitResult(redisEntry, {
            expectedIdentity,
            moduleId,
            completionSummary: redisEntry.summary || null,
            forgeCommitHash: redisEntry.commit_hash || null,
          }),
        };
      }

      if (isRedisRateLimitedOutcome(redisEntry)) {
        return { rate_limited: true, status: buildModuleSessionRateLimitStatus(redisEntry, moduleRateLimitStatusOptions) };
      }

      if (isRedisTimeoutOutcome(redisEntry)) {
        return { done: true, result: pollResult(false, 'timeout', {
          module_id: moduleId,
          status: STATUS.FAIL,
          completion_summary: redisEntry.summary || null,
          forge_commit_hash: redisEntry.commit_hash || null,
          _source: 'redis',
          _redis_entry: redisEntry,
        })};
      }

      if (expectedStatuses.includes(mappedStatus)) {
        return { done: true, result: pollResult(true, 'target_reached', {
          module_id: moduleId,
          status: mappedStatus,
          completion_summary: redisEntry.summary || null,
          forge_commit_hash: redisEntry.commit_hash || null,
          _source: 'redis',
          _redis_entry: redisEntry,
        })};
      }
      if (mappedStatus === STATUS.BLOCKED) {
        return { done: true, result: pollResult(false, 'blocked', redisEntry) };
      }
      if (mappedStatus === STATUS.RATE_LIMITED) {
        return { rate_limited: true, status: buildModuleSessionRateLimitStatus(redisEntry, moduleRateLimitStatusOptions) };
      }
    }

    // ── Channel 2: Git status.json (fallback) ──
    // gitPullForPolling already called by pollGeneric before this checkFn
    const status = loadStatus(config, moduleDir);

    if (!status) {
      const filePath = statusPath(config, moduleDir);
      if (fs.existsSync(filePath)) return { parse_error: true };
      return { done: false };
    }

    if (expectedStatuses.includes(status.status)) {
      return { done: true, result: pollResult(true, 'target_reached', { ...status, _source: 'git' }) };
    }
    if (status.status === STATUS.BLOCKED) {
      return { done: true, result: pollResult(false, 'blocked', status) };
    }
    if (status.status === STATUS.RATE_LIMITED) {
      return { rate_limited: true, status: buildModuleSessionRateLimitStatus(status, moduleRateLimitStatusOptions) };
    }

    return { done: false, logMsg: `status=${status.status} phase=${status.current_phase}` };
  }, timeoutMinutes, `dual:${moduleId}`);
}

// ─── Rate-Limit Recovery Wrappers ─────────────────────────────────────────────

/** Forge-phase rate-limit recovery (wraps pollStatus). */
export async function pollWithRateLimitRecovery(config, moduleDir, expectedStatuses, timeoutMinutes, opts = {}) {
  return withRateLimitRecovery(config, moduleDir,
    () => pollStatus(config, moduleDir, expectedStatuses, timeoutMinutes, opts),
    { phase: 'forge' });
}

/** Buster-phase rate-limit recovery (wraps pollDual). */
export async function pollDualWithRateLimitRecovery(config, moduleDir, moduleId, expectedStatuses, timeoutMinutes, expectedIdentity = {}) {
  return withRateLimitRecovery(config, moduleDir,
    () => pollDual(config, moduleDir, moduleId, expectedStatuses, timeoutMinutes, expectedIdentity),
    { phase: 'buster', moduleId });
}
