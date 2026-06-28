// services/polling-session-end.ts — ACP session end poller

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { log } from '../core/logger.ts';
import { getRunId } from '../core/runtime.ts';
import { createAcpMonitorEventAdapter, monitorStateFromAcpEvent } from '../agents/acp-monitor.ts';
import { getTrackedAgent } from '../agents/lifecycle.ts';
import { sendGatewaySessionMessage } from '../integrations/gateway.ts';
import { copyRedactedTranscriptArtifact, sanitizeAcpTranscriptEvidence } from '../redaction.ts';
import { headHash, invalidateHeadHash, gitExec } from '../integrations/git-worktree.ts';
import {
  processSessionRateLimit,
  buildGateSessionRateLimitStatus,
  buildModuleSessionRateLimitStatus,
  createTrackedGateSessionRateLimitExhaustedResultOptions,
  createTrackedModuleSessionRateLimitExhaustedResultOptions,
  getRateLimitConfig,
} from './rate-limit.ts';
import { buildSessionProgressStateKey, resolveSessionPollIdentity } from './polling-identity.ts';
import {
  maybeEmitAcpPollProgress,
  publishAcpTranscriptDelta,
  updateAcpPollObservability,
} from './polling-observability.ts';
import { appendDurableOperatorAlert } from './telemetry.ts';
import { createBudgetFromMinutes, isBudgetExhaustedError } from '../timing.ts';
import { createPipelineEventBus, waitForAny } from './pipeline-event-contract.ts';
import { moduleLogDir } from '../core/paths.ts';
import { gatewayInvokePolicy } from '../core/session-policy.ts';
import { getPipelineDefaultsConfig } from './runtime-defaults.ts';

function pollingPolicyNumber(config, field, options = {}) {
  const raw = config?.polling?.[field];
  const value = Number(raw);
  if (!Number.isFinite(value) || (options.positive && value <= 0)) {
    throw new Error(`config.polling.${field}: required ${options.positive ? 'positive ' : ''}number in swarm.config.json`);
  }
  return value;
}

function appendDurableSessionEndAlert(config, identity = {}, reason, extra = {}) {
  appendDurableOperatorAlert(config, identity.gate_id ? 'gate.operator_alert' : 'module.operator_alert', {
    module_id: identity.module_id || null,
    gate_id: identity.gate_id || null,
    gate_type: identity.gate_type || null,
    attempt: identity.attempt ?? null,
    dispatch_id: identity.dispatch_id || null,
    gateway_label: identity.gateway_label || null,
    session_key: identity.session_key || null,
    reason,
    ...extra,
  }, {
    severity: 'CRITICAL',
    source: 'poll_for_session_end',
    emitter: 'nova/pipeline/services/polling-session-end',
  });
}

function porcelainPath(line = '') {
  const text = String(line).trimEnd();
  const raw = (text.length > 2 && text[2] === ' ')
    ? text.slice(3).trim()
    : text.replace(/^\S+\s+/, '').trim();
  const renamed = raw.includes(' -> ') ? raw.split(' -> ').pop() : raw;
  return renamed.replace(/^"|"$/g, '');
}

function isInsidePath(child, parent) {
  if (!child || !parent) return false;
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function worktreeChangeSignature(config, ignoredPaths = []) {
  if (!config?.repo_root) {
    return {
      ok: false,
      signature: null,
      error: {
        code: 'POLLING_REPO_ROOT_REQUIRED',
        message: 'Session-end worktree signature requires typed repo_root context',
        details: { reason: 'no_repo_root' },
      },
    };
  }
  try {
    const porcelain = gitExec(config, ['status', '--porcelain', '--untracked-files=all']);
    if (!porcelain) return { ok: true, signature: '' };
    const ignoreAbs = ignoredPaths.filter(Boolean).map((entry) => path.resolve(entry));
    const entries = porcelain.split('\n')
      .filter((line) => {
        if (!line.trim()) return false;
        const abs = path.resolve(config.repo_root, porcelainPath(line));
        return !ignoreAbs.some((ignored) => isInsidePath(abs, ignored));
      })
      .sort();
    const details = entries.map((line) => {
      const relPath = porcelainPath(line);
      if (line.startsWith('?? ')) {
        const abs = path.resolve(config.repo_root, relPath);
        if (!fs.existsSync(abs)) return `${line}\0missing`;
        const stat = fs.statSync(abs);
        if (stat.isDirectory()) return `${line}\0dir`;
        const digest = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
        return `${line}\0untracked:${stat.mode}:${stat.size}:${digest}`;
      }
      const worktreeDiff = gitExec(config, ['diff', '--binary', '--', relPath]);
      const stagedDiff = gitExec(config, ['diff', '--cached', '--binary', '--', relPath]);
      const digest = crypto.createHash('sha256')
        .update(worktreeDiff)
        .update('\0')
        .update(stagedDiff)
        .digest('hex');
      return `${line}\0tracked:${digest}`;
    });
    const signature = crypto.createHash('sha256')
      .update(entries.join('\n'))
      .update('\0')
      .update(details.join('\n'))
      .digest('hex');
    return { ok: true, signature };
  } catch (error) {
    return {
      ok: false,
      signature: null,
      error: {
        code: 'POLLING_WORKTREE_SIGNATURE_FAILED',
        message: error?.message?.split('\n')[0] || 'worktree signature failed during session-end polling',
        details: error?.pollingGit || error?.gitSync || null,
      },
    };
  }
}

export { worktreeChangeSignature };

export function buildSessionPollRateLimitIdentity({
  config = null,
  telemetryIdentity = {},
  fallbackModuleId = null,
  agentType = null,
  sessionLabel = null,
  attempt = null,
} = {}) {
  const gateId = telemetryIdentity?.gate_id || null;
  return {
    run_id: getRunId(config),
    module_id: gateId ? null : (telemetryIdentity?.module_id || fallbackModuleId || null),
    gate_id: gateId,
    gate_type: gateId ? (telemetryIdentity?.gate_type ?? null) : undefined,
    phase: agentType || sessionLabel?.split?.('-')?.[0] || null,
    attempt: telemetryIdentity?.attempt ?? attempt ?? null,
    dispatch_id: telemetryIdentity?.dispatch_id ?? null,
    gateway_label: telemetryIdentity?.gateway_label || sessionLabel || null,
    session_key: telemetryIdentity?.session_key || null,
  };
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
  const interval = pollingPolicyNumber(config, 'interval_seconds', { positive: true }) * 1000;
  const budget = opts.budget || createBudgetFromMinutes(timeoutMinutes, { label: logLabel });
  const startTime = Date.now();
  const nudgeThreshold = getPipelineDefaultsConfig(config).session_nudge_threshold;
  const sessionEndGraceMs = pollingPolicyNumber(config, 'session_end_grace_ms');
  const sessionProgressLogIntervalMs = pollingPolicyNumber(config, 'progress_interval_ms');
  let nudgeSent = false;

  // Resolve sessionKey from label
  const _trackedEntry = getTrackedAgent(sessionLabel);
  const sessionKey = _trackedEntry?.sessionKey;
  if (!sessionKey) {
    log('ERROR', `[${logLabel}] No sessionKey for label '${sessionLabel}' — cannot poll`);
    return { completed: false, hasChanges: false, reason: 'no_session_key' };
  }

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
  const _ignoredChangePaths = [_streamLogPath, config.paths?.swarm_dir];
  const _initialWorktreeChangeSignature = worktreeChangeSignature(config, _ignoredChangePaths);
  if (!_initialWorktreeChangeSignature.ok) {
    log('ERROR', `[${logLabel}] ${_initialWorktreeChangeSignature.error.message}`);
    return { completed: false, hasChanges: false, reason: 'git_error', error: _initialWorktreeChangeSignature.error };
  }
  const _ctx = { config };
  const _rateLimitIdentity = buildSessionPollRateLimitIdentity({
    config,
    telemetryIdentity: _telemetryIdentity,
    fallbackModuleId: _moduleId,
    agentType,
    sessionLabel,
    attempt,
  });
  let _rateLimitPauses = 0;
  const _maxRateLimitPauses = getRateLimitConfig(config).max_pauses_per_module;
  let _lastProgressEmit = startTime;
  let _lastSessionProgressLogAt = 0;
  let _lastSessionProgressStateKey = null;
  const progressIntervalMs = pollingPolicyNumber(config, 'progress_interval_ms');

  function _mirrorSubagentTranscript() {
    const destDir = moduleLogDir(config, _moduleId);
    if (!_isSubagent || !_streamLogPath || !destDir) return;
    try {
      if (!fs.existsSync(_streamLogPath)) return;
      fs.mkdirSync(destDir, { recursive: true });
      const dest = path.join(destDir, 'subagent-transcript.jsonl');
      copyRedactedTranscriptArtifact(_streamLogPath, dest);
      log('OK', `[${logLabel}] Subagent transcript metadata mirrored → ${dest}`);
    } catch (e) {
      log('DEBUG', `[${logLabel}] Transcript mirror failed (non-critical): ${e.message?.split('\n')[0]}`);
    }
  }

  function _detectFinalChanges() {
    invalidateHeadHash(config);
    const finalHead = headHash(config);
    const finalWorktreeSignature = worktreeChangeSignature(config, _ignoredChangePaths);
    if (!finalWorktreeSignature.ok) {
      log('ERROR', `[${logLabel}] ${finalWorktreeSignature.error.message}`);
      return { ok: false, error: finalWorktreeSignature.error };
    }
    return {
      ok: true,
      hasChanges: finalHead !== headBefore
        || finalWorktreeSignature.signature !== _initialWorktreeChangeSignature.signature,
    };
  }

  // Capture HEAD before Forge starts — used for change detection
  const headBefore = headHash(config);

  // ACP terminal state is the only session completion signal. Git/worktree
  // evidence is sampled only after terminal/timeout to classify local changes.
  // 'idle' is intentionally NOT treated as a completion signal — it's ambiguous
  // with oneshot sessions (can mean initializing, between tool calls, or finished).
  // Only 'closed' and 'error' are unambiguous end states.
  let sessionEndDetected = false;        // Set when the Gateway status wrapper reports closed/error
  let sessionEndGraceStart = 0;          // When we first detected session end

  // After session closes, allow a short grace for final filesystem writes to settle.
  log('INFO', `[${logLabel}] Waiting for session '${sessionLabel}' (${sessionKey}) to complete | timeout: ${timeoutMinutes}min`);

  const eventBus = createPipelineEventBus();
  let acpAdapter = null;

  function startAcpAdapter() {
    acpAdapter = createAcpMonitorEventAdapter(sessionKey, _streamLogPath, {
      eventBus,
      identity: _telemetryIdentity,
      budget,
      pollMs: interval,
      monitorOpts: {
        ...config,
        gatewayStatusPolicy: gatewayInvokePolicy(config, ['session', 'status'].join('_')),
      },
      initialState: acpState,
      stopOnTerminal: false,
      ...(opts.getAcpMonitorState ? { getAcpMonitorState: opts.getAcpMonitorState } : {}),
    });
    acpAdapter.start();
  }

  async function waitForAcpMonitorEvent(timeoutMs) {
    return waitForAny(eventBus, ['acp.session.state', 'acp.transcript.delta', 'fatal.error'], _telemetryIdentity, {
      signal: budget.signal,
      budget,
      timeoutMs,
    });
  }

  function isBudgetOwnedPipelineEventAbort(error) {
    return error?.code === 'PIPELINE_EVENT_WAIT_ABORTED'
      && budget?.signal?.aborted
      && isBudgetExhaustedError(budget.signal.reason);
  }

  async function stopAcpAdapter(reason) {
    if (!acpAdapter) return;
    const current = acpAdapter;
    acpAdapter = null;
    current.stop(reason);
    await current.done?.catch?.(() => {});
  }

  let budgetError = null;
  startAcpAdapter();
  try {
  try {
  while (true) {
    budget.throwIfExhausted();
    let monitorEvent = null;
    try {
      monitorEvent = await waitForAcpMonitorEvent(Math.min(interval, budget.remainingMs()));
    } catch (error) {
      if (error?.code === 'PIPELINE_EVENT_WAIT_TIMEOUT') {
        monitorEvent = null;
      } else if ((error?.code === 'PIPELINE_EVENT_WAIT_ABORTED' && budget.remainingMs() <= 0)
        || isBudgetOwnedPipelineEventAbort(error)) {
        budget.throwIfExhausted();
      } else {
        throw error;
      }
    }

    // ── Session closed/error (ACP session no longer running) ──
    // ACP session/transcript observation arrives through the edge adapter EventBus.
    // After terminal state, local commit/worktree deltas are classification only.
    // The caller owns any commit/push; this poller does not stage or commit files.
    if (!sessionEndDetected && monitorEvent) {
      if (monitorEvent.type === 'fatal.error') {
        return { completed: false, hasChanges: false, reason: 'monitor_adapter_failed', error: monitorEvent.payload || {} };
      }
      const eventState = monitorStateFromAcpEvent(monitorEvent);
      if (!eventState) {
        continue;
      }
      acpState = eventState;
      updateAcpPollObservability(
        _ctx,
        observabilityState,
        acpState,
        _telemetryIdentity,
        sessionLabel.split('-')[0] || null,
      );

      const _agentType = sessionLabel.split('-')[0] || 'forge';
      // Transcript streaming: publish new lines (fire-and-forget)
      publishAcpTranscriptDelta(_ctx, _telemetryIdentity, acpState, {
        label: _telemetryIdentity.label || sessionLabel,
        agentType: _agentType,
      });

      // Agent progress every 30s
      _lastProgressEmit = maybeEmitAcpPollProgress(_ctx, _telemetryIdentity, acpState, {
        label: _telemetryIdentity.label || sessionLabel,
        agentType: _agentType,
        lastEmitAt: _lastProgressEmit,
        intervalMs: progressIntervalMs,
        elapsedSeconds: Math.round((Date.now() - startTime) / 1000),
      });

      if (acpState.rateLimited) {
        _rateLimitPauses++;
        const sanitizedTranscript = sanitizeAcpTranscriptEvidence(acpState.transcript);
        await stopAcpAdapter('rate_limit_cooldown');
        const rateLimitStep = await processSessionRateLimit(config, {
          ..._rateLimitIdentity,
          agent_type: _rateLimitIdentity.phase,
          provider,
          detail: acpState.detail || null,
          transcript: sanitizedTranscript,
        }, {
          pauseCount: _rateLimitPauses,
          maxPauses: _maxRateLimitPauses,
          normalizeStatus: (status) => {
            const normalizedStatus = {
              ...(status || {}),
              detail: status?.detail || acpState.detail || null,
              transcript: status?.transcript || sanitizedTranscript,
            };
            if (_rateLimitIdentity.gate_id) {
              return buildGateSessionRateLimitStatus(normalizedStatus, {
                gateId: _rateLimitIdentity.gate_id,
                gateType: _rateLimitIdentity.gate_type ?? null,
                identity: {
                  agent_type: _rateLimitIdentity.phase,
                  run_id: _rateLimitIdentity.run_id || null,
                  attempt: _rateLimitIdentity.attempt ?? null,
                  dispatch_id: _rateLimitIdentity.dispatch_id ?? null,
                  gateway_label: _rateLimitIdentity.gateway_label || null,
                  session_key: _rateLimitIdentity.session_key || null,
                },
              });
            }
            return buildModuleSessionRateLimitStatus(normalizedStatus, {
              moduleId: _rateLimitIdentity.module_id ?? _moduleId,
              phase: _rateLimitIdentity.phase,
              identity: {
                agent_type: _rateLimitIdentity.phase,
                run_id: _rateLimitIdentity.run_id || null,
                attempt: _rateLimitIdentity.attempt ?? null,
                dispatch_id: _rateLimitIdentity.dispatch_id ?? null,
                gateway_label: _rateLimitIdentity.gateway_label || null,
                session_key: _rateLimitIdentity.session_key || null,
              },
            });
          },
          pauseLogMessage: ({ pauseCount, maxPauses, cooldownHours, resumeAt }) => `[${logLabel}] ACP session rate limited (pause ${pauseCount}/${maxPauses}) — sleeping ${cooldownHours}h (resume at ${resumeAt.toISOString()})`,
          resumeLogMessage: () => `[${logLabel}] ACP session rate limit cooldown complete — resuming monitor`,
          exhaustedLogMessage: ({ pauseCount, maxPauses }) => `[${logLabel}] ACP session rate limit pauses exhausted (${pauseCount}/${maxPauses})`,
          exhaustedResultOptions: _rateLimitIdentity.gate_id
            ? createTrackedGateSessionRateLimitExhaustedResultOptions({
                gateId: _rateLimitIdentity.gate_id,
                gateType: _rateLimitIdentity.gate_type ?? null,
                identity: {
                  agent_type: _rateLimitIdentity.phase,
                  run_id: _rateLimitIdentity.run_id || null,
                  attempt: _rateLimitIdentity.attempt ?? null,
                  dispatch_id: _rateLimitIdentity.dispatch_id ?? null,
                  gateway_label: _rateLimitIdentity.gateway_label || null,
                  session_key: _rateLimitIdentity.session_key || null,
                },
                resultOverrides: {
                  completed: false,
                  hasChanges: false,
                  detail: acpState.detail || null,
                  transcript: sanitizedTranscript,
                },
              })
            : createTrackedModuleSessionRateLimitExhaustedResultOptions({
                moduleId: _rateLimitIdentity.module_id ?? _moduleId,
                moduleDir: _moduleId,
                phase: _rateLimitIdentity.phase,
                identity: {
                  agent_type: _rateLimitIdentity.phase,
                  run_id: _rateLimitIdentity.run_id || null,
                  attempt: _rateLimitIdentity.attempt ?? null,
                  dispatch_id: _rateLimitIdentity.dispatch_id ?? null,
                  gateway_label: _rateLimitIdentity.gateway_label || null,
                  session_key: _rateLimitIdentity.session_key || null,
                },
                resultOverrides: {
                  completed: false,
                  hasChanges: false,
                  detail: acpState.detail || null,
                  transcript: sanitizedTranscript,
                },
              }),
          budget,
        });
        if (rateLimitStep.exhausted) {
          return rateLimitStep.result;
        }

        acpState = {
          ...acpState,
          rateLimited: false,
          transcript: acpState.transcript
            ? { ...acpState.transcript, rateLimited: false }
            : acpState.transcript,
        };
        startAcpAdapter();
        continue;
      }

      if (acpState.terminal) {
        sessionEndDetected = true;
        sessionEndGraceStart = Date.now();
        log('INFO', `[${logLabel}] Session ${acpState.sessionState} (${acpState.reason}) — waiting ${sessionEndGraceMs / 1000}s for final writes to settle`);
      }
    }

    // Session ended + grace expired → done (even without HEAD movement)
    if (sessionEndDetected && (Date.now() - sessionEndGraceStart) >= sessionEndGraceMs) {
      const finalChanges = _detectFinalChanges();
      if (!finalChanges.ok) {
        return { completed: false, hasChanges: false, reason: 'git_error', error: finalChanges.error };
      }
      const hasChanges = finalChanges.hasChanges;

      if (hasChanges) {
        log('OK', `[${logLabel}] Session closed with changes`);
      } else {
        log('WARN', `[${logLabel}] Session closed without file changes — agent may have crashed or made no edits`);
      }

      _mirrorSubagentTranscript();
      return { completed: true, hasChanges, reason: hasChanges ? 'session_ended' : 'session_closed_no_changes', transcript: sanitizeAcpTranscriptEvidence(acpState.transcript) };
    }

    // ── Timeout nudge ──
    // When the session is past the configured threshold (default 75%) of its
    // timeout, send a one-time reminder. This rescues agents that are working
    // but lost in detail — they can prioritize and wrap up.
    const percentElapsed = (Date.now() - startTime) / (timeoutMinutes * 60 * 1000);
    if (!sessionEndDetected && !nudgeSent && percentElapsed >= nudgeThreshold) {
      log('WARN', `[${logLabel}] Session at ${Math.round(percentElapsed * 100)}% of timeout — sending completion nudge`);
      nudgeSent = true;
      const remainingMin = Math.round(budget.remainingMs() / 60000);
      try {
        const sendPolicy = gatewayInvokePolicy(config, 'session_send');
        await sendGatewaySessionMessage(
          sessionKey,
          `TIMEOUT WARNING: You have ~${remainingMin} minutes remaining. Complete your current task and write your output files now. Unfinished work will be lost.`,
          sendPolicy.timeoutMs,
          { ...sendPolicy, budget, signal: budget.signal },
        );
      } catch (error) {
        appendDurableSessionEndAlert(config, _rateLimitIdentity, 'timeout_nudge_failed', {
          error: error?.message || String(error),
          timeout_minutes: timeoutMinutes,
          remaining_minutes: remainingMin,
        });
      }
    }

    // Progress logging
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const remaining = Math.round(budget.remainingMs() / 1000);
    const sessionProgressStateKey = buildSessionProgressStateKey(sessionEndDetected);
    const sessionProgressMsg = `Session active | ${elapsed}s elapsed, ${remaining}s remaining${sessionEndDetected ? ' (session closed, waiting for final writes)' : ''}`;
    const shouldLogSessionProgress = !_lastSessionProgressStateKey
      || sessionProgressStateKey !== _lastSessionProgressStateKey
      || (Date.now() - _lastSessionProgressLogAt) >= sessionProgressLogIntervalMs;
    if (shouldLogSessionProgress) {
      log('INFO', `[${logLabel}] ${sessionProgressMsg}`);
      _lastSessionProgressLogAt = Date.now();
      _lastSessionProgressStateKey = sessionProgressStateKey;
    }
  }
  } catch (error) {
    if (!isBudgetExhaustedError(error)) throw error;
    budgetError = error;
  }

  const _finalTranscript = acpState.transcript || null;
  const _transcriptDesc = _finalTranscript
    ? (_finalTranscript.lastActivityPoll === 0
        ? `active (${_finalTranscript.eventCount} events)`
        : `stale (no activity for ${_finalTranscript.lastActivityPoll} polls)`)
    : 'unknown';
  log('WARN', `[${logLabel}] Timeout — session still running after ${timeoutMinutes}min | Transcript: ${_transcriptDesc}`);
  appendDurableSessionEndAlert(config, _rateLimitIdentity, 'timeout', {
    timeout_minutes: timeoutMinutes,
    transcript: sanitizeAcpTranscriptEvidence(_finalTranscript),
  });
  _mirrorSubagentTranscript();
  const timeoutChanges = _detectFinalChanges();
  if (!timeoutChanges.ok) {
    return { completed: false, hasChanges: false, reason: 'git_error', error: timeoutChanges.error };
  }
  const hasChanges = timeoutChanges.hasChanges;
  if (hasChanges) {
    log('OK', `[${logLabel}] Timeout reached with changes`);
  }
  return { completed: false, hasChanges, reason: hasChanges ? 'timeout_with_changes' : 'timeout', transcript: sanitizeAcpTranscriptEvidence(_finalTranscript), ...(budgetError ? { error: budgetError } : {}) };
  } finally {
    await stopAcpAdapter('poll_for_session_end_done');
  }
}
