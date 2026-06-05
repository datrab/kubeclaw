// services/polling.ts — Polling engine and dual-channel Redis+Git polling

import fs from 'fs';
import { log } from '../core/logger.ts';
import { getRunId } from '../core/runtime.ts';
import { loadStatus, saveStatus } from './status-store.ts';
import { getAcpMonitorState, getAcpMonitorConfig } from '../agents/acp-monitor.ts';
import { getTrackedAgent } from '../agents/lifecycle.ts';
import {
  withRateLimitRecovery,
  buildModuleSessionRateLimitStatus,
} from './rate-limit.ts';
import {
  resolveStatusSessionKey,
  resolveStatusDispatchId,
  resolveStatusGatewayLabel,
} from './correlation.ts';
import { gitPullForPolling, headHash, invalidateHeadHash } from '../integrations/git-worktree.ts';
import { transitionModuleStatus } from '../lifecycle-state.ts';
import { sanitizeAcpTranscriptEvidence, sanitizeTranscriptDetail } from '../redaction.ts';
import {
  buildAcpPollLogKey,
  resolveFilePollIdentity,
  resolveStatusPollIdentity,
  sessionLabelAgentType,
} from './polling-identity.ts';
import {
  maybeEmitAcpPollProgress,
  publishAcpTranscriptDelta,
  updateAcpPollObservability,
} from './polling-observability.ts';
import { waitForModuleBusterCompletion } from './polling-dual.ts';
import {
  AGENT_OBSERVABILITY_FORGE_COMPLETION_SOURCE,
  AGENT_OBSERVABILITY_FORGE_FALLBACK_NO_WORK_REASON,
  AGENT_OBSERVABILITY_FORGE_FALLBACK_READY_REASON,
  AGENT_OBSERVABILITY_FORGE_NO_WORK_REASON,
  AGENT_OBSERVABILITY_FORGE_READY_REASON,
  agentEndedSettleMs,
  buildForgeAgentEndedIdentity,
  buildForgeCompletionStatusFromDiff,
  collectMeaningfulForgeDiffEvidence,
  createAgentEndedTelemetryReader,
  shouldSettleAgentEnded,
} from './agent-observability-forge-completion.ts';
import { BudgetExhaustedError, createBudgetFromMinutes, isBudgetExhaustedError, sleep } from '../timing.ts';

export { archiveModuleCompletions } from './polling-redis-completion.ts';
export { BudgetExhaustedError, createBudget, createBudgetFromMinutes, isBudgetExhaustedError, sleep } from '../timing.ts';
export { pollForSessionEnd } from './polling-session-end.ts';

export {
  mapRedisStatus,
  isRedisTimeoutOutcome,
  isRedisRateLimitedOutcome,
  isBusterPipelineOwnedSource,
  isTerminalOwnedRateLimitedOutcome,
  projectCompletionState,
  adjudicateCompletionEvidence,
} from './completion-adjudicator.ts';

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

// ─── Primitives ───────────────────────────────────────────────────────────────

/**
 * Consistent poll result wrapper — all callers get the same shape.
 *
 * IMPORTANT: ok=true means "a terminal status was reached", NOT "module passed".
 * FAIL is a valid terminal status — the caller inspects status.status to decide
 * whether it's a PASS or FAIL and handles each case separately.
 *
 * @typedef {Object} PollResult
 * @property {boolean} ok - Whether a terminal status was reached (PASS, FAIL, etc.)
 * @property {string} reason - 'target_reached' | 'gate_fail' | 'timeout' | 'blocked' | 'rate_limited' | 'rate_limit_exhausted' | 'parse_corrupted' | 'spawn_failed' | 'completion_conflict'
 * @property {object|null} status - The lifecycle read-model projection or Redis completion data
 * @property {object|null} transcript - Optional ACP transcript state when polling owns it
 */
export function pollResult(ok, reason, status = null, extra = {}) {
  return { ok, reason, status, ...extra };
}

function syncRepoForPolling(config, label = 'poll') {
  if (!config?.repo_root) {
    const error = {
      code: 'POLLING_REPO_ROOT_REQUIRED',
      message: 'Git polling requires typed repo_root context',
      details: { reason: 'no_repo_root' },
    };
    log('ERROR', `[${label}] ${error.message}`);
    return { ok: false, error };
  }
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
 *   { rate_limited: true, status: object, ...extra } → rate limit detected
 *   { parse_error: true }                           → increment corruption counter
 * @param {number} timeoutMinutes - Max polling duration
 * @param {string} label - For log messages (e.g. "Gate 'review-01'" or "module-06")
 * @returns {PollResult}
 */
export async function pollGeneric(config, checkFn, timeoutMinutes, label = 'poll', opts = {}) {
  const interval = config.poll_interval_seconds * 1000;
  const progressLogIntervalMs = config.poll_progress_log_interval_ms ?? 30000;
  const budget = opts.budget || createBudgetFromMinutes(timeoutMinutes, { label });
  const startTime = Date.now();
  let consecutiveParseFailures = 0;
  const maxParseFailures = 10;
  let firstCycle = true;
  let lastProgressLogAt = 0;
  let lastProgressLogKey = null;
  log('INFO', `[${label}] Polling every ${config.poll_interval_seconds}s | timeout: ${timeoutMinutes}min`);

  try {
    while (true) {
      budget.throwIfExhausted();
      if (!firstCycle) {
        await sleep(interval, { budget });
        const gitSync = syncRepoForPolling(config, label);
        if (!gitSync.ok) return pollResult(false, 'git_error', gitSync.error);
      } else {
        firstCycle = false;
      }

      const check = await checkFn({ budget });

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
        const extra = { ...check };
        delete extra.rate_limited;
        delete extra.status;
        delete extra.done;
        delete extra.parse_error;
        delete extra.logMsg;
        delete extra.logKey;
        delete extra.result;
        return pollResult(false, 'rate_limited', check.status, extra);
      }

    // ── Progress log ──
      const progressMsg = check.logMsg || 'pending';
      const progressKey = check.logKey || progressMsg;
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      const remaining = Math.round(budget.remainingMs() / 1000);
      const shouldLogProgress = !lastProgressLogKey
        || progressKey !== lastProgressLogKey
        || (Date.now() - lastProgressLogAt) >= progressLogIntervalMs;
      if (shouldLogProgress) {
        log('INFO', `[${label}] ${progressMsg} | ${elapsed}s elapsed, ${remaining}s remaining`);
        lastProgressLogAt = Date.now();
        lastProgressLogKey = progressKey;
      }
    }
  } catch (error) {
    if (!isBudgetExhaustedError(error)) throw error;
    log('ERROR', `[${label}] Timeout after ${timeoutMinutes} minutes (${error.name})`);
    return pollResult(false, 'timeout', null, { error });
  }
}

// ─── File Poller ──────────────────────────────────────────────────────────────

/**
 * Simple file-existence poller built on pollGeneric.
 * Used by gates where the only completion signal is a file appearing on disk.
 *
 * @returns {PollResult} - ok=true if file found, ok=false on timeout
 */
export async function pollForFile(config, filePath, timeoutMinutes, label = 'file-poll', sessionLabel = null, opts = {}) {
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
      updateAcpPollObservability(
        ctx,
        observabilityState,
        acpState,
        pollIdentity,
        pollIdentity.agent_type || sessionLabel.split('-')[0] || null,
      );

      const liveAgentType = pollIdentity.agent_type || sessionLabelAgentType(sessionLabel || label) || 'review';
      publishAcpTranscriptDelta(ctx, pollIdentity, acpState, {
        label: pollIdentity.label,
        agentType: liveAgentType,
      });
      lastProgressEmit = maybeEmitAcpPollProgress(ctx, pollIdentity, acpState, {
        label: pollIdentity.label,
        agentType: liveAgentType,
        lastEmitAt: lastProgressEmit,
        intervalMs: PROGRESS_INTERVAL_MS,
        elapsedSeconds: Math.round((Date.now() - startTime) / 1000),
      });

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
            gateway_label: pollIdentity.gateway_label ?? null,
            current_phase: pollIdentity.agent_type || 'review',
            agent_type: pollIdentity.agent_type || 'review',
            reason: acpState.detail,
            detail: acpState.detail,
          },
        };
      }

      if (acpState.terminal) {
        const terminalDetail = sanitizeTranscriptDetail(acpState.detail);
        log('WARN', `[${label}] ACP monitor terminal (${acpState.reason}): ${terminalDetail || acpState.sessionState}`);
        return {
          done: true,
          result: pollResult(false, 'session_ended_no_output', {
            state: acpState.sessionState,
            reason: acpState.reason,
            detail: terminalDetail,
            module_id: pollIdentity.module_id,
            gate_id: pollIdentity.gate_id,
            session_key: pollIdentity.session_key,
          }, {
            transcript: sanitizeAcpTranscriptEvidence(acpState.transcript),
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
  }, timeoutMinutes, label, opts);
}

// ─── Status Poller ────────────────────────────────────────────────────────────

/**
 * Status poller — reads lifecycle read-model status until a target status is reached.
 * Lifecycle read models are the only local polling authority for module state.
 * Built on pollGeneric. Returns immediately on RATE_LIMITED (caller decides).
 *
 * opts.sessionLabel — if set, also checks ACP session state each cycle.
 * This helper is not the Forge completion path; Forge completion uses
 * pollForgeCompletion and the typed forge-completion.json artifact.
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
    // ── Channel 1: lifecycle read model (local signal) ──
    const status = loadStatus(config, moduleDir);

    if (!status) {
      // Fall through to session check if available. Local lifecycle state is not
      // the pipeline; lifecycle read models are the local status channel.
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
            phase: pollIdentity.agent_type || status.current_phase || null,
            identity: {
              agent_type: pollIdentity.agent_type || status.current_phase || null,
              run_id: getRunId(config) || null,
              attempt: pollIdentity.attempt ?? null,
              dispatch_id: pollIdentity.dispatch_id ?? null,
              gateway_label: pollIdentity.gateway_label ?? null,
              session_key: pollIdentity.session_key ?? null,
            },
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
      updateAcpPollObservability(ctx, observabilityState, acpState, pollIdentity, liveAgentType);
      publishAcpTranscriptDelta(ctx, pollIdentity, acpState, {
        label: pollIdentity.label,
        agentType: liveAgentType,
      });
      lastProgressEmit = maybeEmitAcpPollProgress(ctx, pollIdentity, acpState, {
        label: pollIdentity.label,
        agentType: liveAgentType,
        lastEmitAt: lastProgressEmit,
        intervalMs: PROGRESS_INTERVAL_MS,
        elapsedSeconds: Math.round((Date.now() - startTime) / 1000),
      });

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
          ...(resolveStatusGatewayLabel(currentStatus) == null && pollIdentity.gateway_label != null ? { gateway_label: pollIdentity.gateway_label } : {}),
          ...(resolveStatusSessionKey(currentStatus) == null && pollIdentity.session_key != null ? { session_key: pollIdentity.session_key } : {}),
          current_phase: currentStatus.current_phase || liveAgentType,
          agent_type: currentStatus.agent_type || liveAgentType,
          rate_limit_reason: acpState.detail,
          detail: currentStatus.detail || acpState.detail,
        };
        const normalizedRateLimitedStatus = buildModuleSessionRateLimitStatus(rateLimitedStatus, {
          moduleId: currentStatus.module_id || pollIdentity.module_id || moduleDir,
          phase: liveAgentType,
          identity: {
            agent_type: liveAgentType,
            run_id: getRunId(config) || null,
            attempt: pollIdentity.attempt ?? null,
            dispatch_id: pollIdentity.dispatch_id ?? null,
            gateway_label: pollIdentity.gateway_label ?? null,
            session_key: pollIdentity.session_key ?? null,
          },
        });
        const rateLimitTransition = transitionModuleStatus(normalizedRateLimitedStatus, STATUS.RATE_LIMITED, {
          note: 'ACP session rate limited',
          phase: normalizedRateLimitedStatus.current_phase,
        });
        return { rate_limited: true, status: normalizedRateLimitedStatus, lifecycleMutation: rateLimitTransition.lifecycleMutation };
      }

      if (acpState.terminal) {
        // Session died — check if HEAD moved (agent pushed before crashing)
        const gitSync = syncRepoForPolling(config, moduleDir);
        if (!gitSync.ok) {
          return { done: true, result: pollResult(false, 'git_error', gitSync.error) };
        }
        invalidateHeadHash(config);
        const headNow = headHash(config);
        if (headBefore && headNow !== headBefore) {
          log('INFO', `Session ${acpState.sessionState} but HEAD moved (${headBefore} → ${headNow}) — auto-advancing to READY_FOR_TESTING`);
          const currentStatus = loadStatus(config, moduleDir);
          if (currentStatus && currentStatus.status !== STATUS.READY_FOR_TESTING) {
            const headMovedTransition = transitionModuleStatus(currentStatus, STATUS.READY_FOR_TESTING, {
              note: `Session ${acpState.sessionState}, HEAD moved — auto-advanced`,
            });
            saveStatus(config, moduleDir, currentStatus, headMovedTransition);
          }
          return { done: true, result: pollResult(true, 'target_reached', currentStatus || status) };
        }
        const terminalDetail = sanitizeTranscriptDetail(acpState.detail);
        log('WARN', `Session ${acpState.sessionState} without HEAD movement — agent crashed or made no changes (${acpState.reason}${terminalDetail ? `; ${terminalDetail}` : ''})`);
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
            detail: terminalDetail,
          }, {
            transcript: sanitizeAcpTranscriptEvidence(acpState.transcript),
          }),
        };
      }
    }

    const logStatus = status?.status || 'no-status-file';
    const logPhase = status?.current_phase || '';
    return { done: false, logMsg: `status=${logStatus} phase=${logPhase}` };
  }, timeoutMinutes, moduleDir, opts);
}

// ─── Forge Completion Polling (agent.ended + meaningful diff authority) ──
// Forge completion is driven by canonical agent.ended telemetry and meaningful git
// evidence. ACP monitoring remains an observability/rate-limit adapter only and
// cannot authorize Forge readiness when hook evidence is unavailable or missing.

export async function pollForgeCompletion(config, moduleDir, timeoutMinutes, opts = {}) {
  const { sessionLabel } = opts;
  let acpState = {};
  const observabilityState = {
    gateway: { active: false, degradedAt: null },
    transcript: { active: false, degradedAt: null },
  };
  const ctx = { config };
  const startTime = Date.now();
  let lastProgressEmit = startTime;
  const PROGRESS_INTERVAL_MS = config.session_progress_emit_interval_ms ?? 30000;
  const settleMs = agentEndedSettleMs(config, opts);
  let hookReader = createAgentEndedTelemetryReader(config, opts);
  let hookReaderDegraded = !hookReader;
  let hookReaderError = null;
  let observedAgentEnded = null;
  let observedAgentEndedAt = 0;

  function diffEvidenceFor(event, source) {
    return collectMeaningfulForgeDiffEvidence(config, moduleDir, {
      ...opts,
      diffEvidence: typeof opts.diffEvidence === 'function'
        ? opts.diffEvidence({ event, source })
        : opts.diffEvidence,
    });
  }

  function completionFromDiff(event, source, transcript = null) {
    const diffEvidence = diffEvidenceFor(event, source);
    if (!diffEvidence.ok) {
      return pollResult(false, 'git_error', {
        message: diffEvidence.error?.message || 'Unable to collect meaningful Forge diff evidence',
        details: diffEvidence.error?.pollingGit || diffEvidence.error?.gitSync || null,
      });
    }
    const ready = diffEvidence.hasMeaningfulChanges;
    const reason = source === AGENT_OBSERVABILITY_FORGE_COMPLETION_SOURCE
      ? (ready ? AGENT_OBSERVABILITY_FORGE_READY_REASON : AGENT_OBSERVABILITY_FORGE_NO_WORK_REASON)
      : (ready ? AGENT_OBSERVABILITY_FORGE_FALLBACK_READY_REASON : AGENT_OBSERVABILITY_FORGE_FALLBACK_NO_WORK_REASON);
    const identity = buildForgeAgentEndedIdentity(config, moduleDir, opts);
    return pollResult(ready, reason, buildForgeCompletionStatusFromDiff(diffEvidence, event, { source, identity }), {
      ...(transcript ? { transcript } : {}),
    });
  }

  try {
    return await pollGeneric(config, async () => {
      const tracked = sessionLabel ? getTrackedAgent(sessionLabel) : null;
      const currentStatus = { module_id: opts.moduleId || moduleDir, current_phase: 'forge', status: STATUS.IN_PROGRESS };
      const pollIdentity = resolveStatusPollIdentity(moduleDir, currentStatus, tracked, sessionLabel);
      const identity = buildForgeAgentEndedIdentity(config, moduleDir, {
        ...opts,
        trackedAgent: tracked,
        moduleId: pollIdentity.module_id || opts.moduleId || moduleDir,
        dispatchId: pollIdentity.dispatch_id || opts.dispatchId,
        sessionKey: pollIdentity.session_key || opts.sessionKey,
        gatewayLabel: pollIdentity.gateway_label || opts.gatewayLabel || sessionLabel,
      });

      if (!observedAgentEnded && hookReader) {
        try {
          observedAgentEnded = await hookReader.read(identity);
          if (observedAgentEnded) {
            observedAgentEndedAt = Date.now();
            log('INFO', `[${moduleDir}] agent.ended telemetry observed — waiting ${settleMs / 1000}s for final writes`);
          }
        } catch (error) {
          hookReaderError = error;
          hookReaderDegraded = true;
          hookReader.close?.();
          hookReader = null;
          log('WARN', `[${moduleDir}] agent.ended telemetry reader degraded; ACP monitor remains diagnostic only (${error.message || error})`);
        }
      }

      if (observedAgentEnded) {
        if (shouldSettleAgentEnded(observedAgentEndedAt, Date.now(), settleMs)) {
          return { done: false, logMsg: 'agent_ended=observed settling_final_writes' };
        }
        return {
          done: true,
          result: completionFromDiff(observedAgentEnded, AGENT_OBSERVABILITY_FORGE_COMPLETION_SOURCE),
        };
      }

      if (sessionLabel) {
        acpState = await getAcpMonitorState(config, sessionLabel, acpState);
        const liveAgentType = pollIdentity.agent_type || 'forge';
        updateAcpPollObservability(ctx, observabilityState, acpState, pollIdentity, liveAgentType);
        publishAcpTranscriptDelta(ctx, pollIdentity, acpState, {
          label: pollIdentity.label,
          agentType: liveAgentType,
        });
        lastProgressEmit = maybeEmitAcpPollProgress(ctx, pollIdentity, acpState, {
          label: pollIdentity.label,
          agentType: liveAgentType,
          lastEmitAt: lastProgressEmit,
          intervalMs: PROGRESS_INTERVAL_MS,
          elapsedSeconds: Math.round((Date.now() - startTime) / 1000),
        });

        if (acpState.rateLimited) {
          return {
            rate_limited: true,
            status: buildModuleSessionRateLimitStatus({
              ...currentStatus,
              module_id: pollIdentity.module_id || moduleDir,
              run_id: getRunId(config) || null,
              attempt: pollIdentity.attempt ?? null,
              dispatch_id: pollIdentity.dispatch_id ?? null,
              gateway_label: pollIdentity.gateway_label ?? null,
              session_key: pollIdentity.session_key ?? null,
              agent_type: liveAgentType,
              rate_limit_reason: acpState.detail,
              detail: acpState.detail,
            }, {
              moduleId: pollIdentity.module_id || moduleDir,
              phase: liveAgentType,
              identity: {
                agent_type: liveAgentType,
                run_id: getRunId(config) || null,
                attempt: pollIdentity.attempt ?? null,
                dispatch_id: pollIdentity.dispatch_id ?? null,
                gateway_label: pollIdentity.gateway_label ?? null,
                session_key: pollIdentity.session_key ?? null,
              },
            }),
          };
        }

        if (acpState.terminal) {
          const terminalDetail = sanitizeTranscriptDetail(acpState.detail);
          const transcript = sanitizeAcpTranscriptEvidence(acpState.transcript);
          const missingHookStatus = {
            status: STATUS.FAIL,
            source: 'acp_session_monitor_diagnostic',
            summary: 'Forge session ended without canonical agent.ended telemetry evidence',
            detail: terminalDetail || acpState.reason || null,
            completed_at: new Date().toISOString(),
            module_id: pollIdentity.module_id || moduleDir,
            dispatch_id: pollIdentity.dispatch_id || null,
            gateway_label: pollIdentity.gateway_label || sessionLabel || null,
            session_key: pollIdentity.session_key || null,
            state: acpState.sessionState,
            reason: acpState.reason || null,
            missing_authority: 'agent.ended',
          };
          log('WARN', `Session ${acpState.sessionState} ended without canonical agent.ended evidence (${acpState.reason}${terminalDetail ? `; ${terminalDetail}` : ''})`);
          return { done: true, result: pollResult(false, 'agent_ended_missing', missingHookStatus, { transcript }) };
        }
      }

      const fallback = hookReaderDegraded
        ? `fallback=acp_monitor${hookReaderError ? ' reader_degraded' : ' reader_unavailable'}`
        : 'hook=waiting';
      return { done: false, logMsg: `agent_ended=missing ${fallback}` };
    }, timeoutMinutes, moduleDir, opts);
  } finally {
    hookReader?.close?.();
  }
}

// ─── Buster Completion Wait (event-driven Redis evidence + local wakeups) ──
// Redis completion stream is fast Buster completion evidence. It may close the
// module only when it matches the active local dispatch identity; local lifecycle
// state remains the authority that applies the guarded terminal transition.
// The public pollDual wrapper remains for callers, but completion evidence is
// event-driven and no longer uses the generic polling loop.

export async function pollDual(config, moduleDir, moduleId, expectedStatuses, timeoutMinutes, expectedIdentity = {}, opts = {}) {
  return waitForModuleBusterCompletion(
    config,
    moduleDir,
    moduleId,
    expectedStatuses,
    timeoutMinutes,
    expectedIdentity,
    pollResult,
    opts,
  );
}

// ─── Rate-Limit Recovery Wrappers ─────────────────────────────────────────────

/** Status-backed rate-limit recovery for legacy/non-Forge callers. */
export async function pollWithRateLimitRecovery(config, moduleDir, expectedStatuses, timeoutMinutes, opts = {}) {
  const budget = opts.budget || createBudgetFromMinutes(timeoutMinutes, { label: moduleDir });
  return withRateLimitRecovery(config, moduleDir,
    () => pollStatus(config, moduleDir, expectedStatuses, timeoutMinutes, { ...opts, budget }),
    { ...opts, budget, phase: 'forge' });
}

/** Forge-phase rate-limit recovery (wraps typed completion artifact polling). */
export async function pollForgeCompletionWithRateLimitRecovery(config, moduleDir, timeoutMinutes, opts = {}) {
  const budget = opts.budget || createBudgetFromMinutes(timeoutMinutes, { label: moduleDir });
  return withRateLimitRecovery(config, moduleDir,
    () => pollForgeCompletion(config, moduleDir, timeoutMinutes, { ...opts, budget }),
    { ...opts, budget, phase: 'forge' });
}

/** Buster-phase rate-limit recovery (wraps pollDual). */
export async function pollDualWithRateLimitRecovery(config, moduleDir, moduleId, expectedStatuses, timeoutMinutes, expectedIdentity = {}, opts = {}) {
  const budget = opts.budget || createBudgetFromMinutes(timeoutMinutes, { label: moduleDir });
  return withRateLimitRecovery(config, moduleDir,
    () => pollDual(config, moduleDir, moduleId, expectedStatuses, timeoutMinutes, expectedIdentity, { ...opts, budget }),
    { ...opts, budget, phase: 'buster', moduleId });
}
