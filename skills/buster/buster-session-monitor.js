import {
  getAcpMonitorConfig,
  getAcpMonitorState,
  isSessionTerminal,
  publishTranscriptDelta,
} from '../common/pipeline/agents/acp-monitor.js';
import { killSession } from '../common/pipeline/agents/lifecycle.js';
import { resolveGatewayBaseUrl, resolveGatewayToken } from '../common/pipeline/integrations/gateway.js';

import { emitEvent } from './pipeline/services/telemetry.js';
import {
  createRateLimitState,
  handleRateLimit,
  shouldRetryAfterRateLimit,
} from './pipeline/services/rate-limit.js';
import { createLogger } from './pipeline/services/logger.js';

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

/**
 * Monitor an ACP child session until terminal, timeout, or rate-limit abort.
 * Emits session_monitor on every poll and transcript events on new lines.
 *
 * @param {string} childSessionKey - ACP child session key (required)
 * @param {string|null} streamLogPath - Optional ACP stream log path
 * @param {object} [payload] - Original task payload (used for timeout, telemetry context)
 * @param {object|null} [tctx] - Telemetry context returned by createTelemetryContext
 * @param {object} [meta] - Optional overrides: { moduleId, spawnedAt, timeoutSeconds, logger, testHooks }
 * @returns {{ terminal: boolean, reason: string|null, detail: string, state: object }}
 */
export async function monitorSession(childSessionKey, streamLogPath, payload = {}, tctx = null, meta = {}) {
  const cfg = getAcpMonitorConfig(payload.acp_monitor || {});
  const moduleId  = meta.moduleId  || payload?.module_id || 'unknown';
  const spawnedAt = meta.spawnedAt || Date.now();
  const logger    = meta.logger    || createLogger({ module: moduleId });
  const hooks     = meta.testHooks || {};
  const now       = typeof hooks.now === 'function' ? hooks.now : Date.now;
  const sleepFn   = hooks.sleep || sleep;
  const getState  = hooks.getAcpMonitorState || getAcpMonitorState;
  const stopChild = hooks.killSession || killSession;
  const timeoutSeconds = Number(meta.timeoutSeconds ?? payload?.timeout_seconds ?? payload?.session?.timeout_seconds ?? 0);
  const hardDeadlineMs = Number.isFinite(timeoutSeconds) && timeoutSeconds > 0
    ? spawnedAt + (timeoutSeconds * 1000)
    : null;
  const killGraceMs = Math.max(
    Number(payload?.acp_monitor?.kill_grace_ms ?? meta.killGraceMs ?? 15000) || 15000,
    cfg.monitorPollMs,
  );

  const gatewayUrl   = resolveGatewayBaseUrl();
  const gatewayToken = resolveGatewayToken();

  const opts = {
    gatewayUrl,
    gatewayToken,
    unknownPollLimit: cfg.unknownPollLimit,
    stalePollLimit:   cfg.stalePollLimit,
  };

  const rlConfig = payload?.rate_limit || {};
  const rlState = createRateLimitState({
    maxPauses:        rlConfig.max_pauses          ?? payload?.acp_monitor?.max_rate_limit_pauses ?? 3,
    initialCooldownS: rlConfig.initial_cooldown_s  ?? 120,
    maxCooldownS:     rlConfig.max_cooldown_s       ?? 600,
  });

  let prev      = {};
  let pollCount = 0;
  let gatewayDegradedAt = null;

  async function enforceHardTimeout(lastState = prev) {
    const elapsedSeconds = Math.round((now() - spawnedAt) / 1000);
    logger.warn('MONITOR', `Hard timeout reached for ${childSessionKey}, issuing explicit kill`, {
      elapsedSeconds,
      timeoutSeconds,
      killGraceMs,
    });

    let killIssued = false;
    let killConfirmed = false;
    try {
      const stopResult = await stopChild(childSessionKey, {
        runtime: payload?.session?.runtime,
        model: payload?.session?.model || null,
        agentId: payload?.session?.agentId || null,
        label: payload?.session?.label || payload?.dispatch_id || null,
      });
      killIssued = !!(stopResult?.requested || stopResult?.confirmed || stopResult === true);
      killConfirmed = !!stopResult?.confirmed;
    } catch (err) {
      const detail = `hard timeout reached after ${elapsedSeconds}s; explicit kill failed: ${err.message}`;
      logger.warn('MONITOR', detail);
      return {
        terminal: false,
        reason: 'session_timeout_kill_failed',
        detail,
        state: lastState,
        killIssued: false,
        killConfirmed: false,
      };
    }

    let observedState = lastState;
    const killDeadlineMs = now() + killGraceMs;
    while (now() < killDeadlineMs) {
      observedState = await getState(childSessionKey, streamLogPath, observedState, opts);
      if (isSessionTerminal(observedState) || /^(closed|error|idle|no_session_key)$/i.test(observedState?.sessionState || '')) {
        const detail = `hard timeout reached after ${elapsedSeconds}s; explicit kill ${killIssued ? 'requested' : 'attempted'} and session reconciled as ${observedState?.sessionState || 'terminal'}`;
        logger.warn('MONITOR', detail);
        return {
          terminal: false,
          reason: 'session_timeout_kill_confirmed',
          detail,
          state: observedState,
          killIssued,
          killConfirmed: true,
        };
      }

      const remainingKillMs = killDeadlineMs - now();
      if (remainingKillMs <= 0) break;
      await sleepFn(Math.min(cfg.monitorPollMs, remainingKillMs));
    }

    const detail = `hard timeout reached after ${elapsedSeconds}s; explicit kill ${killIssued ? 'requested' : 'attempted'} but session still reported ${observedState?.sessionState || 'active'} after ${Math.round(killGraceMs / 1000)}s grace`;
    logger.warn('MONITOR', detail);
    return {
      terminal: false,
      reason: 'session_timeout_kill_unconfirmed',
      detail,
      state: observedState,
      killIssued,
      killConfirmed,
    };
  }

  logger.info('MONITOR', `Monitoring session ${childSessionKey}`, {
    pollMs: cfg.monitorPollMs,
    unknownLimit: cfg.unknownPollLimit,
    staleLimit: cfg.stalePollLimit,
    timeoutSeconds: hardDeadlineMs ? timeoutSeconds : null,
  });

  while (true) {
    if (hardDeadlineMs && now() >= hardDeadlineMs) {
      return enforceHardTimeout(prev);
    }

    const state = await getState(childSessionKey, streamLogPath, prev, opts);
    pollCount++;

    const elapsedSeconds   = Math.round((now() - spawnedAt) / 1000);
    const transcriptEvents = state.transcript?.eventCount ?? 0;

    logger.info('MONITOR', `Poll #${pollCount}`, {
      sessionState: state.sessionState,
      active:       state.sessionActive,
      stalePolls:   state.transcriptStalePolls,
      unknownPolls: state.unknownPolls,
      terminal:     state.terminal,
    });

    await emitEvent(tctx, 'buster.session_monitor', {
      module_id:         moduleId,
      session_key:       childSessionKey,
      agent_type:        'buster',
      elapsed_seconds:   elapsedSeconds,
      acp_state:         state.sessionState,
      transcript_events: transcriptEvents,
      rate_limited:      state.rateLimited,
      gateway_unreachable: state.gatewayUnreachable === true,
    });

    if (state.gatewayUnreachable === true && !gatewayDegradedAt) {
      gatewayDegradedAt = new Date().toISOString();
      await emitEvent(tctx, 'observability.degraded', {
        component: 'acp_monitor',
        surface: 'gateway',
        reason: 'gateway_unreachable',
        detail: state.gatewayDetail || state.detail || 'session status unreachable',
        module_id: moduleId,
        session_key: childSessionKey,
        agent_type: 'buster',
        degraded_at: gatewayDegradedAt,
      });
    } else if (state.gatewayUnreachable !== true && gatewayDegradedAt) {
      const restoredAt = new Date().toISOString();
      await emitEvent(tctx, 'observability.restored', {
        component: 'acp_monitor',
        surface: 'gateway',
        reason: 'gateway_unreachable',
        detail: 'session status reachable again',
        module_id: moduleId,
        session_key: childSessionKey,
        agent_type: 'buster',
        degraded_at: gatewayDegradedAt,
        restored_at: restoredAt,
        restored_after_ms: Math.max(0, Date.now() - new Date(gatewayDegradedAt).getTime()),
      });
      gatewayDegradedAt = null;
    }

    const newLines = state.transcript?.newLines || [];
    const newLineCount = newLines.length;

    if (newLineCount > 0) {
      publishTranscriptDelta(
        tctx,
        `buster-${moduleId}`,
        moduleId,
        newLines,
        (_ctx, data) => emitEvent(tctx, 'agent.transcript', data),
      );
    }

    if (state.rateLimited) {
      if (!shouldRetryAfterRateLimit(rlState)) {
        logger.warn('RATE-LIMIT', `Max pauses (${rlState.maxPauses}) exhausted for session ${childSessionKey}`);
        return {
          terminal: false,
          reason:   'rate_limited',
          detail:   state.detail,
          state,
        };
      }

      const recovery = await handleRateLimit(rlState, {
        childSessionKey,
        gatewayUrl,
        gatewayToken,
        telemetryCtx: tctx,
        moduleId,
        gateId: payload?.gate_id || null,
        gateType: payload?.gate_type || null,
        phase: 'buster',
        project: payload?.project || process.env.BUSTER_PROJECT || '',
        attempt: payload?.attempt ?? null,
        dispatchId: payload?.dispatch_id || payload?.session?.label || null,
        gatewayLabel: payload?.session?.label || payload?.dispatch_id || null,
        detail: state.detail || null,
        provider: 'anthropic',
        ownsCanonicalSignal: (payload?.task_type || null) !== 'gate_test',
      });

      if (recovery.gatewayUnreachable === true && !gatewayDegradedAt) {
        gatewayDegradedAt = new Date().toISOString();
        await emitEvent(tctx, 'observability.degraded', {
          component: 'acp_monitor',
          surface: 'gateway',
          reason: 'gateway_unreachable',
          detail: recovery.gatewayDetail || 'session status unreachable during rate-limit recovery',
          module_id: moduleId,
          session_key: childSessionKey,
          agent_type: 'buster',
          degraded_at: gatewayDegradedAt,
        });
      }

      if (recovery.action === 'resume') {
        logger.info('RATE-LIMIT', `Resuming after rate-limit recovery`, {
          pause: rlState.pauseCount, maxPauses: rlState.maxPauses,
        });
        prev = {
          ...state,
          gatewayUnreachable: recovery.gatewayUnreachable === true || state.gatewayUnreachable === true,
          gatewayDetail: recovery.gatewayDetail || state.gatewayDetail || null,
          rateLimited: false,
          transcript:  state.transcript
            ? { ...state.transcript, rateLimited: false }
            : state.transcript,
        };
        continue;
      }

      logger.warn('RATE-LIMIT', `Session ${childSessionKey} died during rate-limit cooldown`);
      return {
        terminal: false,
        reason:   'rate_limited',
        detail:   state.detail,
        state,
      };
    }

    if (isSessionTerminal(state)) {
      logger.info('MONITOR', `Session terminal`, { reason: state.reason, detail: state.detail });
      return {
        terminal: true,
        reason:   state.reason,
        detail:   state.detail,
        state,
      };
    }

    prev = state;

    if (hardDeadlineMs && now() >= hardDeadlineMs) {
      return enforceHardTimeout(prev);
    }

    const sleepMs = hardDeadlineMs
      ? Math.min(cfg.monitorPollMs, Math.max(0, hardDeadlineMs - now()))
      : cfg.monitorPollMs;

    if (sleepMs > 0) {
      await sleepFn(sleepMs);
    }
  }
}
