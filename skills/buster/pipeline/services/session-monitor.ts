import {
  getAcpMonitorConfig,
  createAcpMonitorEventAdapter,
  isSessionTerminal,
  monitorStateFromAcpEvent,
  publishTranscriptDelta,
} from '../agents/acp-monitor.ts';
import {
  SESSION_TERMINATION_POLICY_DEFAULTS,
  terminateSession,
} from '../agents/session-termination.ts';
import { resolveGatewayBaseUrl, resolveGatewayToken } from '../integrations/gateway.ts';

import { emitEvent, emitPluginEvent } from './telemetry.ts';
import {
  createRateLimitState,
  handleRateLimit,
  shouldRetryAfterRateLimit,
} from './rate-limit.ts';
import { createLogger } from './logger.ts';
import { createBudget } from '../timing.ts';
import { createPipelineEventBus, waitForAny } from './pipeline-event-contract.ts';
import { assertValidSessionTerminationResult } from './acp-gateway-contract.ts';

function buildRateLimitStatus(rlState) {
  return {
    pause_count: rlState.pauseCount,
    max_rate_limit_pauses: rlState.maxPauses,
    current_cooldown_s: rlState.currentCooldownS,
  };
}

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
export async function monitorSession(childSessionKey: string, streamLogPath: string | null, payload: Record<string, any> = {}, tctx: any = null, meta: Record<string, any> = {}): Promise<any> {
  const cfg = getAcpMonitorConfig(payload.acp_monitor || {});
  const moduleId  = meta.moduleId  || payload?.module_id || 'unknown';
  const spawnedAt = meta.spawnedAt || Date.now();
  const logger    = meta.logger    || createLogger({ module: moduleId });
  const hooks     = meta.testHooks || {};
  const now       = typeof hooks.now === 'function' ? hooks.now : Date.now;
  const getState  = hooks.getAcpMonitorState || null;
  const terminateChild = hooks.terminateSession || terminateSession;
  const timeoutSeconds = Number(meta.timeoutSeconds ?? payload?.timeout_seconds ?? payload?.session?.timeout_seconds ?? 0);
  const hardDeadlineMs = Number.isFinite(timeoutSeconds) && timeoutSeconds > 0
    ? spawnedAt + (timeoutSeconds * 1000)
    : null;
  const requestedKillGraceMs = Number(payload?.acp_monitor?.kill_grace_ms ?? meta.killGraceMs ?? SESSION_TERMINATION_POLICY_DEFAULTS.graceMs) || SESSION_TERMINATION_POLICY_DEFAULTS.graceMs;
  const killGraceMs = Math.min(
    Math.max(requestedKillGraceMs, cfg.monitorPollMs),
    SESSION_TERMINATION_POLICY_DEFAULTS.maxGraceMs,
  );

  const gatewayUrl   = resolveGatewayBaseUrl(meta.gatewayUrl ?? payload?.gateway_url);
  const gatewayToken = resolveGatewayToken(meta.gatewayToken ?? payload?.gateway_token);
  const eventBus = createPipelineEventBus();
  const adapterIdentity = {
    module_id: moduleId,
    gate_id: payload?.gate_id || null,
    dispatch_id: payload?.dispatch_id || payload?.session?.label || null,
    session_key: childSessionKey,
  };
  const runBudget = hardDeadlineMs
    ? createBudget({ deadlineMs: hardDeadlineMs, label: `buster-monitor-${moduleId}` })
    : null;

  const opts = {
    ...cfg,
    gatewayUrl,
    gatewayToken,
  };

  const rlConfig = payload?.rate_limit || {};
  const rlState = createRateLimitState({
    maxPauses:        rlConfig.max_pauses,
    initialCooldownS: rlConfig.initial_cooldown_s,
    maxCooldownS:     rlConfig.max_cooldown_s,
  });

  let prev      = {};
  let pollCount = 0;
  let gatewayDegradedAt = null;
  let adapter = null;

  function startAdapter(initialState = prev, budget = runBudget) {
    adapter = createAcpMonitorEventAdapter(childSessionKey, streamLogPath, {
      eventBus,
      identity: adapterIdentity,
      budget,
      pollMs: cfg.monitorPollMs,
      monitorOpts: opts,
      initialState,
      stopOnTerminal: false,
      ...(getState ? { getAcpMonitorState: getState } : {}),
    });
    adapter.start();
    return adapter;
  }

  async function stopAdapter(reason) {
    if (!adapter) return;
    const current = adapter;
    adapter = null;
    current.stop(reason);
    await current.done?.catch?.(() => {});
  }

  async function waitForMonitorEvent(timeoutMs = null, budget = runBudget) {
    return waitForAny(eventBus, ['acp.session.state', 'acp.transcript.delta', 'fatal.error'], adapterIdentity, {
      signal: budget?.signal || adapter?.signal,
      ...(budget ? { budget } : {}),
      timeoutMs,
    });
  }

  async function enforceHardTimeout(lastState = prev) {
    const elapsedSeconds = Math.round((now() - spawnedAt) / 1000);
    logger.warn('MONITOR', `Hard timeout reached for ${childSessionKey}, issuing explicit kill`, {
      elapsedSeconds,
      timeoutSeconds,
      killGraceMs,
    });

    await stopAdapter('hard_timeout');
    const termination = assertValidSessionTerminationResult(await terminateChild(childSessionKey, {
      runtime: payload?.session?.runtime,
      model: payload?.session?.model || null,
      agentId: payload?.session?.agentId || null,
      label: payload?.session?.label || payload?.dispatch_id || null,
      graceMs: killGraceMs,
    }));

    if (termination.confirmed) {
      const detail = `hard timeout reached after ${elapsedSeconds}s; explicit termination confirmed as ${termination.state}`;
      logger.warn('MONITOR', detail);
      return {
        terminal: false,
        reason: 'session_timeout_kill_confirmed',
        detail,
        state: lastState,
        termination,
      };
    }

    const detail = `hard timeout reached after ${elapsedSeconds}s; explicit termination unconfirmed as ${termination.state} after ${Math.round(termination.graceMs / 1000)}s grace`;
    logger.warn('MONITOR', detail);
    return {
      terminal: false,
      reason: 'session_timeout_kill_unconfirmed',
      detail,
      state: lastState,
      termination,
    };
  }

  logger.info('MONITOR', `Monitoring session ${childSessionKey}`, {
    pollMs: cfg.monitorPollMs,
    unknownLimit: cfg.unknownPollLimit,
    staleLimit: cfg.stalePollLimit,
    timeoutSeconds: hardDeadlineMs ? timeoutSeconds : null,
  });

  startAdapter();

  try {
    while (!hardDeadlineMs || now() < hardDeadlineMs) {
      let event;
      try {
        event = await waitForMonitorEvent(hardDeadlineMs ? Math.max(0, hardDeadlineMs - now()) : null);
      } catch (error) {
        if (hardDeadlineMs && (error?.code === 'PIPELINE_EVENT_WAIT_TIMEOUT' || error?.code === 'BUDGET_EXHAUSTED' || error?.name === 'BudgetExhaustedError')) {
          return enforceHardTimeout(prev);
        }
        throw error;
      }

      if (event?.type === 'fatal.error') {
        return {
          terminal: false,
          reason: 'monitor_adapter_failed',
          detail: event.payload?.error || 'ACP monitor adapter failed',
          state: prev,
        };
      }

      const state = monitorStateFromAcpEvent(event);
      if (!state) continue;
      prev = state;
      pollCount++;

      const elapsedSeconds   = Math.round((now() - spawnedAt) / 1000);
      const transcriptEvents = state.transcript?.eventCount ?? 0;

      logger.info('MONITOR', `State event #${pollCount}`, {
        sessionState: state.sessionState,
        active:       state.sessionActive,
        stalePolls:   state.transcriptStalePolls,
        unknownPolls: state.unknownPolls,
        terminal:     state.terminal,
      });

      await emitPluginEvent(tctx, 'session_monitor', {
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

      if (event.type === 'acp.transcript.delta') {
        const newLines = state.transcript?.newLines || [];
        if (newLines.length > 0) {
          publishTranscriptDelta(
            tctx,
            {
              label: `buster-${moduleId}`,
              module_id: moduleId,
              gate_id: payload?.gate_id || null,
              gate_type: payload?.gate_type || null,
              session_key: childSessionKey,
              dispatch_id: payload?.dispatch_id || payload?.session?.label || null,
              agent_type: 'buster',
            },
            newLines,
            (_ctx, data) => emitEvent(tctx, 'agent.transcript', data),
          );
        }
      }

      if (state.rateLimited) {
        if (!shouldRetryAfterRateLimit(rlState)) {
          logger.warn('RATE-LIMIT', `Max pauses (${rlState.maxPauses}) exhausted for session ${childSessionKey}`);
          return {
            terminal: false,
            reason:   'rate_limited',
            detail:   state.detail,
            state,
            max_rate_limit_pauses: rlState.maxPauses,
            rate_limit_status: buildRateLimitStatus(rlState),
          };
        }

        await stopAdapter('rate_limit_cooldown');
        const recovery = await handleRateLimit(rlState, {
          childSessionKey,
          gatewayUrl,
          gatewayToken,
          telemetryCtx: tctx,
          moduleId,
          gateId: payload?.gate_id || null,
          gateType: payload?.gate_type || null,
          phase: 'buster',
          project: payload?.project || null,
          attempt: payload?.attempt ?? null,
          dispatchId: payload?.dispatch_id || null,
          gatewayLabel: payload?.session?.label || payload?.dispatch_id || null,
          detail: state.detail || null,
          provider: 'anthropic',
          acpMonitorConfig: cfg,
          ownsCanonicalSignal: true,
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
          startAdapter(prev);
          continue;
        }

        logger.warn('RATE-LIMIT', `Session ${childSessionKey} died during rate-limit cooldown`);
        return {
          terminal: false,
          reason:   'rate_limited',
          detail:   state.detail,
          state,
          max_rate_limit_pauses: rlState.maxPauses,
          rate_limit_status: buildRateLimitStatus(rlState),
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
    }

    return enforceHardTimeout(prev);
  } finally {
    await stopAdapter('monitor_done');
  }
}
