import { getActiveContext } from '../core/logger.ts';
import { getAcpMonitorState } from '../agents/acp-monitor.ts';
import { updateGatewayObservability, updateTranscriptObservability } from './telemetry.ts';
import { sleep } from '../timing.ts';

function observabilityCtx(config) {
  return getActiveContext() || { config, runId: config?._runId || config?.run_id || null };
}

function normalizeAttempt(value) {
  if (value === undefined || value === null || value === '') return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function normalizeIdentity(identity = {}) {
  return {
    module_id: identity.module_id ?? identity.moduleId ?? null,
    gate_id: identity.gate_id ?? identity.gateId ?? null,
    gate_type: identity.gate_type ?? identity.gateType ?? null,
    gateway_label: identity.gateway_label ?? identity.gatewayLabel ?? null,
    session_key: identity.session_key || identity.sessionKey || null,
    attempt: normalizeAttempt(identity.attempt),
    dispatch_id: identity.dispatch_id || identity.dispatchId || null,
    agent_type: identity.agent_type || identity.agentType || null,
  };
}

function buildObservabilityData(identity, monitor = {}) {
  const transcriptDetail = monitor?.transcript?.lastDetail || null;
  return {
    ...identity,
    detail: monitor?.detail || monitor?.lastDetail || monitor?.gatewayDetail || transcriptDetail || monitor?.sessionState || null,
    gateway_unreachable: monitor?.gatewayUnreachable === true,
    gateway_detail: monitor?.gatewayDetail || null,
    transcript_detail: transcriptDetail,
  };
}

export async function observeAcpMonitorSurfaces(config, sessionLabelOrKey, identity = {}, opts = {}) {
  const ctx = observabilityCtx(config);
  const normalizedIdentity = normalizeIdentity(identity);
  const gatewayState = opts.gatewayState || { active: false, degradedAt: null };
  const transcriptState = opts.transcriptState || { active: false, degradedAt: null };
  const maxPolls = Math.max(1, Number.isFinite(opts.maxPolls) ? Math.trunc(opts.maxPolls) : 3);
  const pollMs = Math.max(0, Number.isFinite(opts.pollMs) ? Math.trunc(opts.pollMs) : 250);

  let monitorState = opts.monitorState || {};
  let monitor = monitorState;

  for (let poll = 0; poll < maxPolls; poll += 1) {
    monitor = await getAcpMonitorState({
      config,
      sessionLabelOrKey,
      previousState: monitorState,
      streamLogPath: opts.streamLogPath || null,
    });
    monitorState = monitor;

    const data = buildObservabilityData(normalizedIdentity, monitor);
    updateGatewayObservability(ctx, gatewayState, data);
    updateTranscriptObservability(ctx, transcriptState, data);

    if (!gatewayState.active && !transcriptState.active) {
      break;
    }

    if (poll + 1 >= maxPolls) {
      break;
    }

    if (pollMs > 0) {
      await sleep(pollMs);
    }
  }

  return { monitor, gatewayState, transcriptState };
}
