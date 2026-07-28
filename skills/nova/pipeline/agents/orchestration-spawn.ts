import { log } from '../core/logger.ts';
import { discord } from '../integrations/discord.ts';
import { buildDiscordIdentitySurfaceFields, DISCORD_IDENTITY_SURFACES } from '../services/discord-fields.ts';
import { assertRequiredAgentStartupEvidence, waitForRequiredAgentStartupEvidence } from '../services/agent-observability-required.ts';
import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
import { telemetryModuleId } from './orchestration-lifecycle-events.ts';
import { prepareObservedAgentSpawn, spawnObservedAgentSession } from './spawn-observability.ts';
import { resolveRuntime } from './runtime.ts';
import { trackAgent } from './lifecycle.ts';
import {
  acpLabel,
  captureBaselineFiles,
  displayAgentRole,
  errorMessage,
  reasoningLevelValue,
  requiredAcpAgentId,
  requiredAgentCwd,
  requiredCanonicalModelId,
} from './orchestration-values.ts';
import type { AnyRecord } from './orchestration-values.ts';

function createSpawnContext(
  config: AnyRecord,
  agentType: string,
  moduleId: string,
  model: string,
  opts: AnyRecord,
): AnyRecord {
  const agentConfig = config.agents[agentType];
  const resolvedModel = requiredCanonicalModelId(model, `Agent '${agentType}' model`);
  const trackingKey = selectTruthyValue(() => opts.trackingLabel, () => acpLabel(agentType, moduleId));
  const dispatchTs = Date.now();
  const gatewayLabel = `${trackingKey}-${dispatchTs}`;
  const runId = selectTruthyValue(
    () => (opts.run_id),
    () => (selectTruthyValue(() => (config?._runId), () => (selectTruthyValue(() => (config?.run_id), () => (null))))),
  );
  const dispatchId = selectTruthyValue(() => opts.dispatch_id, () => `${trackingKey}-dispatch-${dispatchTs}`);
  const runtime = agentConfig.dispatch === 'acp' ? 'acp' : resolveRuntime({ model: resolvedModel });
  const context: AnyRecord = {
    config,
    agentType,
    moduleId,
    opts,
    agentConfig,
    resolvedModel,
    trackingKey,
    gatewayLabel,
    runId,
    dispatchId,
    agentId: requiredAcpAgentId(agentConfig, agentType),
    cwd: requiredAgentCwd(agentConfig, config, agentType, opts),
    runtime,
    useSubagent: runtime === 'subagent',
    thinkingLevel: selectTruthyValue(() => (opts.thinking), () => (null)),
    thinkingSource: selectTruthyValue(
      () => (opts.thinking_source),
      () => (selectTruthyValue(() => (opts.thinkingSource), () => (null))),
    ),
  };
  const observed = prepareObservedAgentSpawn(config, {
    runId,
    agentType,
    moduleId: telemetryModuleId(opts, moduleId),
    gateId: opts.gate_id,
    gateType: opts.gate_type,
    attempt: opts.attempt,
    dispatchId,
    gatewayLabel,
  }, opts.agentLifecycleReader);
  return { ...context, ...observed } as AnyRecord;
}

function correlation(context: AnyRecord, sessionKey: string | null = null) {
  return {
    run_id: context.runId,
    module_id: telemetryModuleId(context.opts, context.moduleId),
    gate_id: selectTruthyValue(() => (context.opts.gate_id), () => (null)),
    gate_type: selectTruthyValue(() => (context.opts.gate_type), () => (null)),
    attempt: selectDefinedValue(() => (context.opts.attempt), () => (null)),
    dispatch_id: context.dispatchId,
    gateway_label: context.gatewayLabel,
    session_key: sessionKey,
  };
}

function trackSpawn(context: AnyRecord, sessionData: AnyRecord) {
  trackAgent(
    context.config,
    context.trackingKey,
    sessionData.childSessionKey,
    context.agentId,
    context.gatewayLabel,
    sessionData.streamLogPath,
    {
      model: context.resolvedModel,
      runtime: context.useSubagent ? 'subagent' : 'acp',
      moduleId: context.moduleId,
      run_id: context.runId,
      attempt: selectDefinedValue(() => (context.opts.attempt), () => (null)),
      dispatch_id: context.dispatchId,
      telemetry_module_id: telemetryModuleId(context.opts, context.moduleId),
      telemetry_gate_id: selectTruthyValue(() => (context.opts.gate_id), () => (null)),
      telemetry_gate_type: selectTruthyValue(() => (context.opts.gate_type), () => (null)),
      telemetry_attempt: selectDefinedValue(() => (context.opts.attempt), () => (null)),
      telemetry_dispatch_id: context.dispatchId,
      telemetry_substep: selectTruthyValue(() => (context.opts.substep), () => (null)),
      telemetry_thinking: context.thinkingLevel,
      telemetry_thinking_source: context.thinkingSource,
    },
  );
  captureBaselineFiles(context.trackingKey, context.cwd);
}

async function verifySpawnEvidence(context: AnyRecord, sessionData: AnyRecord) {
  const identity = { ...context.telemetryIdentity, session_key: sessionData.childSessionKey };
  const evidence = await waitForRequiredAgentStartupEvidence(context.config, identity, {
    reader: context.startupEvidenceReader,
    timeoutMs: context.opts.agentObservabilityStartupTimeoutMs,
  });
  assertRequiredAgentStartupEvidence(evidence, identity);
}

function notifySpawn(context: AnyRecord, sessionData: AnyRecord) {
  const runtime = context.useSubagent ? 'subagent' : 'acp';
  const fields = buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.LIFECYCLE, {
    runId: context.runId,
    moduleId: telemetryModuleId(context.opts, context.moduleId),
    gateId: selectTruthyValue(() => (context.opts.gate_id), () => (null)),
    gateType: selectTruthyValue(() => (context.opts.gate_type), () => (null)),
    attempt: selectDefinedValue(() => (context.opts.attempt), () => (null)),
    dispatchId: context.dispatchId,
    gatewayLabel: context.gatewayLabel,
    sessionKey: sessionData.childSessionKey,
    model: context.resolvedModel,
    reasoningLevel: reasoningLevelValue(context.thinkingLevel),
    thinkingSource: context.thinkingSource,
    runtime,
  }, [{ name: 'Agent', value: context.agentId, inline: true }]);
  void discord(
    context.config,
    'INFO',
    `🔬 ${displayAgentRole(context.agentType)} ${context.useSubagent ? 'Subagent' : 'ACP'} Session Spawned: ${context.agentType}/${context.moduleId}`,
    'Agent is now working.',
    fields,
    { correlation: correlation(context, sessionData.childSessionKey) },
  ).catch((error: unknown) => {
    log('DEBUG', `Agent spawn Discord notice failed for ${context.gatewayLabel}: ${errorMessage(error)}`);
  });
}

function spawnResult(context: AnyRecord, sessionData: AnyRecord) {
  return {
    label: context.trackingKey,
    childSessionKey: sessionData.childSessionKey,
    runId: context.runId,
    dispatchId: context.dispatchId,
    streamLogPath: sessionData.streamLogPath,
    session_key: sessionData.childSessionKey,
    stream_log_path: selectTruthyValue(() => (sessionData.streamLogPath), () => (null)),
    gateway_label: context.gatewayLabel,
    dispatch_id: context.dispatchId,
    run_id: context.runId,
    runtime: context.useSubagent ? 'subagent' : 'acp',
    model: context.resolvedModel,
    model_source: selectDefinedValue(() => (context.opts.model_source), () => (null)),
    reasoning_level: selectTruthyValue(() => (context.thinkingLevel), () => (null)),
    thinking_source: context.thinkingSource,
    agent_id: context.agentId,
  };
}

function notifySpawnFailure(context: AnyRecord, error: any) {
  const fields = buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.LIFECYCLE, {
    runId: context.runId,
    moduleId: telemetryModuleId(context.opts, context.moduleId),
    gateId: selectTruthyValue(() => (context.opts.gate_id), () => (null)),
    gateType: selectTruthyValue(() => (context.opts.gate_type), () => (null)),
    attempt: selectDefinedValue(() => (context.opts.attempt), () => (null)),
    dispatchId: context.dispatchId,
    gatewayLabel: context.gatewayLabel,
  });
  void discord(
    context.config,
    'CRITICAL',
    `❌ Spawn Failed: ${context.agentType}/${context.moduleId}`,
    error.message?.split('\n')[0] || 'missing_error_message',
    fields,
    { correlation: correlation(context) },
  ).catch((discordError: unknown) => {
    log('DEBUG', `Agent spawn failure Discord notice failed for ${context.gatewayLabel}: ${errorMessage(discordError)}`);
  });
}

export async function spawnAcpAgent(
  config: AnyRecord,
  agentType: string,
  moduleId: string,
  model: string,
  taskPrompt: string,
  opts: AnyRecord = {},
) {
  const context = createSpawnContext(config, agentType, moduleId, model, opts);
  try {
    const sessionData = await spawnObservedAgentSession(
      config,
      {
        model: context.resolvedModel,
        runtime: context.runtime,
        agentId: context.agentId,
        cwd: context.cwd,
        label: context.gatewayLabel,
      },
      taskPrompt,
      context.agentConfig?.timeout_seconds,
      context.telemetryIdentity,
      { ...opts, thinking: context.thinkingLevel },
    );
    log('OK', `${context.useSubagent ? 'Subagent' : 'ACP'} session spawned: ${context.gatewayLabel} → ${sessionData.childSessionKey}`);
    trackSpawn(context, sessionData);
    await verifySpawnEvidence(context, sessionData);
    notifySpawn(context, sessionData);
    return spawnResult(context, sessionData);
  } catch (error: any) {
    context.startupEvidenceReader.close?.();
    notifySpawnFailure(context, error);
    const failure: AnyRecord = new Error(`Failed to spawn session '${context.gatewayLabel}': ${error.message}`);
    if (error?.code) failure.code = error.code;
    if (error?.gatewayStatus) failure.gatewayStatus = error.gatewayStatus;
    failure.gateway_label = context.gatewayLabel;
    throw failure;
  }
}
