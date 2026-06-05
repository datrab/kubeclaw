import fs from 'node:fs';
import { parseArgs } from '../lib/lifecycle-audit-lib.mjs';
import { spawnSession, killSession } from '../../../skills/common/pipeline/agents/lifecycle.ts';
import {
  createAcpMonitorEventAdapter,
  isStoppedSessionState,
  monitorStateFromAcpEvent,
} from '../../../skills/common/pipeline/agents/acp-monitor.ts';
import { gatewayInvoke, resolveGatewayBaseUrl, resolveGatewayToken } from '../../../skills/common/pipeline/integrations/gateway.ts';
import { modelToHarness, resolveRuntime } from '../../../skills/common/pipeline/agents/runtime.ts';
import { createBudget, isBudgetExhaustedError } from '../../../skills/common/pipeline/timing.ts';
import { createPipelineEventBus, waitForAny } from '../../../skills/common/pipeline/services/pipeline-event-contract.ts';

function asBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return /^(1|true|yes|on)$/i.test(String(value));
}

function parseIntegerArg(rawValue, argName, { min = 0 } = {}) {
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value < min) {
    throw new Error(`--${argName} must be an integer >= ${min}`);
  }
  return value;
}

function parseStatusError(err) {
  const message = err?.message || String(err);
  const notFound = /\b404\b|not found|unknown session/i.test(message);
  return {
    message,
    notFound,
    kind: notFound ? 'not_found' : 'status_error',
  };
}

export function parseLaunchArgs(argv = process.argv.slice(2), defaults = {}) {
  const args = parseArgs(argv);
  const runtime = resolveRuntime({ runtime: args.runtime || defaults.runtime, model: args.model || defaults.model });
  const model = args.model || defaults.model;
  const cwd = args.cwd || process.cwd();
  const timeoutSeconds = parseIntegerArg(args['timeout-seconds'] ?? defaults.timeoutSeconds ?? 120, 'timeout-seconds', { min: 1 });
  const pollAttempts = parseIntegerArg(args['poll-attempts'] ?? defaults.pollAttempts ?? 8, 'poll-attempts', { min: 1 });
  const pollMs = parseIntegerArg(args['poll-ms'] ?? defaults.pollMs ?? 1000, 'poll-ms', { min: 0 });
  const gatewayUrl = resolveGatewayBaseUrl(args['gateway-url'] || null);
  const gatewayToken = resolveGatewayToken(args['gateway-token'] || null);
  const keepSession = asBool(args['keep-session'], false);
  const prompt = args.prompt || defaults.prompt || 'Reply with READY and stop.';
  const labelPrefix = args['label-prefix'] || defaults.labelPrefix || `verify-${runtime}-launch`;
  const label = `${labelPrefix}-${Date.now()}`;
  const agentId = args['agent-id'] || defaults.agentId || modelToHarness(model) || null;
  const allowTerminalAfterLaunch = asBool(args['allow-terminal-after-launch'], defaults.allowTerminalAfterLaunch ?? false);
  const allowStoppedCleanup = asBool(args['allow-stopped-cleanup'], defaults.allowStoppedCleanup ?? false);
  return {
    runtime,
    model,
    cwd,
    gatewayUrl,
    gatewayToken,
    timeoutSeconds,
    pollAttempts,
    pollMs,
    keepSession,
    prompt,
    label,
    agentId,
    allowTerminalAfterLaunch,
    allowStoppedCleanup,
  };
}

export async function observeSessionLaunch(sessionKey, { gatewayUrl, gatewayToken, pollAttempts = 8, pollMs = 1000 } = {}) {
  const observedStates = [];
  const errors = [];
  const errorKinds = [];
  let degradedVisibility = false;
  const eventBus = createPipelineEventBus();
  const budget = createBudget({ timeoutMs: Math.max(1, pollAttempts) * Math.max(1, pollMs), label: 'session-launch-observation' });
  const identity = { session_key: sessionKey };
  const adapter = createAcpMonitorEventAdapter(sessionKey, null, {
    eventBus,
    identity,
    budget,
    pollMs,
    monitorOpts: {
      gatewayUrl,
      gatewayToken,
      unknown_poll_limit: pollAttempts,
      stale_poll_limit: pollAttempts,
      max_transcript_extensions: 0,
      transcript_grace_ms: 0,
      monitor_poll_ms: pollMs,
    },
    stopOnTerminal: false,
  });

  adapter.start();
  try {
    while (budget.remainingMs() > 0) {
      try {
        const event = await waitForAny(eventBus, ['acp.session.state', 'fatal.error'], identity, {
          signal: budget.signal,
          budget,
          timeoutMs: budget.remainingMs(),
        });
        if (event.type === 'fatal.error') {
          const message = event.payload?.error || 'session status adapter failed';
          errors.push(message);
          errorKinds.push('status_error');
          degradedVisibility = true;
          return {
            visible: false,
            active: false,
            state: 'status_error',
            observedStates,
            details: null,
            errors,
            errorKinds,
            degradedVisibility,
          };
        }
        const state = monitorStateFromAcpEvent(event);
        if (!state) continue;
        observedStates.push(state.sessionState);
        if (state.gatewayUnreachable === true) {
          const parsed = parseStatusError(new Error(state.gatewayDetail || state.detail || 'session status unreachable'));
          errors.push(parsed.message);
          errorKinds.push(parsed.kind);
          degradedVisibility = true;
          if (!parsed.notFound) {
            return {
              visible: false,
              active: false,
              state: 'status_error',
              observedStates,
              details: null,
              errors,
              errorKinds,
              degradedVisibility,
            };
          }
          continue;
        }
        return {
          visible: true,
          active: state.sessionActive,
          state: state.sessionState,
          observedStates,
          details: state,
          errors,
          errorKinds,
          degradedVisibility,
        };
      } catch (err) {
        if (err?.code === 'PIPELINE_EVENT_WAIT_TIMEOUT' || isBudgetExhaustedError(err)) break;
        const parsed = parseStatusError(err);
        errors.push(parsed.message);
        errorKinds.push(parsed.kind);
        if (!parsed.notFound) degradedVisibility = true;
        break;
      }
    }
  } finally {
    adapter.stop('launch_observation_done');
    await adapter.done?.catch?.(() => {});
  }

  return {
    visible: false,
    active: false,
    state: degradedVisibility ? 'status_error' : 'not_found',
    observedStates,
    details: null,
    errors,
    errorKinds,
    degradedVisibility,
  };
}

export function assessLaunchVerification({
  observed = {},
  streamLogExists = false,
  cleanup = null,
  allowTerminalAfterLaunch = false,
  allowStoppedCleanup = false,
  keepSession = false,
} = {}) {
  const observationIssue = resolveLaunchObservationIssue(observed);
  const launchConfirmed = Boolean(observed?.visible && (
    !observationIssue
    && (
    observed?.active
    || isStoppedSessionState(observed?.state)
    || (allowTerminalAfterLaunch === true && observed?.state && observed.state !== 'not_found' && observed.state !== 'status_error')
    )
  ));

  const launchEvidence = observationIssue
    ? 'invalid_observation'
    : (launchConfirmed
    ? 'session_status'
    : ((allowTerminalAfterLaunch === true && streamLogExists) ? 'stream_log_only' : 'none'));

  const stoppedBeforeCleanup = allowStoppedCleanup === true
    && observed?.visible === true
    && observed?.active !== true
    && isStoppedSessionState(observed?.state);
  const cleanupConfirmed = keepSession ? null : (cleanup?.confirmed === true || stoppedBeforeCleanup);
  const degradedVisibility = observed?.degradedVisibility === true || launchEvidence === 'stream_log_only' || Boolean(observationIssue);
  const nonPassReasons = [];

  if (observationIssue) nonPassReasons.push('launch_observation_invalid');
  if (!launchConfirmed) {
    nonPassReasons.push(launchEvidence === 'stream_log_only'
      ? 'launch_unconfirmed_stream_log_only'
      : 'launch_unconfirmed');
  }
  if (observed?.degradedVisibility === true) nonPassReasons.push('gateway_visibility_degraded');
  if (!keepSession && cleanupConfirmed !== true) nonPassReasons.push('cleanup_unconfirmed');

  return {
    ok: launchConfirmed && observed?.degradedVisibility !== true && (keepSession || cleanupConfirmed === true),
    launchConfirmed,
    launchEvidence,
    degradedVisibility,
    cleanupConfirmed,
    cleanupConfirmedByStoppedState: stoppedBeforeCleanup,
    observationIssue,
    nonPassReasons,
  };
}

function resolveLaunchObservationIssue(observed = {}) {
  if (!observed || typeof observed !== 'object') return 'missing_observation';

  const visible = observed.visible === true;
  const active = observed.active === true;
  const state = observed.state == null ? null : String(observed.state).toLowerCase();

  if (active && !visible) return 'active_without_visibility';
  if (visible && !state) return 'visible_without_state';
  if ((state === 'not_found' || state === 'status_error') && (visible || active)) {
    return `${state}_marked_visible`;
  }
  if (!visible && state && !['not_found', 'status_error', 'unknown'].includes(state)) {
    return 'state_without_visibility';
  }

  return null;
}

export async function verifyLaunchReachability(options) {
  const runtime = resolveRuntime({ runtime: options.runtime, model: options.model });
  const spawnOptions = {
    runtime,
    model: options.model,
    agentId: options.agentId,
    cwd: options.cwd,
    label: options.label,
    gatewayUrl: options.gatewayUrl,
    gatewayToken: options.gatewayToken,
    maxRetries: 1,
    trackActive: false,
    cleanup: 'keep',
  };

  const sessionData = await spawnSession({
    session: {
      runtime,
      model: options.model,
      agentId: options.agentId,
      cwd: options.cwd,
      label: options.label,
    },
  }, options.prompt, options.timeoutSeconds, spawnOptions);

  const observed = await observeSessionLaunch(sessionData.childSessionKey, {
    gatewayUrl: options.gatewayUrl,
    gatewayToken: options.gatewayToken,
    pollAttempts: options.pollAttempts,
    pollMs: options.pollMs,
  });

  const streamLogExists = Boolean(sessionData.streamLogPath && fs.existsSync(sessionData.streamLogPath));

  let cleanup = null;
  if (!options.keepSession) {
    cleanup = await killSession(sessionData.childSessionKey, {
      runtime,
      model: options.model,
      agentId: options.agentId,
      label: options.label,
      gatewayUrl: options.gatewayUrl,
      gatewayToken: options.gatewayToken,
      confirmTimeoutMs: 30000,
      cleanupConfirmTimeoutMs: 30000,
      confirmPollMs: 500,
    });
  }

  const assessment = assessLaunchVerification({
    observed,
    streamLogExists,
    cleanup,
    allowTerminalAfterLaunch: options.allowTerminalAfterLaunch,
    allowStoppedCleanup: options.allowStoppedCleanup,
    keepSession: options.keepSession,
  });

  return {
    ...assessment,
    runtime,
    model: options.model,
    agentId: options.agentId,
    label: options.label,
    gatewayUrl: options.gatewayUrl,
    sessionKey: sessionData.childSessionKey,
    runId: sessionData.runId,
    streamLogPath: sessionData.streamLogPath || null,
    streamLogExists,
    launchVisible: observed.visible,
    allowStoppedCleanup: options.allowStoppedCleanup,
    active: observed.active,
    state: observed.state,
    observedStates: observed.observedStates,
    statusErrors: observed.errors,
    statusErrorKinds: observed.errorKinds || [],
    cleanup,
  };
}
