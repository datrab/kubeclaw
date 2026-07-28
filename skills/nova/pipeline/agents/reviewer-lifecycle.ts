import { resolvePolicy } from '../core/policy.ts';
import { log } from '../core/logger.ts';
import { buildDiscordIdentitySurfaceFields, DISCORD_IDENTITY_SURFACES } from '../services/discord-fields.ts';
import { discord } from '../integrations/discord.ts';
import { reaperAfterKill } from './shutdown.ts';
import { modelToHarness, resolveRuntime } from './runtime.ts';
import { getTrackedAgent, spawnSession, trackAgent, untrackAgent } from './lifecycle.ts';
import { prepareObservedAgentSpawn, spawnObservedAgentSession } from './spawn-observability.ts';
import { terminateSession } from './session-termination.ts';
import {
  assertRequiredAgentStartupEvidence,
  createAgentLifecycleTelemetryReader,
  waitForRequiredAgentStartupEvidence,
} from '../services/agent-observability-required.ts';
import { sessionLifecyclePolicies } from '../core/session-policy.ts';

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
type AnyRecord = Record<string, any>;

function reviewerAgentId(model: string, reviewer: AnyRecord, config: AnyRecord): string | null {
  return selectDefinedValue(() => (selectDefinedValue(() => (selectDefinedValue(() => (modelToHarness(model)), () => (reviewer.agent_id))), () => (config.agents.echo?.acp_agent_id))), () => (null));
}

function reviewerCwd(config: AnyRecord): string {
  return selectDefinedValue(() => (config.agents.echo?.cwd), () => (config.repo_root));
}

function errorDetail(error: AnyRecord): string {
  return typeof error?.message === 'string' && error.message ? error.message : String(error);
}

function reviewerSpawnContext(config: AnyRecord, progress: AnyRecord, gateId: string, reviewer: AnyRecord, opts: AnyRecord) {
  const trackingKey = `echo-${reviewer.label}-${gateId}`;
  const dispatchTs = Date.now();
  const gatewayLabel = `${trackingKey}-${dispatchTs}`;
  const runId = selectTruthyValue(() => (selectTruthyValue(() => (config?._runId), () => (config?.run_id))), () => (null));
  const dispatchId = selectDefinedValue(() => (opts.dispatch_id), () => (`${trackingKey}-dispatch-${dispatchTs}`));
  const model = resolvePolicy(config, progress, 'echo', { scopeModel: reviewer.model }).model;
  if (!model) throw new Error(`Reviewer '${reviewer.label}' requires an explicit model`);
  const agentId = reviewerAgentId(model, reviewer, config);
  if (!agentId) throw new Error(`Reviewer '${reviewer.label}' requires explicit agent id in reviewer.agent_id or config.agents.echo.acp_agent_id`);
  const cwd = reviewerCwd(config);
  const thinkingLevel = selectTruthyValue(() => (selectTruthyValue(() => (opts.thinking), () => (reviewer.thinking_level))), () => (null));
  const runtime = resolveRuntime({ runtime: reviewer.dispatch, model });
  const useSubagent = runtime === 'subagent';
  const { telemetryIdentity, startupEvidenceReader } = prepareObservedAgentSpawn(config, {
    runId, agentType: 'echo', moduleId: null, gateId,
    gateType: opts.gate_type, attempt: opts.attempt, dispatchId, gatewayLabel,
  }, opts.agentLifecycleReader);
  return {
    config, gateId, reviewer, opts, trackingKey, gatewayLabel, runId, dispatchId,
    model, agentId, cwd, thinkingLevel, runtime, useSubagent, telemetryIdentity,
    startupEvidenceReader,
  };
}

async function recordReviewerSpawn(context: AnyRecord, sessionData: AnyRecord) {
  const {
    config, gateId, reviewer, opts, trackingKey, gatewayLabel, runId, dispatchId,
    model, agentId, useSubagent, telemetryIdentity, startupEvidenceReader,
  } = context;
  log('OK', `Reviewer spawned: ${gatewayLabel} → ${sessionData.childSessionKey}${sessionData.streamLogPath ? ` (stream: ${sessionData.streamLogPath})` : ''}`, { agent: agentId, model, reviewer: reviewer.label, sessionKey: sessionData.childSessionKey, runId: sessionData.runId, dispatchId, stream: sessionData.streamLogPath });
  trackAgent(config, trackingKey, sessionData.childSessionKey, agentId, gatewayLabel, sessionData.streamLogPath, {
    model,
    runtime: useSubagent ? 'subagent' : 'acp',
    moduleId: gateId,
    run_id: runId,
    attempt: selectDefinedValue(() => (opts.attempt), () => (null)),
    dispatch_id: dispatchId,
    telemetry_module_id: null,
    telemetry_gate_id: gateId,
    telemetry_gate_type: selectTruthyValue(() => (opts.gate_type), () => (null)),
    telemetry_attempt: selectDefinedValue(() => (opts.attempt), () => (null)),
    telemetry_dispatch_id: dispatchId,
    reviewer_label: selectTruthyValue(() => (reviewer.label), () => (null)),
  });
  const evidenceIdentity = { ...telemetryIdentity, session_key: sessionData.childSessionKey };
  assertRequiredAgentStartupEvidence(await waitForRequiredAgentStartupEvidence(config, evidenceIdentity, {
    reader: startupEvidenceReader,
    timeoutMs: opts.agentObservabilityStartupTimeoutMs,
  }), evidenceIdentity);
  void discord(config, 'INFO', `🔬 Reviewer Spawned: ${reviewer.label}/${gateId}`, 'Echo reviewer is now working.', buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.LIFECYCLE, {
    runId, gateId, gateType: opts.gate_type ?? null, attempt: opts.attempt ?? null,
    dispatchId, gatewayLabel, sessionKey: sessionData.childSessionKey,
  }, [
    { name: 'Reviewer', value: reviewer.label, inline: true },
    { name: 'Model', value: model, inline: true },
    { name: 'Agent', value: agentId, inline: true },
  ]), { correlation: {
    run_id: runId, gate_id: gateId, gate_type: opts.gate_type ?? null,
    attempt: opts.attempt ?? null, dispatch_id: dispatchId,
    gateway_label: gatewayLabel, session_key: sessionData.childSessionKey,
  } }).catch((error: any) => {
    log('DEBUG', `Reviewer spawn Discord notice failed for ${gatewayLabel}: ${errorDetail(error)}`);
  });
  return { label: trackingKey, childSessionKey: sessionData.childSessionKey, runId, dispatchId, streamLogPath: sessionData.streamLogPath };
}

function reportReviewerSpawnFailure(context: AnyRecord, error: AnyRecord): never {
  const { config, gateId, reviewer, opts, gatewayLabel, runId, dispatchId, startupEvidenceReader } = context;
  startupEvidenceReader.close?.();
  void discord(
    config,
    'CRITICAL',
    `❌ Reviewer Spawn Failed: ${gateId}`,
    `${reviewer.label}: ${error.message?.split('\n')[0] ?? 'missing_error_message'}`,
    buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.LIFECYCLE, {
      runId, gateId, gateType: opts.gate_type ?? null, attempt: opts.attempt ?? null,
      dispatchId, gatewayLabel,
    }),
    { correlation: {
      run_id: runId, gate_id: gateId, gate_type: opts.gate_type ?? null,
      attempt: opts.attempt ?? null, dispatch_id: dispatchId, gateway_label: gatewayLabel,
    } },
  ).catch((discordError: any) => {
    log('DEBUG', `Reviewer spawn failure Discord notice failed for ${gatewayLabel}: ${errorDetail(discordError)}`);
  });
  const wrapped: AnyRecord = new Error(`Failed to spawn reviewer '${gatewayLabel}': ${error.message}`);
  wrapped.gateway_label = gatewayLabel;
  throw wrapped;
}

export async function spawnReviewerAgent(
  config: AnyRecord,
  progress: AnyRecord,
  gateId: string,
  reviewer: AnyRecord,
  instructions: string,
  opts: AnyRecord = {},
) {
  const context = reviewerSpawnContext(config, progress, gateId, reviewer, opts);
  try {
    const sessionData = await spawnObservedAgentSession(
      config,
      {
        model: context.model,
        runtime: context.runtime,
        agentId: context.agentId,
        cwd: context.cwd,
        label: context.gatewayLabel,
      },
      instructions,
      reviewer?.timeout_seconds,
      context.telemetryIdentity,
      { ...opts, thinking: context.thinkingLevel },
    );
    return await recordReviewerSpawn(context, sessionData);
  } catch (e: any) {
    return reportReviewerSpawnFailure(context, e);
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
    model: selectTruthyValue(() => (entry?.model), () => (null)),
    agentId: entry.agentId,
    label: entry.gatewayLabel,
    cleanup: async () => reaperAfterKill(selectDefinedValue(() => (entry.agentId), () => ('reviewer')), sessionKey, entry.gatewayLabel),
  });
  if (termination.confirmed) {
    untrackAgent(label);
    log('OK', `Reviewer session destroyed: ${label}`);
  } else {
    log(graceful ? 'DEBUG' : 'WARN', `Reviewer session not fully reconciled after stop: ${label} (${termination.state})`);
  }
  return termination.confirmed;
}
