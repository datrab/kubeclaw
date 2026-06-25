import { resolvePolicy } from '../core/config.ts';
import { log } from '../core/logger.ts';
import { buildDiscordIdentitySurfaceFields, DISCORD_IDENTITY_SURFACES } from '../services/discord-fields.ts';
import { discord } from '../integrations/discord.ts';
import { reaperAfterKill } from './shutdown.ts';
import { modelToHarness, resolveRuntime } from './runtime.ts';
import { getTrackedAgent, spawnSession, trackAgent, untrackAgent } from './lifecycle.ts';
import { terminateSession } from './session-termination.ts';
import {
  assertRequiredAgentStartupEvidence,
  createAgentLifecycleTelemetryReader,
  waitForRequiredAgentStartupEvidence,
} from '../services/agent-observability-required.ts';
import { sessionLifecyclePolicies } from '../core/session-policy.ts';

type AnyRecord = Record<string, any>;

export async function spawnReviewerAgent(
  config: AnyRecord,
  progress: AnyRecord,
  gateId: string,
  reviewer: AnyRecord,
  instructions: string,
  opts: AnyRecord = {},
) {
  const trackingKey = `echo-${reviewer.label}-${gateId}`;
  const dispatchTs = Date.now();
  const gatewayLabel = `${trackingKey}-${dispatchTs}`;
  const runId = config?._runId || config?.run_id || null;
  const dispatchId = opts.dispatch_id || `${trackingKey}-dispatch-${dispatchTs}`;
  const model = resolvePolicy(config, progress, 'echo', { scopeModel: reviewer.model }).model;
  const agentId = modelToHarness(model) || reviewer.agent_id || config.agents.echo?.acp_agent_id;
  if (!agentId) throw new Error(`Reviewer '${reviewer.label}' requires explicit agent id in reviewer.agent_id or config.agents.echo.acp_agent_id`);
  const cwd = config.agents.echo?.cwd || config.repo_root;
  const thinkingLevel = opts.thinking || reviewer.thinking_level || null;
  const runtime = resolveRuntime({ runtime: reviewer.dispatch, model });
  const useSubagent = runtime === 'subagent';
  const telemetryIdentity = {
    run_id: runId,
    project: config?.project || null,
    agent_type: 'echo',
    module_id: null,
    gate_id: gateId,
    gate_type: opts.gate_type || null,
    attempt: opts.attempt ?? null,
    dispatch_id: dispatchId,
    gateway_label: gatewayLabel,
  };
  const startupEvidenceReader = createAgentLifecycleTelemetryReader(config, {
    runId,
    startId: '0-0',
    ...(opts.agentLifecycleReader ? { reader: opts.agentLifecycleReader } : {}),
  });
  try {
    const sessionData = await spawnSession({
      session: { model, runtime, agentId, cwd, label: gatewayLabel },
    }, instructions, reviewer?.timeout_seconds || null, {
      ...sessionLifecyclePolicies(config),
      runtime,
      model,
      agentId,
      cwd,
      label: gatewayLabel,
      thinking: thinkingLevel,
      trackActive: false,
      budget: opts.budget || null,
      signal: opts.signal || null,
      observabilityIdentity: telemetryIdentity,
    });
    log('OK', `Reviewer spawned: ${gatewayLabel} → ${sessionData.childSessionKey}${sessionData.streamLogPath ? ` (stream: ${sessionData.streamLogPath})` : ''}`, { agent: agentId, model, reviewer: reviewer.label, sessionKey: sessionData.childSessionKey, runId: sessionData.runId, dispatchId, stream: sessionData.streamLogPath });
    trackAgent(config, trackingKey, sessionData.childSessionKey, agentId, gatewayLabel, sessionData.streamLogPath, {
      model,
      runtime: useSubagent ? 'subagent' : 'acp',
      moduleId: gateId,
      run_id: runId,
      attempt: opts.attempt ?? null,
      dispatch_id: dispatchId,
      telemetry_module_id: null,
      telemetry_gate_id: gateId,
      telemetry_gate_type: opts.gate_type || null,
      telemetry_attempt: opts.attempt ?? null,
      telemetry_dispatch_id: dispatchId,
      reviewer_label: reviewer.label || null,
    });
    assertRequiredAgentStartupEvidence(await waitForRequiredAgentStartupEvidence(config, {
      ...telemetryIdentity,
      session_key: sessionData.childSessionKey,
    }, {
      reader: startupEvidenceReader,
      timeoutMs: opts.agentObservabilityStartupTimeoutMs,
    }), {
      ...telemetryIdentity,
      session_key: sessionData.childSessionKey,
    });
    const spawnDiscordCorrelation = {
      run_id: runId,
      gate_id: gateId,
      gate_type: opts.gate_type || null,
      attempt: opts.attempt ?? null,
      dispatch_id: dispatchId,
      gateway_label: gatewayLabel,
      session_key: sessionData.childSessionKey,
    };
    discord(config, 'INFO', `🔬 Reviewer Spawned: ${reviewer.label}/${gateId}`, 'Echo reviewer is now working.', buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.LIFECYCLE, {
      runId,
      gateId,
      gateType: opts.gate_type || null,
      attempt: opts.attempt ?? null,
      dispatchId,
      gatewayLabel,
      sessionKey: sessionData.childSessionKey,
    }, [
      { name: 'Reviewer', value: reviewer.label, inline: true },
      { name: 'Model', value: model, inline: true },
      { name: 'Agent', value: agentId, inline: true },
    ]), { correlation: spawnDiscordCorrelation }).catch((e) => {
      log('DEBUG', `Reviewer spawn Discord notice failed for ${gatewayLabel}: ${e?.message || e}`);
    });
    return { label: trackingKey, childSessionKey: sessionData.childSessionKey, runId, dispatchId, streamLogPath: sessionData.streamLogPath };
  } catch (e: any) {
    startupEvidenceReader.close?.();
    const spawnFailureDiscordCorrelation = {
      run_id: runId,
      gate_id: gateId,
      gate_type: opts.gate_type || null,
      attempt: opts.attempt ?? null,
      dispatch_id: dispatchId,
      gateway_label: gatewayLabel,
    };
    discord(config, 'CRITICAL', `❌ Reviewer Spawn Failed: ${gateId}`, `${reviewer.label}: ${e.message?.split('\n')[0] || 'unknown'}`,
      buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.LIFECYCLE, {
        runId,
        gateId,
        gateType: opts.gate_type || null,
        attempt: opts.attempt ?? null,
        dispatchId,
        gatewayLabel,
      }),
      { correlation: spawnFailureDiscordCorrelation },
    ).catch((discordError) => {
      log('DEBUG', `Reviewer spawn failure Discord notice failed for ${gatewayLabel}: ${discordError?.message || discordError}`);
    });
    const err: AnyRecord = new Error(`Failed to spawn reviewer '${gatewayLabel}': ${e.message}`);
    err.gateway_label = gatewayLabel;
    throw err;
  }
}

export async function killReviewerAgent(
  config: AnyRecord,
  gateId: string,
  reviewer: AnyRecord,
  graceful: boolean = false,
) {
  const label = `echo-${reviewer.label}-${gateId}`;
  const entry = getTrackedAgent(label);
  const sessionKey = entry?.sessionKey;
  if (!sessionKey) {
    log('WARN', `No sessionKey for reviewer '${label}' — skipping kill`);
    untrackAgent(label);
    return false;
  }
  log('STEP', `Destroying reviewer session: ${label} (${sessionKey})`);
  const runtime = entry?.runtime;
  const termination = await terminateSession(sessionKey, {
    ...sessionLifecyclePolicies(config),
    runtime,
    model: entry?.model || null,
    agentId: entry.agentId,
    label: entry.gatewayLabel,
    cleanup: async () => reaperAfterKill(entry.agentId || 'reviewer', sessionKey, entry.gatewayLabel),
  });
  if (termination.confirmed) {
    untrackAgent(label);
    log('OK', `Reviewer session destroyed: ${label}`);
  } else {
    log('WARN', `Reviewer session not fully reconciled after stop: ${label} (${termination.state})`);
  }
  return termination.confirmed;
}
