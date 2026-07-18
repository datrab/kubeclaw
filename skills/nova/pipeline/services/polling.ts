import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// services/polling.ts — Polling engine and lifecycle/ACP polling

import fs from 'fs';
import { log } from '../core/logger.ts';
import { getRunId } from '../core/runtime.ts';
import { loadStatus } from './status-store.ts';
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
import { transitionModuleStatus } from '../lifecycle-state.ts';
import { sanitizeAcpTranscriptEvidence, sanitizeTranscriptDetail } from '../egress.ts';
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
import { forgeCompletionArtifactFile, invalidForgeCompletionArtifactStatus, readForgeCompletionArtifact } from './forge-completion.ts';
import { projectSrcPath } from '../core/paths.ts';
import { BudgetExhaustedError, createBudgetFromMinutes, isBudgetExhaustedError, sleep } from '../timing.ts';
import { pollingBudget, pollingPolicyNumber } from './polling-policy.ts';

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
const DEFAULT_FILE_POLL_AGENT_TYPE = 'review';
const DEFAULT_STATUS_POLL_AGENT_TYPE = 'forge';
const NO_STATUS_FILE_LOG_STATE = 'no-status-file';
const MEANINGFUL_DIFF_EVIDENCE_FAILURE = 'Unable to collect meaningful Forge diff evidence';

function objectRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function textValue(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function requireTextValue(value, field) {
  const normalized = textValue(value);
  if (!normalized) {
    throw new Error(`${field}: required non-empty string`);
  }
  return normalized;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function pollProgressMessage(check) {
  return selectDefinedValue(() => (textValue(check?.logMsg)), () => ('pending'));
}

function pollProgressKey(check, progressMsg) {
  return selectDefinedValue(() => (textValue(check?.logKey)), () => (progressMsg));
}

function filePollAgentType(pollIdentity, sessionLabel, label) {
  return selectDefinedValue(() => (selectDefinedValue(() => (textValue(pollIdentity?.agent_type)), () => (sessionLabelAgentType(selectDefinedValue(() => (textValue(sessionLabel)), () => (label)))))), () => (DEFAULT_FILE_POLL_AGENT_TYPE));
}

function statusPollAgentType(pollIdentity) {
  return selectDefinedValue(() => (textValue(pollIdentity?.agent_type)), () => (DEFAULT_STATUS_POLL_AGENT_TYPE));
}

function statusLogValue(status) {
  return selectDefinedValue(() => (textValue(status?.status)), () => (NO_STATUS_FILE_LOG_STATE));
}

function phaseLogValue(status) {
  return selectDefinedValue(() => (textValue(status?.current_phase)), () => (''));
}

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
 * @property {string} reason - 'target_reached' | 'verdict_fail' | 'timeout' | 'blocked' | 'rate_limited' | 'rate_limit_exhausted' | 'parse_corrupted' | 'spawn_failed' | 'completion_conflict'
 * @property {object|null} status - The lifecycle read-model projection or Redis completion data
 * @property {object|null} transcript - Optional ACP transcript state when polling owns it
 */
export function pollResult(ok, reason, status = null, extra = {}) {
  return { ok, reason, status, ...extra };
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
  const intervalSeconds = pollingPolicyNumber(config, 'interval_seconds', { positive: true });
  const interval = intervalSeconds * 1000;
  const progressLogIntervalMs = pollingPolicyNumber(config, 'progress_interval_ms');
  const budget = pollingBudget(opts, timeoutMinutes, label);
  const startTime = Date.now();
  let consecutiveParseFailures = 0;
  const maxParseFailures = 10;
  let firstCycle = true;
  let lastProgressLogAt = 0;
  let lastProgressLogKey = null;
  log('INFO', `[${label}] Polling every ${intervalSeconds}s | timeout: ${timeoutMinutes}min`);

  try {
    while (true) {
      budget.throwIfExhausted();
      if (!firstCycle) {
        await sleep(interval, { budget });
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
      const progressMsg = pollProgressMessage(check);
      const progressKey = pollProgressKey(check, progressMsg);
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      const remaining = Math.round(budget.remainingMs() / 1000);
      const shouldLogProgress = selectTruthyValue(() => (selectTruthyValue(() => (!lastProgressLogKey), () => (progressKey !== lastProgressLogKey))), () => ((Date.now() - lastProgressLogAt) >= progressLogIntervalMs));
      if (shouldLogProgress) {
        log(selectDefinedValue(() => (textValue(check?.logLevel)), () => ('INFO')), `[${label}] ${progressMsg} | ${elapsed}s elapsed, ${remaining}s remaining`);
        lastProgressLogAt = Date.now();
        lastProgressLogKey = progressKey;
      }
    }
  } catch (error) {
    if (!isBudgetExhaustedError(error)) throw error;
    if (typeof opts.onTimeoutBeforeResult === 'function') {
      const timeoutResult = await opts.onTimeoutBeforeResult(error);
      if (timeoutResult) return timeoutResult;
    }
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
  const progressIntervalMs = pollingPolicyNumber(config, 'progress_interval_ms');

  return pollGeneric(config, async () => {
    // Signal A: Output file exists → success (always wins)
    if (fs.existsSync(filePath)) {
      return { done: true, result: pollResult(true, 'target_reached', { file: filePath }) };
    }

    // Signal B: ACP transcript / session terminal state without file → fail fast
    if (sessionLabel) {
      acpState = await getAcpMonitorState({ config, sessionLabelOrKey: sessionLabel, previousState: acpState });
      const tracked = getTrackedAgent(sessionLabel);
      const pollIdentity = resolveFilePollIdentity(label, tracked);
      updateAcpPollObservability(
        ctx,
        observabilityState,
        acpState,
        pollIdentity,
        selectTruthyValue(() => (selectTruthyValue(() => (pollIdentity.agent_type), () => (sessionLabel.split('-')[0]))), () => (null)),
      );

      const liveAgentType = filePollAgentType(pollIdentity, sessionLabel, label);
      publishAcpTranscriptDelta(ctx, pollIdentity, acpState, {
        label: pollIdentity.label,
        agentType: liveAgentType,
      });
      lastProgressEmit = maybeEmitAcpPollProgress(ctx, pollIdentity, acpState, {
        label: pollIdentity.label,
        agentType: liveAgentType,
        lastEmitAt: lastProgressEmit,
        intervalMs: progressIntervalMs,
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
            ...(pollIdentity.gate_id == null ? {} : { gate_type: selectDefinedValue(() => (pollIdentity.gate_type), () => (null)) }),
            session_key: pollIdentity.session_key,
            attempt: pollIdentity.attempt,
            dispatch_id: pollIdentity.dispatch_id,
            gateway_label: selectDefinedValue(() => (pollIdentity.gateway_label), () => (null)),
            current_phase: liveAgentType,
            agent_type: liveAgentType,
            reason: acpState.detail,
            detail: acpState.detail,
            transcript: sanitizeAcpTranscriptEvidence(acpState.transcript),
            transcript_detail: sanitizeTranscriptDetail(acpState.transcript?.lastDetail),
          },
        };
      }

      if (acpState.terminal) {
        const terminalDetail = sanitizeTranscriptDetail(acpState.detail);
        log('WARN', `[${label}] ACP monitor terminal (${acpState.reason}): ${selectDefinedValue(() => (terminalDetail), () => (acpState.sessionState))}`);
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
        logMsg: `session=${acpState.sessionState} unknown=${acpState.unknownPolls}/${getAcpMonitorConfig(config).poll_limit} transcript_stale=${acpState.transcriptStalePolls}/${getAcpMonitorConfig(config).poll_limit}`,
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
  const { sessionLabel } = opts;
  let acpState = {};
  const observabilityState = {
    gateway: { active: false, degradedAt: null },
    transcript: { active: false, degradedAt: null },
  };
  const ctx = { config };
  const startTime = Date.now();
  let lastProgressEmit = startTime;
  const progressIntervalMs = pollingPolicyNumber(config, 'progress_interval_ms');

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
        const moduleId = requireTextValue(status.module_id, 'status.module_id');
        const phase = requireTextValue(selectDefinedValue(() => (pollIdentity.agent_type), () => (status.current_phase)), 'rate_limit.phase');
        return {
          rate_limited: true,
          status: buildModuleSessionRateLimitStatus(status, {
            moduleId,
            phase,
            identity: {
              agent_type: phase,
              run_id: selectDefinedValue(() => (getRunId(config)), () => (null)),
              attempt: selectDefinedValue(() => (pollIdentity.attempt), () => (null)),
              dispatch_id: selectDefinedValue(() => (pollIdentity.dispatch_id), () => (null)),
              gateway_label: selectDefinedValue(() => (pollIdentity.gateway_label), () => (null)),
              session_key: selectDefinedValue(() => (pollIdentity.session_key), () => (null)),
            },
          }),
        };
      }
    }

    // ── Channel 2: ACP transcript/session terminal state (fail-fast on crash) ──
    if (sessionLabel) {
      acpState = await getAcpMonitorState({ config, sessionLabelOrKey: sessionLabel, previousState: acpState });
      const tracked = getTrackedAgent(sessionLabel);
      const pollIdentity = resolveStatusPollIdentity(moduleDir, status, tracked, sessionLabel);
      const currentStatus = objectRecord(status);
      const liveAgentType = statusPollAgentType(pollIdentity);
      updateAcpPollObservability(ctx, observabilityState, acpState, pollIdentity, liveAgentType);
      publishAcpTranscriptDelta(ctx, pollIdentity, acpState, {
        label: pollIdentity.label,
        agentType: liveAgentType,
      });
      lastProgressEmit = maybeEmitAcpPollProgress(ctx, pollIdentity, acpState, {
        label: pollIdentity.label,
        agentType: liveAgentType,
        lastEmitAt: lastProgressEmit,
        intervalMs: progressIntervalMs,
        elapsedSeconds: Math.round((Date.now() - startTime) / 1000),
      });

      if (acpState.rateLimited) {
        const moduleId = requireTextValue(pollIdentity.module_id, 'poll_identity.module_id');
        const rateLimitedStatus = {
          ...currentStatus,
          ...(currentStatus.run_id == null && getRunId(config) != null ? { run_id: getRunId(config) } : {}),
          module_id: selectDefinedValue(() => (textValue(currentStatus.module_id)), () => (moduleId)),
          ...(pollIdentity.gate_id == null
            ? {}
            : { gate_id: pollIdentity.gate_id, gate_type: selectDefinedValue(() => (pollIdentity.gate_type), () => (null)) }),
          ...(currentStatus.attempt == null && pollIdentity.attempt != null ? { attempt: pollIdentity.attempt } : {}),
          ...(resolveStatusDispatchId(currentStatus) == null && pollIdentity.dispatch_id != null ? { dispatch_id: pollIdentity.dispatch_id } : {}),
          ...(resolveStatusGatewayLabel(currentStatus) == null && pollIdentity.gateway_label != null ? { gateway_label: pollIdentity.gateway_label } : {}),
          ...(resolveStatusSessionKey(currentStatus) == null && pollIdentity.session_key != null ? { session_key: pollIdentity.session_key } : {}),
          current_phase: selectDefinedValue(() => (textValue(currentStatus.current_phase)), () => (liveAgentType)),
          agent_type: selectDefinedValue(() => (textValue(currentStatus.agent_type)), () => (liveAgentType)),
          rate_limit_reason: acpState.detail,
          detail: selectDefinedValue(() => (textValue(currentStatus.detail)), () => (acpState.detail)),
        };
        const normalizedRateLimitedStatus = buildModuleSessionRateLimitStatus(rateLimitedStatus, {
          moduleId,
          phase: liveAgentType,
          identity: {
            agent_type: liveAgentType,
            run_id: selectDefinedValue(() => (getRunId(config)), () => (null)),
            attempt: selectDefinedValue(() => (pollIdentity.attempt), () => (null)),
            dispatch_id: selectDefinedValue(() => (pollIdentity.dispatch_id), () => (null)),
            gateway_label: selectDefinedValue(() => (pollIdentity.gateway_label), () => (null)),
            session_key: selectDefinedValue(() => (pollIdentity.session_key), () => (null)),
          },
        });
        const rateLimitTransition = transitionModuleStatus(normalizedRateLimitedStatus, STATUS.RATE_LIMITED, {
          note: 'ACP session rate limited',
          phase: normalizedRateLimitedStatus.current_phase,
        });
        return { rate_limited: true, status: normalizedRateLimitedStatus, lifecycleMutation: rateLimitTransition.lifecycleMutation };
      }

      if (acpState.terminal) {
        const terminalDetail = sanitizeTranscriptDetail(acpState.detail);
        const moduleId = requireTextValue(pollIdentity.module_id, 'poll_identity.module_id');
        log('WARN', `Session ${acpState.sessionState} before target lifecycle status (${acpState.reason}${terminalDetail ? `; ${terminalDetail}` : ''})`);
        return {
          done: true,
          result: pollResult(false, 'session_ended_no_changes', {
            ...(status && typeof status === 'object' ? status : {}),
            module_id: moduleId,
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

    const logStatus = statusLogValue(status);
    const logPhase = phaseLogValue(status);
    return { done: false, logMsg: `status=${logStatus} phase=${logPhase}` };
  }, timeoutMinutes, moduleDir, opts);
}

// ─── Forge Completion Polling (typed artifact + agent.ended authority) ──
// Forge completion closes as soon as the worker writes a valid typed
// forge-completion.json artifact. Canonical agent.ended telemetry remains
// useful for diff-derived readiness, but Nova no longer waits on hook/session
// timing once the worker has published its durable completion contract.

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
  const progressIntervalMs = pollingPolicyNumber(config, 'progress_interval_ms');
  const settleMs = agentEndedSettleMs(config, opts);
  let hookReader = createAgentEndedTelemetryReader(config, opts);
  let hookReaderDegraded = !hookReader;
  let hookReaderError = null;
  let observedAgentEnded = null;
  let observedAgentEndedAt = 0;

  function buildArtifactIdentity() {
    const tracked = sessionLabel ? getTrackedAgent(sessionLabel) : null;
    const moduleId = requireTextValue(selectDefinedValue(() => (opts.moduleId), () => (moduleDir)), 'module_id');
    const currentStatus = { module_id: moduleId, current_phase: 'forge', status: STATUS.IN_PROGRESS, attempt: selectDefinedValue(() => (opts.attempt), () => (null)), dispatch_id: selectDefinedValue(() => (opts.dispatchId), () => (null)), gateway_label: selectDefinedValue(() => (opts.gatewayLabel), () => (sessionLabel)), session_key: selectDefinedValue(() => (opts.sessionKey), () => (null)) };
    const pollIdentity = resolveStatusPollIdentity(moduleDir, currentStatus, tracked, sessionLabel);
    const identityModuleId = requireTextValue(pollIdentity.module_id, 'poll_identity.module_id');
    return {
      currentStatus,
      pollIdentity,
      identity: buildForgeAgentEndedIdentity(config, moduleDir, {
        ...opts,
        trackedAgent: tracked,
        moduleId: identityModuleId,
        attempt: selectDefinedValue(() => (pollIdentity.attempt), () => (opts.attempt)),
        dispatchId: selectDefinedValue(() => (pollIdentity.dispatch_id), () => (opts.dispatchId)),
        sessionKey: selectDefinedValue(() => (pollIdentity.session_key), () => (opts.sessionKey)),
        gatewayLabel: selectDefinedValue(() => (selectDefinedValue(() => (pollIdentity.gateway_label), () => (opts.gatewayLabel))), () => (sessionLabel)),
      }),
    };
  }

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
        message: selectDefinedValue(() => (textValue(diffEvidence.error?.message)), () => (MEANINGFUL_DIFF_EVIDENCE_FAILURE)),
        details: selectTruthyValue(() => (selectTruthyValue(() => (diffEvidence.error?.pollingGit), () => (diffEvidence.error?.gitSync))), () => (null)),
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

  function completionFromArtifact(identity, transcript = null, { acceptInvalid = false } = {}) {
    const artifact = readForgeCompletionArtifact(config, moduleDir, identity);
    if (!artifact.found) return null;
    if (!artifact.valid) {
      const errors = Array.isArray(artifact.errors) ? artifact.errors : [];
      const hasSemanticErrors = errors.some((entry) => !String(entry).startsWith('invalid JSON:'));
      if (acceptInvalid && hasSemanticErrors) {
        return {
          done: true,
          result: pollResult(false, 'invalid_forge_completion', invalidForgeCompletionArtifactStatus(config, moduleDir, identity, errors), {
            ...(transcript ? { transcript } : {}),
          }),
        };
      }
      if (hasSemanticErrors) {
        return {
          done: false,
          logMsg: 'forge_completion=invalid waiting_for_agent_terminal_write',
          logKey: 'forge_completion=invalid',
        };
      }
      return {
        parse_error: true,
        logMsg: 'forge_completion=invalid_json waiting_for_rewrite',
        logKey: 'forge_completion=invalid',
      };
    }
    return {
      done: true,
      result: pollResult(true, 'forge_completion', {
        ...artifact.artifact,
        source: 'forge_completion_artifact',
        module_id: identity.module_id,
        dispatch_id: identity.dispatch_id,
        gateway_label: identity.gateway_label,
        session_key: identity.session_key,
      }, {
        ...(transcript ? { transcript } : {}),
      }),
    };
  }

  try {
    return await pollGeneric(config, async () => {
      const { currentStatus, pollIdentity, identity } = buildArtifactIdentity();
      const identityModuleId = requireTextValue(pollIdentity.module_id, 'poll_identity.module_id');

      const artifactCompletion = completionFromArtifact(identity, null, { acceptInvalid: !sessionLabel });
      if (artifactCompletion) return artifactCompletion;

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
          log('WARN', `[${moduleDir}] agent.ended telemetry reader degraded; ACP monitor remains diagnostic only (${errorMessage(error)})`);
        }
      }

      if (observedAgentEnded) {
        if (shouldSettleAgentEnded(observedAgentEndedAt, Date.now(), settleMs)) {
          return { done: false, logMsg: 'agent_ended=observed settling_final_writes' };
        }
        const terminalArtifact = completionFromArtifact(identity, null, { acceptInvalid: true });
        if (terminalArtifact?.done) return terminalArtifact;
        return {
          done: true,
          result: completionFromDiff(observedAgentEnded, AGENT_OBSERVABILITY_FORGE_COMPLETION_SOURCE),
        };
      }

      if (sessionLabel) {
        acpState = await getAcpMonitorState({ config, sessionLabelOrKey: sessionLabel, previousState: acpState });
        const liveAgentType = statusPollAgentType(pollIdentity);
        updateAcpPollObservability(ctx, observabilityState, acpState, pollIdentity, liveAgentType);
        publishAcpTranscriptDelta(ctx, pollIdentity, acpState, {
          label: pollIdentity.label,
          agentType: liveAgentType,
        });
        lastProgressEmit = maybeEmitAcpPollProgress(ctx, pollIdentity, acpState, {
          label: pollIdentity.label,
          agentType: liveAgentType,
          lastEmitAt: lastProgressEmit,
          intervalMs: progressIntervalMs,
          elapsedSeconds: Math.round((Date.now() - startTime) / 1000),
        });

        if (acpState.rateLimited) {
          return {
            rate_limited: true,
            status: buildModuleSessionRateLimitStatus({
              ...currentStatus,
              module_id: identityModuleId,
              run_id: selectDefinedValue(() => (getRunId(config)), () => (null)),
              attempt: selectDefinedValue(() => (pollIdentity.attempt), () => (null)),
              dispatch_id: selectDefinedValue(() => (pollIdentity.dispatch_id), () => (null)),
              gateway_label: selectDefinedValue(() => (pollIdentity.gateway_label), () => (null)),
              session_key: selectDefinedValue(() => (pollIdentity.session_key), () => (null)),
              agent_type: liveAgentType,
              rate_limit_reason: acpState.detail,
              detail: acpState.detail,
            }, {
              moduleId: identityModuleId,
              phase: liveAgentType,
              identity: {
                agent_type: liveAgentType,
                run_id: selectDefinedValue(() => (getRunId(config)), () => (null)),
                attempt: selectDefinedValue(() => (pollIdentity.attempt), () => (null)),
                dispatch_id: selectDefinedValue(() => (pollIdentity.dispatch_id), () => (null)),
                gateway_label: selectDefinedValue(() => (pollIdentity.gateway_label), () => (null)),
                session_key: selectDefinedValue(() => (pollIdentity.session_key), () => (null)),
              },
            }),
          };
        }

        if (acpState.terminal) {
          const terminalDetail = sanitizeTranscriptDetail(acpState.detail);
          const transcript = sanitizeAcpTranscriptEvidence(acpState.transcript);
          const artifactCompletionWithTranscript = completionFromArtifact(identity, transcript, { acceptInvalid: true });
          if (artifactCompletionWithTranscript?.done) return artifactCompletionWithTranscript;
          const missingArtifactStatus = {
            status: STATUS.FAIL,
            source: 'acp_session_monitor_diagnostic',
            summary: 'Forge session ended without canonical forge-completion.json artifact',
            detail: selectDefinedValue(() => (selectDefinedValue(() => (terminalDetail), () => (acpState.reason))), () => (null)),
            completed_at: new Date().toISOString(),
            module_id: identityModuleId,
            dispatch_id: selectDefinedValue(() => (pollIdentity.dispatch_id), () => (null)),
            gateway_label: selectDefinedValue(() => (selectDefinedValue(() => (pollIdentity.gateway_label), () => (sessionLabel))), () => (null)),
            session_key: selectDefinedValue(() => (pollIdentity.session_key), () => (null)),
            state: acpState.sessionState,
            reason: selectDefinedValue(() => (acpState.reason), () => (null)),
            missing_authority: 'forge-completion.json',
            expected_completion_path: forgeCompletionArtifactFile(config, moduleDir),
            project_src_dir: projectSrcPath(config),
            swarm_dir: config.paths?.swarm_dir,
            repo_root: config.repo_root,
          };
          log('WARN', `Session ${acpState.sessionState} ended without canonical forge-completion.json artifact (${acpState.reason}${terminalDetail ? `; ${terminalDetail}` : ''})`);
          return { done: true, result: pollResult(false, 'forge_completion_artifact_missing', missingArtifactStatus, { transcript }) };
        }
      }

      const fallback = hookReaderDegraded
        ? `fallback=acp_monitor${hookReaderError ? ' reader_degraded' : ' reader_unavailable'}`
        : 'hook=waiting';
      return {
        done: false,
        logMsg: `observer_agent_ended=missing ${fallback}; awaiting typed completion artifact`,
        logLevel: 'DEBUG',
      };
    }, timeoutMinutes, moduleDir, {
      ...opts,
      onTimeoutBeforeResult: () => {
        const finalArtifactCompletion = completionFromArtifact(buildArtifactIdentity().identity, null, { acceptInvalid: true });
        return finalArtifactCompletion?.done ? finalArtifactCompletion.result : null;
      },
    });
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
  const budget = pollingBudget(opts, timeoutMinutes, moduleDir);
  return withRateLimitRecovery(config, moduleDir,
    () => pollStatus(config, moduleDir, expectedStatuses, timeoutMinutes, { ...opts, budget }),
    { ...opts, budget, phase: 'forge' });
}

/** Forge-phase rate-limit recovery (wraps typed completion artifact polling). */
export async function pollForgeCompletionWithRateLimitRecovery(config, moduleDir, timeoutMinutes, opts = {}) {
  const budget = pollingBudget(opts, timeoutMinutes, moduleDir);
  return withRateLimitRecovery(config, moduleDir,
    () => pollForgeCompletion(config, moduleDir, timeoutMinutes, { ...opts, budget }),
    { ...opts, budget, phase: 'forge' });
}

/** Buster-phase rate-limit recovery (wraps pollDual). */
export async function pollDualWithRateLimitRecovery(config, moduleDir, moduleId, expectedStatuses, timeoutMinutes, expectedIdentity = {}, opts = {}) {
  const budget = pollingBudget(opts, timeoutMinutes, moduleDir);
  return withRateLimitRecovery(config, moduleDir,
    () => pollDual(config, moduleDir, moduleId, expectedStatuses, timeoutMinutes, expectedIdentity, { ...opts, budget }),
    { ...opts, budget, phase: 'buster', moduleId });
}
