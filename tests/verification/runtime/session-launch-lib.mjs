import fs from 'node:fs';
import { parseArgs } from '../lib/lifecycle-audit-lib.mjs';
import { spawnSession, killSession } from '../../../skills/common/pipeline/agents/lifecycle.js';
import { parseSessionState, isStoppedSessionState } from '../../../skills/common/pipeline/agents/acp-monitor.js';
import { gatewayInvoke, resolveGatewayBaseUrl, resolveGatewayToken } from '../../../skills/common/pipeline/integrations/gateway.js';
import { modelToHarness, resolveRuntime } from '../../../skills/common/pipeline/agents/runtime.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
  const gatewayUrl = resolveGatewayBaseUrl(args['gateway-url'] || null);
  const gatewayToken = resolveGatewayToken(args['gateway-token'] || null);
  const timeoutSeconds = parseIntegerArg(args['timeout-seconds'] ?? defaults.timeoutSeconds ?? 120, 'timeout-seconds', { min: 1 });
  const pollAttempts = parseIntegerArg(args['poll-attempts'] ?? defaults.pollAttempts ?? 8, 'poll-attempts', { min: 1 });
  const pollMs = parseIntegerArg(args['poll-ms'] ?? defaults.pollMs ?? 1000, 'poll-ms', { min: 0 });
  const keepSession = asBool(args['keep-session'], false);
  const prompt = args.prompt || defaults.prompt || 'Reply with READY and stop.';
  const labelPrefix = args['label-prefix'] || defaults.labelPrefix || `verify-${runtime}-launch`;
  const label = `${labelPrefix}-${Date.now()}`;
  const agentId = args['agent-id'] || defaults.agentId || modelToHarness(model) || null;
  const allowTerminalAfterLaunch = asBool(args['allow-terminal-after-launch'], defaults.allowTerminalAfterLaunch ?? false);
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
  };
}

export async function observeSessionLaunch(sessionKey, { gatewayUrl, gatewayToken, pollAttempts = 8, pollMs = 1000 } = {}) {
  const observedStates = [];
  const errors = [];
  const errorKinds = [];
  let degradedVisibility = false;

  for (let attempt = 1; attempt <= pollAttempts; attempt += 1) {
    try {
      const raw = await gatewayInvoke('session_status', { sessionKey }, 5000, { gatewayUrl, gatewayToken });
      const details = raw?.result?.details || raw;
      const parsed = parseSessionState(details);
      observedStates.push(parsed.state);
      return {
        visible: true,
        active: parsed.active,
        state: parsed.state,
        observedStates,
        details,
        errors,
        errorKinds,
        degradedVisibility,
      };
    } catch (err) {
      const parsed = parseStatusError(err);
      errors.push(parsed.message);
      errorKinds.push(parsed.kind);
      if (!parsed.notFound) degradedVisibility = true;
      if (attempt >= pollAttempts || !parsed.notFound) {
        return {
          visible: false,
          active: false,
          state: parsed.notFound ? 'not_found' : 'status_error',
          observedStates,
          details: null,
          errors,
          errorKinds,
          degradedVisibility,
        };
      }
      await sleep(pollMs);
    }
  }

  return {
    visible: false,
    active: false,
    state: 'not_found',
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

  const cleanupConfirmed = keepSession ? null : cleanup?.confirmed === true;
  const degradedVisibility = observed?.degradedVisibility === true || launchEvidence === 'stream_log_only' || Boolean(observationIssue);
  const nonPassReasons = [];

  if (observationIssue) nonPassReasons.push('launch_observation_invalid');
  if (!launchConfirmed) {
    nonPassReasons.push(launchEvidence === 'stream_log_only'
      ? 'launch_unconfirmed_stream_log_only'
      : 'launch_unconfirmed');
  }
  if (observed?.degradedVisibility === true) nonPassReasons.push('gateway_visibility_degraded');
  if (!keepSession && cleanup?.confirmed !== true) nonPassReasons.push('cleanup_unconfirmed');

  return {
    ok: launchConfirmed && observed?.degradedVisibility !== true && (keepSession || cleanup?.confirmed === true),
    launchConfirmed,
    launchEvidence,
    degradedVisibility,
    cleanupConfirmed,
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
    agentId: runtime === 'acp' ? options.agentId : null,
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
      agentId: runtime === 'acp' ? options.agentId : null,
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
      agentId: runtime === 'acp' ? options.agentId : null,
      label: options.label,
      gatewayUrl: options.gatewayUrl,
      gatewayToken: options.gatewayToken,
      confirmTimeoutMs: 5000,
      cleanupConfirmTimeoutMs: 5000,
      confirmPollMs: 500,
    });
  }

  const assessment = assessLaunchVerification({
    observed,
    streamLogExists,
    cleanup,
    allowTerminalAfterLaunch: options.allowTerminalAfterLaunch,
    keepSession: options.keepSession,
  });

  return {
    ...assessment,
    runtime,
    model: options.model,
    agentId: runtime === 'acp' ? options.agentId : null,
    label: options.label,
    gatewayUrl: options.gatewayUrl,
    sessionKey: sessionData.childSessionKey,
    runId: sessionData.runId,
    streamLogPath: sessionData.streamLogPath || null,
    streamLogExists,
    launchVisible: observed.visible,
    active: observed.active,
    state: observed.state,
    observedStates: observed.observedStates,
    statusErrors: observed.errors,
    statusErrorKinds: observed.errorKinds || [],
    cleanup,
  };
}
