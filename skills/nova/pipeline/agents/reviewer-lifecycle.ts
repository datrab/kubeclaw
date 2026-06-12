import { resolvePolicy } from '../core/config.ts';
import { log, getActiveContext } from '../core/logger.ts';
import { onAgentKilled, onAgentSpawned } from '../services/telemetry.ts';
import { buildDiscordIdentitySurfaceFields, DISCORD_IDENTITY_SURFACES } from '../services/discord-fields.ts';
import { discord } from '../integrations/discord.ts';
import { reaperAfterKill } from './shutdown.ts';
import { waitForSessionIdle } from './acp-monitor.ts';
import { modelToHarness, resolveRuntime } from './runtime.ts';
import { getTrackedAgent, spawnSession, trackAgent, untrackAgent } from './lifecycle.ts';
import { terminateSession } from './session-termination.ts';
import {
  buildKillTelemetryPayload,
  buildSpawnTelemetryPayload,
} from './orchestration-lifecycle-events.ts';

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
  const agentId = modelToHarness(model) || reviewer.agent_id || 'claude';
  const cwd = config.agents.echo?.cwd || config.repo_root;
  const thinkingLevel = opts.thinking || reviewer.thinking_level || null;
  const runtime = resolveRuntime({ runtime: reviewer.dispatch, model });
  const useSubagent = runtime === 'subagent';
  try {
    const sessionData = await spawnSession({
      session: { model, runtime, agentId, cwd, label: gatewayLabel },
    }, instructions, reviewer?.timeout_seconds || null, {
      runtime,
      model,
      agentId,
      cwd,
      label: gatewayLabel,
      thinking: thinkingLevel,
      trackActive: false,
      budget: opts.budget || null,
      signal: opts.signal || null,
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
    try {
      const _ctx = getActiveContext() || { config };
      onAgentSpawned(_ctx, 'echo', buildSpawnTelemetryPayload({
        label: gatewayLabel,
        model,
        dispatch: useSubagent ? 'subagent' : 'acp',
        moduleId: null,
        gateId,
        gateType: opts.gate_type || null,
        attempt: opts.attempt ?? null,
        dispatchId,
        timeoutSeconds: reviewer?.timeout_seconds || null,
        sessionKey: sessionData.childSessionKey,
        thinkingLevel,
      }));
    } catch (e: any) {
      log('DEBUG', `Reviewer spawn telemetry failed for ${gatewayLabel}: ${e?.message || e}`);
    }
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
  if (graceful) {
    log('INFO', `Waiting for reviewer session to become idle: ${label}`);
    await waitForSessionIdle(sessionKey, { ...config.acp_monitor, streamLogPath: entry?.streamLogPath || null });
  }
  log('STEP', `Destroying reviewer session: ${label} (${sessionKey})`);
  const runtime = entry?.runtime;
  const termination = await terminateSession(sessionKey, {
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
  try {
    const _ctx = getActiveContext() || { config };
    onAgentKilled(_ctx, 'echo', buildKillTelemetryPayload({
      entry,
      fallbackLabel: label,
      fallbackModuleId: null,
      fallbackGateId: gateId,
    }));
  } catch (e: any) {
    log('DEBUG', `Reviewer kill telemetry failed for ${label}: ${e?.message || e}`);
  }
  return termination.confirmed;
}
